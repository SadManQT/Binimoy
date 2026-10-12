import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  acceptInvite,
  agreementCommand,
  createDeal,
  createInvite,
  getDealView,
} from "./agreements";
import {
  createInvoice,
  dealBalances,
  expireInvoices,
  getFunding,
  ingestPaymentEvent,
  signMockEvent,
  startFunding,
} from "./ledger";
import { migrate } from "./migrate";
import {
  claimOutbox,
  completeOutbox,
  failOutbox,
  MAX_OUTBOX_ATTEMPTS,
} from "./outbox";
import { testPool } from "./testing";

const SECRET = "test-webhook-secret";
const pool = await testPool();
beforeAll(async () => {
  await migrate(pool);
});
afterAll(() => pool.end());

async function newUser(name: string): Promise<string> {
  const { rows } = await pool.query(
    "insert into app_user (name, email) values ($1, $2) returning id",
    [name, `u-${randomUUID()}@example.test`],
  );
  return rows[0].id;
}
const envelope = (version: number, payload = {}) => ({
  commandId: randomUUID(),
  idempotencyKey: `key-${randomUUID()}`,
  expectedAggregateVersion: version,
  payload,
});

// A deal whose agreement both parties have accepted. Amount: 2,500.00 BDT.
async function acceptedDeal(mode = "ai_first") {
  const seller = await newUser("Seller");
  const buyer = await newUser("Buyer");
  const deal = await createDeal(pool, seller, {
    role: "seller",
    templateId: "software_license",
    templateVersion: 1,
    title: "Ledger test",
    mode,
    amountMinor: "250000",
    product: {
      product: "EditorPro",
      edition: "Pro",
      region: "BD",
      duration: "12 months",
      device_limit: "2",
      activation_destination: "buyer@example.test",
    },
  });
  if (!deal.ok) throw new Error("createDeal failed");
  const invite = await createInvite(pool, seller, deal.dealId);
  if (!invite.ok) throw new Error("invite failed");
  await acceptInvite(pool, buyer, invite.token);
  const agree = async (
    userId: string,
    command: "ProposeAgreement" | "AcceptAgreement" | "WithdrawAgreement",
  ) => {
    const view = await getDealView(pool, userId, deal.dealId);
    if (!view) throw new Error("no view");
    return agreementCommand(pool, "test", {
      userId,
      agreementId: deal.agreementId,
      command,
      envelope: envelope(view.agreement.aggregateVersion, {
        termsHash: view.agreement.termsHash,
      }),
    });
  };
  await agree(seller, "ProposeAgreement");
  await agree(buyer, "AcceptAgreement");
  await agree(seller, "AcceptAgreement");
  return { ...deal, seller, buyer, agree };
}

// Accepted deal with an invoice the buyer has started paying (PENDING).
async function pendingDeal() {
  const deal = await acceptedDeal();
  const invoice = await createInvoice(pool, deal.buyer, deal.dealId);
  if (!invoice.ok) throw new Error(`invoice failed: ${invoice.error}`);
  const started = await startFunding(pool, "test", {
    userId: deal.buyer,
    invoiceId: invoice.invoiceId,
    envelope: envelope(1),
  });
  if (!started.ok) throw new Error(`startFunding failed: ${started.error}`);
  const funding = await getFunding(pool, deal.dealId);
  if (!funding?.paymentRef) throw new Error("no payment ref");
  return {
    ...deal,
    invoiceId: invoice.invoiceId,
    paymentRef: funding.paymentRef,
  };
}

const pay = (
  paymentRef: string,
  amountMinor: string,
  patch: { eventId?: string; currency?: string; secret?: string } = {},
) => {
  const body = JSON.stringify({
    eventId: patch.eventId ?? `evt-${randomUUID()}`,
    type: "payment.succeeded",
    paymentRef,
    amountMinor,
    currency: patch.currency ?? "BDT",
  });
  return ingestPaymentEvent(pool, "test", {
    rawBody: body,
    signature: signMockEvent(body, patch.secret ?? SECRET),
    secret: SECRET,
  });
};
const state = async (dealId: string) => (await getFunding(pool, dealId))?.state;

test("only the buyer can create the invoice, and only for an accepted agreement", async () => {
  const deal = await acceptedDeal();
  expect(await createInvoice(pool, deal.seller, deal.dealId)).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  const first = await createInvoice(pool, deal.buyer, deal.dealId);
  const again = await createInvoice(pool, deal.buyer, deal.dealId);
  expect(first).toMatchObject({ ok: true });
  expect(again).toEqual(first);
  expect(await getFunding(pool, deal.dealId)).toMatchObject({
    state: "CREATED",
    amountMinor: "250000",
    currency: "BDT",
  });
});

test("a deal in human-from-start mode cannot be funded while no reviewer is assigned (B2)", async () => {
  const deal = await acceptedDeal("human_from_start");
  expect(await createInvoice(pool, deal.buyer, deal.dealId)).toEqual({
    ok: false,
    error: "REVIEWER_NOT_ASSIGNED",
  });
});

