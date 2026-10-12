import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ErrorCode } from "@lp/contracts";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  type CommandResult,
  createAggregate,
  executeCommand,
  lockDeal,
} from "./commands";
import type { Pool } from "./index";
import { isPaused } from "./ops";

const INVOICE_HOURS = 24;
const PROVIDER = "mock";
const SYSTEM = { kind: "system", name: "mock-payment-adapter" } as const;

type Failure<E extends ErrorCode> = { ok: false; error: E };
const fail = <E extends ErrorCode>(error: E): Failure<E> => ({
  ok: false,
  error,
});

type Account =
  | "mock_clearing"
  | "held"
  | "reserved"
  | "seller_paid"
  | "buyer_refunded"
  | "fee_collected"
  | "unapplied";

// Posts one balanced entry. Returns false when this economic fact (`ref`) is
// already recorded, which makes every posting idempotent (INV-04).
export async function postEntry(
  client: PoolClient,
  input: {
    dealId: string;
    kind: string;
    ref: string;
    debit: Account;
    credit: Account;
    amountMinor: bigint;
  },
): Promise<boolean> {
  const entry = await client.query(
    `insert into journal_entry (deal_id, kind, ref) values ($1, $2, $3)
     on conflict (ref) do nothing returning id`,
    [input.dealId, input.kind, input.ref],
  );
  if (entry.rowCount !== 1) return false;
  await client.query(
    `insert into journal_line (entry_id, line_no, account, debit_minor, credit_minor)
     values ($1, 1, $2, $4, 0), ($1, 2, $3, 0, $4)`,
    [entry.rows[0].id, input.debit, input.credit, input.amountMinor.toString()],
  );
  return true;
}

export type Balances = {
  received: bigint;
  held: bigint;
  reserved: bigint;
  sellerPaid: bigint;
  buyerRefunded: bigint;
  fees: bigint;
  unapplied: bigint;
  // D.4: everything received is in exactly one of the buckets above.
  conserved: boolean;
};

// Always computed from the journal. There is no stored balance to drift.
export async function dealBalances(
  pool: Pool,
  dealId: string,
): Promise<Balances> {
  const { rows } = await pool.query(
    `select l.account,
       coalesce(sum(l.debit_minor), 0)::text as debit,
       coalesce(sum(l.credit_minor), 0)::text as credit
     from journal_line l join journal_entry e on e.id = l.entry_id
     where e.deal_id = $1 group by l.account`,
    [dealId],
  );
  const net = (account: Account, side: "debit" | "credit") => {
    const row = rows.find((r) => r.account === account);
    if (!row) return 0n;
    const debit = BigInt(row.debit);
    const credit = BigInt(row.credit);
    return side === "debit" ? debit - credit : credit - debit;
  };
  const balances = {
    received: net("mock_clearing", "debit"),
    held: net("held", "credit"),
    reserved: net("reserved", "credit"),
    sellerPaid: net("seller_paid", "credit"),
    buyerRefunded: net("buyer_refunded", "credit"),
    fees: net("fee_collected", "credit"),
    unapplied: net("unapplied", "credit"),
  };
  const parts = [
    balances.held,
    balances.reserved,
    balances.sellerPaid,
    balances.buyerRefunded,
    balances.fees,
    balances.unapplied,
  ];
  return {
    ...balances,
    conserved:
      parts.every((p) => p >= 0n) &&
      parts.reduce((a, b) => a + b, 0n) === balances.received,
  };
}

// B5 step 4: the buyer pays first. The invoice is bound to the exact accepted
// agreement version, amount and currency.
export async function createInvoice(
  pool: Pool,
  userId: string,
  dealId: string,
): Promise<
  | { ok: true; invoiceId: string }
  | Failure<
      | "NOT_AUTHORIZED"
      | "ILLEGAL_TRANSITION"
      | "REVIEWER_NOT_ASSIGNED"
      | "PAUSED"
    >