test("an exact authenticated payment confirms funding and the money is held", async () => {
  const deal = await pendingDeal();
  expect(await state(deal.dealId)).toBe("PENDING");
  expect((await dealBalances(pool, deal.dealId)).held).toBe(0n);

  expect(await pay(deal.paymentRef, "250000")).toEqual({
    ok: true,
    outcome: "CONFIRMED",
  });
  expect(await state(deal.dealId)).toBe("CONFIRMED");
  const balances = await dealBalances(pool, deal.dealId);
  expect(balances).toMatchObject({
    received: 250000n,
    held: 250000n,
    reserved: 0n,
    sellerPaid: 0n,
    buyerRefunded: 0n,
    fees: 0n,
    unapplied: 0n,
    conserved: true,
  });
});

test("a forged event changes nothing (INV-02)", async () => {
  const deal = await pendingDeal();
  expect(await pay(deal.paymentRef, "250000", { secret: "wrong" })).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  expect(await state(deal.dealId)).toBe("PENDING");
  expect((await dealBalances(pool, deal.dealId)).received).toBe(0n);
});

test("the same webhook delivered twice has one effect", async () => {
  const deal = await pendingDeal();
  const eventId = `evt-${randomUUID()}`;
  await pay(deal.paymentRef, "250000", { eventId });
  expect(await pay(deal.paymentRef, "250000", { eventId })).toEqual({
    ok: true,
    outcome: "DUPLICATE_EVENT",
  });
  expect((await dealBalances(pool, deal.dealId)).held).toBe(250000n);
});

test("V7-06: the same payment reported under a second event id has one economic effect", async () => {
  const deal = await pendingDeal();
  await pay(deal.paymentRef, "250000");
  expect(await pay(deal.paymentRef, "250000")).toEqual({
    ok: true,
    outcome: "DUPLICATE_PAYMENT",
  });
  const balances = await dealBalances(pool, deal.dealId);
  expect(balances).toMatchObject({ received: 250000n, held: 250000n });
  const { rows } = await pool.query(
    "select count(*)::int as n from provider_event where payment_ref = $1",
    [deal.paymentRef],
  );
  expect(rows[0].n).toBe(2);
});

test.each([
  ["underpayment", "200000"],
  ["overpayment", "300000"],
])(
  "V7-04: an %s never produces a funded deal and every unit is accounted for",
  async (_name, amount) => {
    const deal = await pendingDeal();
    expect(await pay(deal.paymentRef, amount)).toEqual({
      ok: true,
      outcome: "MISMATCH",
    });
    expect(await state(deal.dealId)).toBe("RECONCILIATION_REQUIRED");
    expect(await dealBalances(pool, deal.dealId)).toMatchObject({
      received: BigInt(amount),
      held: 0n,
      unapplied: BigInt(amount),
      conserved: true,
    });
  },
);

test("V7-04: a payment in the wrong currency is recorded but posts nothing", async () => {
  const deal = await pendingDeal();
  expect(await pay(deal.paymentRef, "250000", { currency: "USD" })).toEqual({
    ok: true,
    outcome: "UNSUPPORTED_CURRENCY",
  });
  expect(await state(deal.dealId)).toBe("RECONCILIATION_REQUIRED");
  expect((await dealBalances(pool, deal.dealId)).received).toBe(0n);
});

test("V7-04: a payment that arrives after the invoice expired cannot fund the deal", async () => {
  const deal = await pendingDeal();
  await pool.query(
    "update funding_invoice set expires_at = now() - interval '1 minute' where invoice_id = $1",
    [deal.invoiceId],
  );
  expect(await expireInvoices(pool, "test")).toBeGreaterThanOrEqual(1);
  expect(await state(deal.dealId)).toBe("EXPIRED");
  expect(await pay(deal.paymentRef, "250000")).toEqual({
    ok: true,
    outcome: "UNAPPLIED_LATE",
  });
  expect(await state(deal.dealId)).toBe("EXPIRED");
  expect(await dealBalances(pool, deal.dealId)).toMatchObject({
    held: 0n,
    unapplied: 250000n,
    conserved: true,
  });
});

test("an event for an unknown payment is recorded and affects no deal", async () => {
  expect(await pay(`pay-${randomUUID()}`, "250000")).toEqual({
    ok: true,
    outcome: "UNMATCHED",
  });
});

test("an agreement can be withdrawn before funding starts, but not after", async () => {
  const before = await acceptedDeal();
  await createInvoice(pool, before.buyer, before.dealId);
  expect(await before.agree(before.seller, "WithdrawAgreement")).toMatchObject({
    ok: true,
    state: "CANCELLED",
  });
  const invoice = await getFunding(pool, before.dealId);
  expect(invoice?.state).toBe("CANCELLED");
  expect(
    await startFunding(pool, "test", {
      userId: before.buyer,
      invoiceId: invoice?.invoiceId ?? "",
      envelope: envelope(invoice?.aggregateVersion ?? 0),
    }),
  ).toEqual({ ok: false, error: "ILLEGAL_TRANSITION" });

  const after = await pendingDeal();
  expect(await after.agree(after.seller, "WithdrawAgreement")).toEqual({
    ok: false,
    error: "ALREADY_FUNDED",
  });
});