> {
  if (!z.uuid().safeParse(dealId).success) return fail("NOT_AUTHORIZED");
  // D.13: an operator has paused new funding. Existing deals are untouched.
  if (await isPaused(pool, "funding")) return fail("PAUSED");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const done = async <T>(value: T, commit = false) => {
      await client.query(commit ? "commit" : "rollback");
      return value;
    };
    if (!(await lockDeal(client, dealId))) return done(fail("NOT_AUTHORIZED"));
    const party = await client.query(
      "select role from deal_party where deal_id = $1 and user_id = $2",
      [dealId, userId],
    );
    if (party.rows[0]?.role !== "buyer") return done(fail("NOT_AUTHORIZED"));

    const agreement = await client.query(
      `select a.id, a.state, v.version_no, v.terms_hash, v.terms
       from aggregate a
       join lateral (select * from agreement_version where agreement_id = a.id
                     order by version_no desc limit 1) v on true
       where a.deal_id = $1 and a.type = 'agreement'`,
      [dealId],
    );
    const row = agreement.rows[0];
    if (row?.state !== "ACCEPTED") return done(fail("ILLEGAL_TRANSITION"));
    // B2: a human-from-start deal needs its reviewer before any money moves.
    if (row.terms.mode === "human_from_start") {
      const reviewer = await client.query(
        "select 1 from deal_reviewer where deal_id = $1",
        [dealId],
      );
      if (reviewer.rowCount !== 1) return done(fail("REVIEWER_NOT_ASSIGNED"));
    }
    const existing = await client.query(
      "select invoice_id from funding_invoice where deal_id = $1 and active",
      [dealId],
    );
    if (existing.rows[0]) {
      return done({
        ok: true as const,
        invoiceId: existing.rows[0].invoice_id,
      });
    }
    const invoiceId = await createAggregate(client, {
      type: "funding_invoice",
      dealId,
    });
    await client.query(
      `insert into funding_invoice (invoice_id, deal_id, agreement_id,
         agreement_version_no, terms_hash, amount_minor, currency, payer_id, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(hours => $9))`,
      [
        invoiceId,
        dealId,
        row.id,
        row.version_no,
        row.terms_hash,
        row.terms.amountMinor,
        row.terms.currency,
        userId,
        INVOICE_HOURS,
      ],
    );
    return done({ ok: true as const, invoiceId }, true);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// FundTestDeal: the buyer starts a payment with the synthetic provider. This
// does not fund anything. Only an authenticated provider event can (INV-02).
export function startFunding(
  pool: Pool,
  environment: string,
  input: { userId: string; invoiceId: string; envelope: unknown },
  paymentMode = "mock",
): Promise<CommandResult> {
  // INV-15: no real transfer can start from here.
  if (paymentMode !== "mock")
    return Promise.resolve(fail("TEST_MODE_REQUIRED"));
  return executeCommand(pool, {
    environment,
    actor: { kind: "user", userId: input.userId },
    aggregateId: input.invoiceId,
    command: "FundTestDeal",
    envelope: input.envelope,
    apply: async (client, { aggregate }) => {
      const { rows } = await client.query(
        `select f.amount_minor, f.currency, f.expires_at > now() as live, a.state
         from funding_invoice f join aggregate a on a.id = f.agreement_id
         where f.invoice_id = $1`,
        [aggregate.id],
      );
      const invoice = rows[0];
      if (await isPaused(client, "funding")) return { error: "PAUSED" };
      if (invoice.state !== "ACCEPTED") return { error: "ILLEGAL_TRANSITION" };
      if (!invoice.live) return { error: "INVOICE_EXPIRED" };
      const paymentRef = `mockpay_${randomUUID()}`;
      await client.query(
        "update funding_invoice set provider_payment_ref = $1 where invoice_id = $2",
        [paymentRef, aggregate.id],
      );
      await client.query(
        "insert into mock_payment (payment_ref, invoice_id, expected_minor, currency) values ($1, $2, $3, $4)",
        [paymentRef, aggregate.id, invoice.amount_minor, invoice.currency],
      );
      return { event: { paymentRef } };
    },
  });
}

// The synthetic provider signs its events the way a real one would.
export const signMockEvent = (rawBody: string, secret: string) =>
  createHmac("sha256", secret).update(rawBody).digest("hex");

const paymentEvent = z.object({
  eventId: z.string().min(1).max(200),
  type: z.literal("payment.succeeded"),
  paymentRef: z.string().min(1).max(200),
  amountMinor: z.string().regex(/^(0|[1-9][0-9]*)$/),
  currency: z.string().min(1).max(10),
});

export type PaymentOutcome =
  | "CONFIRMED"
  | "MISMATCH"
  | "UNSUPPORTED_CURRENCY"
  | "UNAPPLIED_LATE"
  | "DUPLICATE_EVENT"
  | "DUPLICATE_PAYMENT"
  | "UNMATCHED";

// D.4 webhook rules: authenticate the raw body, store the event durably,
// then process. A repeated event id is acknowledged and ignored.
export async function ingestPaymentEvent(
  pool: Pool,
  environment: string,
  input: { rawBody: string; signature: string; secret: string },
): Promise<
  | { ok: true; outcome: PaymentOutcome }
  | Failure<"NOT_AUTHORIZED" | "VALIDATION_FAILED">
> {
  const expected = Buffer.from(signMockEvent(input.rawBody, input.secret));
  const given = Buffer.from(input.signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return fail("NOT_AUTHORIZED");
  }
  let json: unknown;
  try {
    json = JSON.parse(input.rawBody);
  } catch {
    return fail("VALIDATION_FAILED");
  }
  const parsed = paymentEvent.safeParse(json);
  if (!parsed.success) return fail("VALIDATION_FAILED");
  const event = parsed.data;
  const stored = await pool.query(
    `insert into provider_event (provider, event_id, payment_ref, type, amount_minor, currency)
     values ($1, $2, $3, $4, $5, $6) on conflict do nothing`,
    [
      PROVIDER,
      event.eventId,
      event.paymentRef,
      event.type,
      event.amountMinor,
      event.currency,
    ],
  );
  if (stored.rowCount !== 1) return { ok: true, outcome: "DUPLICATE_EVENT" };
  return {
    ok: true,
    outcome: await processPaymentEvent(pool, environment, event.eventId),
  };
}

const markProcessed = (
  client: PoolClient | Pool,
  eventId: string,
  outcome: PaymentOutcome,
) =>
  client.query(
    "update provider_event set processed_at = now(), outcome = $3 where provider = $1 and event_id = $2",
    [PROVIDER, eventId, outcome],
  );

// Safe to call again for an event that was stored but not finished: every
// effect is keyed by the payment reference, so it happens at most once.
export async function processPaymentEvent(
  pool: Pool,
  environment: string,
  eventId: string,
): Promise<PaymentOutcome> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const found = await pool.query(
      `select e.payment_ref, e.amount_minor::text as amount, e.currency, e.outcome,
         f.invoice_id, f.deal_id, f.amount_minor::text as expected, f.currency as invoice_currency,
         a.state, a.version,
         exists (select 1 from journal_entry j where j.ref = 'payment:' || e.payment_ref) as applied
       from provider_event e
       left join funding_invoice f on f.provider_payment_ref = e.payment_ref
       left join aggregate a on a.id = f.invoice_id
       where e.provider = $1 and e.event_id = $2`,
      [PROVIDER, eventId],
    );
    const row = found.rows[0];
    if (row.outcome) return row.outcome;
    const finish = async (outcome: PaymentOutcome) => {
      await markProcessed(pool, eventId, outcome);
      return outcome;
    };
    if (!row.invoice_id) return finish("UNMATCHED");
    // The same payment under a second event id: one economic effect (V7-06).
    if (row.applied) return finish("DUPLICATE_PAYMENT");

    const ref = `payment:${row.payment_ref}`;
    const amountMinor = BigInt(row.amount);
    const command = (
      name: string,
      outcome: PaymentOutcome,
      credit: Account | null,
    ) =>
      executeCommand(pool, {
        environment,
        actor: SYSTEM,
        aggregateId: row.invoice_id,
        command: name,
        to: name === "ConfirmFunding" ? "CONFIRMED" : undefined,
        envelope: {
          commandId: randomUUID(),
          idempotencyKey: `provider-event:${eventId}`,
          expectedAggregateVersion: row.version,
          payload: { eventId, paymentRef: row.payment_ref },
        },
        apply: async (client, { aggregate }) => {
          if (credit) {
            await postEntry(client, {
              dealId: aggregate.dealId,
              kind:
                credit === "held" ? "funding_confirmed" : "funding_unapplied",
              ref,
              debit: "mock_clearing",
              credit,
              amountMinor,
            });
          }
          if (outcome === "CONFIRMED") {
            // The delivery clock starts when funding is confirmed (B5).
            await client.query(
              `insert into deal_deadline (deal_id, delivery_due_at)
               select f.deal_id,
                 now() + make_interval(hours => (v.terms->'timing'->>'deliveryHours')::int)
               from funding_invoice f
               join agreement_version v on v.agreement_id = f.agreement_id
                 and v.version_no = f.agreement_version_no
               where f.invoice_id = $1
               on conflict (deal_id) do nothing`,
              [aggregate.id],
            );
          }
          await markProcessed(client, eventId, outcome);
          return {};
        },
      });

    if (row.state === "PENDING") {
      const [name, outcome, credit] =
        row.currency !== row.invoice_currency
          ? // No account exists in this currency, so nothing can be posted.
            (["FlagFundingMismatch", "UNSUPPORTED_CURRENCY", null] as const)
          : row.amount === row.expected
            ? (["ConfirmFunding", "CONFIRMED", "held"] as const)
            : (["FlagFundingMismatch", "MISMATCH", "unapplied"] as const);
      const result = await command(name, outcome, credit);
      if (result.ok) return outcome;
      // Lost a race with another event or a timer: look again.
      continue;
    }

    // Expired, cancelled, already confirmed or under reconciliation: the money
    // is real to the provider but cannot fund this deal. Record it as owed back.
    const client = await pool.connect();
    try {
      await client.query("begin");
      await lockDeal(client, row.deal_id);
      const posted =
        row.currency === "BDT" &&
        (await postEntry(client, {
          dealId: row.deal_id,
          kind: "funding_unapplied",
          ref,
          debit: "mock_clearing",
          credit: "unapplied",
          amountMinor,
        }));
      const outcome: PaymentOutcome = posted
        ? "UNAPPLIED_LATE"
        : row.currency === "BDT"
          ? "DUPLICATE_PAYMENT"
          : "UNSUPPORTED_CURRENCY";
      await markProcessed(client, eventId, outcome);
      await client.query("commit");
      return outcome;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  throw new Error(`payment event ${eventId} could not be processed`);
}

// Run by the worker. Deadlines use the database clock (D.3).
export async function expireInvoices(
  pool: Pool,
  environment: string,
): Promise<number> {
  const due = await pool.query(
    `select f.invoice_id, a.version from funding_invoice f
     join aggregate a on a.id = f.invoice_id
     where f.active and f.expires_at <= now() and a.state in ('CREATED', 'PENDING')`,
  );
  let expired = 0;
  for (const row of due.rows) {
    const result = await executeCommand(pool, {
      environment,
      actor: { kind: "system", name: "invoice-timer" },
      aggregateId: row.invoice_id,
      command: "ExpireInvoice",
      envelope: {
        commandId: randomUUID(),
        idempotencyKey: `expire:${row.invoice_id}`,
        expectedAggregateVersion: row.version,
        payload: {},
      },
      apply: async (client, { aggregate }) => {
        await client.query(
          "update funding_invoice set active = false where invoice_id = $1",
          [aggregate.id],
        );
        return {};
      },
    });
    if (result.ok) expired++;
  }
  return expired;
}

export type Funding = {
  invoiceId: string;
  state: string;
  aggregateVersion: number;
  amountMinor: string;
  currency: string;
  paymentRef: string | null;
  expiresAt: Date;
};

// The deal's most recent invoice, or null when none was ever created.
export async function getFunding(
  pool: Pool,
  dealId: string,
): Promise<Funding | null> {
  const { rows } = await pool.query(
    `select f.invoice_id, a.state, a.version, f.amount_minor::text as amount,
       f.currency, f.provider_payment_ref, f.expires_at
     from funding_invoice f join aggregate a on a.id = f.invoice_id
     where f.deal_id = $1 order by f.created_at desc limit 1`,
    [dealId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    invoiceId: row.invoice_id,
    state: row.state,
    aggregateVersion: row.version,
    amountMinor: row.amount,
    currency: row.currency,
    paymentRef: row.provider_payment_ref,
    expiresAt: row.expires_at,
  };
}

// Run by the worker: finishes events that were stored but whose processing
// was interrupted (a crash between the two steps of ingestPaymentEvent).
export async function sweepPaymentEvents(
  pool: Pool,
  environment: string,
): Promise<number> {
  const { rows } = await pool.query(
    `select event_id from provider_event
     where provider = $1 and processed_at is null
       and received_at < now() - interval '30 seconds'
     order by received_at limit 50`,
    [PROVIDER],
  );
  for (const row of rows) {
    await processPaymentEvent(pool, environment, row.event_id);
  }
  return rows.length;
}