test("funding is refused outside mock payment mode", async () => {
  const deal = await acceptedDeal();
  const invoice = await createInvoice(pool, deal.buyer, deal.dealId);
  if (!invoice.ok) throw new Error("invoice failed");
  expect(
    await startFunding(
      pool,
      "test",
      {
        userId: deal.buyer,
        invoiceId: invoice.invoiceId,
        envelope: envelope(1),
      },
      "live",
    ),
  ).toEqual({ ok: false, error: "TEST_MODE_REQUIRED" });
});

test("the database refuses an unbalanced journal entry, edits, and negative amounts", async () => {
  const deal = await pendingDeal();
  const unbalanced = async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const entry = await client.query(
        "insert into journal_entry (deal_id, kind, ref) values ($1, 'test', $2) returning id",
        [deal.dealId, `test-${randomUUID()}`],
      );
      await client.query(
        "insert into journal_line (entry_id, line_no, account, debit_minor) values ($1, 1, 'mock_clearing', 100)",
        [entry.rows[0].id],
      );
      await client.query("commit");
    } finally {
      await client.query("rollback").catch(() => {});
      client.release();
    }
  };
  await expect(unbalanced()).rejects.toThrow(/not balanced/);

  await pay(deal.paymentRef, "250000");
  await expect(
    pool.query(
      "update journal_line set credit_minor = 1 where credit_minor > 0",
    ),
  ).rejects.toThrow(/append-only/);
  await expect(pool.query("delete from journal_entry")).rejects.toThrow(
    /append-only/,
  );
  await expect(
    pool.query(
      "insert into journal_line (entry_id, line_no, account, debit_minor) select id, 99, 'held', -5 from journal_entry limit 1",
    ),
  ).rejects.toThrow(/check constraint/);
});

// --- outbox leases (D.5 step 6) ---

async function outboxEvent(): Promise<string> {
  const deal = await acceptedDeal();
  const { rows } = await pool.query(
    `select o.event_id from outbox o join event e using (event_id)
     join aggregate a on a.id = e.aggregate_id
     where a.deal_id = $1 order by o.created_at desc limit 1`,
    [deal.dealId],
  );
  // Leave only this one claimable so the tests below are deterministic.
  await pool.query(
    "update outbox set dispatched_at = now() where dispatched_at is null and dead_at is null and event_id <> $1",
    [rows[0].event_id],
  );
  return rows[0].event_id;
}

test("two workers never hold the same outbox entry at once", async () => {
  const eventId = await outboxEvent();
  const [a, b] = await Promise.all([
    claimOutbox(pool, "worker-a", 10, 60),
    claimOutbox(pool, "worker-b", 10, 60),
  ]);
  const holders = [...a, ...b].filter((c) => c.eventId === eventId);
  expect(holders).toHaveLength(1);
});

test("V7-09: after a lease expires, the old worker's result is rejected", async () => {
  const eventId = await outboxEvent();
  const [stale] = await claimOutbox(pool, "worker-old", 10, 60);
  if (!stale) throw new Error("nothing claimed");
  await pool.query(
    "update outbox set lease_until = now() - interval '1 second' where event_id = $1",
    [eventId],
  );
  const [fresh] = await claimOutbox(pool, "worker-new", 10, 60);
  expect(fresh?.eventId).toBe(eventId);
  expect(fresh?.generation).toBeGreaterThan(stale.generation);

  expect(await completeOutbox(pool, stale)).toBe(false);
  expect(await completeOutbox(pool, fresh as typeof stale)).toBe(true);
  expect(await claimOutbox(pool, "worker-new", 10, 60)).toEqual([]);
});

test("an entry that keeps failing is dead-lettered after a bounded number of attempts", async () => {
  const eventId = await outboxEvent();
  for (let attempt = 1; attempt <= MAX_OUTBOX_ATTEMPTS; attempt++) {
    const [claim] = await claimOutbox(pool, "worker", 10, 60);
    if (!claim) throw new Error(`nothing claimed on attempt ${attempt}`);
    await failOutbox(pool, claim, "handler exploded");
    await pool.query(
      "update outbox set lease_until = now() - interval '1 second' where event_id = $1 and dead_at is null",
      [eventId],
    );
  }
  expect(await claimOutbox(pool, "worker", 10, 60)).toEqual([]);
  const { rows } = await pool.query(
    "select attempts, dead_at is not null as dead, last_error, dispatched_at from outbox where event_id = $1",
    [eventId],
  );
  expect(rows[0]).toEqual({
    attempts: MAX_OUTBOX_ATTEMPTS,
    dead: true,
    last_error: "handler exploded",
    dispatched_at: null,
  });
});
