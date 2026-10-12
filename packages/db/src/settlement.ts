import { randomUUID } from "node:crypto";
import type { ErrorCode } from "@lp/contracts";
import type { PoolClient } from "pg";
import {
  createAggregate,
  lockDeal,
  systemTransition,
  transitionWithin,
} from "./commands";
import type { Pool } from "./index";
import { postEntry } from "./ledger";
import { isPaused } from "./ops";

// Spec D.5. Money leaves the held balance only through this file, and always
// in the same order: authorize and reserve, commit the dispatch, call the
// adapter with a stable key, record what the adapter says.

type Failure<E extends ErrorCode> = { ok: false; error: E };
const fail = <E extends ErrorCode>(error: E): Failure<E> => ({
  ok: false,
  error,
});

export type SettlementPath =
  | "ACCEPTED_RELEASE"
  | "OBJECTIVE_RELEASE"
  | "MUTUAL_RESOLUTION"
  | "REVIEWED_RESOLUTION"
  | "NO_DELIVERY_REFUND";

export type TransferResult =
  | "SUCCEEDED"
  | "PENDING"
  | "FAILED_FINAL"
  | "UNKNOWN";

// The adapter contract. `adapterKey` identifies one logical transfer: sending
// it again must return the first outcome, never move money twice.
export type TransferAdapter = {
  send(operation: {
    adapterKey: string;
    kind: "payout" | "refund";
    amountMinor: string;
    destination: string;
  }): Promise<TransferResult>;
  status(adapterKey: string): Promise<TransferResult | "NOT_FOUND">;
};

// The synthetic provider. `behavior` lets tests inject the faults D.5 lists;
// by default every transfer succeeds.
export type MockBehavior =
  | "ok"
  | "pending"
  | "fail"
  // The provider did the transfer but the caller never got the answer.
  | "timeout_after_success"
  // The request never reached the provider.
  | "timeout_before_send";

export function mockTransferAdapter(
  pool: Pool,
  behavior: () => MockBehavior = () => "ok",
): TransferAdapter {
  const status = async (adapterKey: string) => {
    const { rows } = await pool.query(
      "select status from mock_transfer where adapter_key = $1",
      [adapterKey],
    );
    return (rows[0]?.status as TransferResult | undefined) ?? "NOT_FOUND";
  };
  return {
    status,
    async send(operation) {
      const mode = behavior();
      if (mode === "timeout_before_send") return "UNKNOWN";
      const recorded =
        mode === "pending"
          ? "PENDING"
          : mode === "fail"
            ? "FAILED_FINAL"
            : "SUCCEEDED";
      // Stable-key replay: a repeated key keeps the first outcome.
      await pool.query(
        `insert into mock_transfer (adapter_key, kind, amount_minor, destination, status)
         values ($1, $2, $3, $4, $5) on conflict (adapter_key) do nothing`,
        [
          operation.adapterKey,
          operation.kind,
          operation.amountMinor,
          operation.destination,
          recorded,
        ],
      );
      if (mode === "timeout_after_success") return "UNKNOWN";
      return (await status(operation.adapterKey)) as TransferResult;
    },
  };
}

export async function heldMinor(
  client: PoolClient,
  dealId: string,
): Promise<bigint> {
  const { rows } = await client.query(
    `select (coalesce(sum(l.credit_minor), 0) - coalesce(sum(l.debit_minor), 0))::text as held
     from journal_line l join journal_entry e on e.id = l.entry_id
     where e.deal_id = $1 and l.account = 'held'`,
    [dealId],
  );
  return BigInt(rows[0].held);
}

// D.5 step 1. Caller holds the deal lock and has already checked the path's
// own guards. Authorization, reservation and operations are created together.
export async function createAuthorization(
  client: PoolClient,
  input: {
    dealId: string;
    path: SettlementPath;
    toSellerMinor: bigint;
    toBuyerMinor: bigint;
    packageId: string | null;
    causationId: string;
  },
): Promise<string | null> {
  const total = input.toSellerMinor + input.toBuyerMinor;
  // INV-03: an allocation can never exceed what is actually held.
  if (total <= 0n || total > (await heldMinor(client, input.dealId)))
    return null;
  const parties = await client.query(
    "select role, user_id from deal_party where deal_id = $1",
    [input.dealId],
  );
  const party = (role: string) =>
    parties.rows.find((p) => p.role === role)?.user_id as string;

  const authorizationId = await createAggregate(client, {
    type: "authorization",
    dealId: input.dealId,
  });
  await client.query(
    `insert into settlement_authorization
       (authorization_id, deal_id, path, to_seller_minor, to_buyer_minor, package_id)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      authorizationId,
      input.dealId,
      input.path,
      input.toSellerMinor.toString(),
      input.toBuyerMinor.toString(),
      input.packageId,
    ],
  );
  await systemTransition(client, {
    aggregateId: authorizationId,
    command: "ReserveFunds",
    causationId: input.causationId,
    data: { path: input.path },
  });
  await postEntry(client, {
    dealId: input.dealId,
    kind: "reserve",
    ref: `reserve:${authorizationId}`,
    debit: "held",
    credit: "reserved",
    amountMinor: total,
  });
  for (const [kind, amount, destination] of [
    ["payout", input.toSellerMinor, party("seller")],
    ["refund", input.toBuyerMinor, party("buyer")],
  ] as const) {
    if (amount <= 0n) continue;
    const operationId = await createAggregate(client, {
      type: "adapter_operation",
      dealId: input.dealId,
    });
    await client.query(
      `insert into adapter_operation
         (operation_id, authorization_id, deal_id, kind, amount_minor, destination, adapter_key)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        operationId,
        authorizationId,
        input.dealId,
        kind,
        amount.toString(),
        destination,
        `binimoy:${authorizationId}:${kind}`,
      ],
    );
  }
  return authorizationId;
}

// INV-07 and D.5 step 3: an authorization that has not been dispatched can be
// withdrawn, and its reservation returns to the held balance. One that has
// been dispatched is left alone; this returns false for it.
export async function invalidateAuthorization(
  client: PoolClient,
  authorizationId: string,
  causationId: string,
): Promise<boolean> {
  const { rows } = await client.query(
    `select a.state, a.deal_id,
       (s.to_seller_minor + s.to_buyer_minor)::text as total
     from aggregate a join settlement_authorization s on s.authorization_id = a.id
     where a.id = $1 for update of a`,
    [authorizationId],
  );
  const row = rows[0];
  if (!row || !["CREATED", "RESERVED"].includes(row.state)) return false;
  await systemTransition(client, {
    aggregateId: authorizationId,
    command: "InvalidateAuthorization",
    causationId,
  });
  if (row.state === "RESERVED") {
    await postEntry(client, {
      dealId: row.deal_id,
      kind: "release_reservation",
      ref: `release:${authorizationId}`,
      debit: "reserved",
      credit: "held",
      amountMinor: BigInt(row.total),
    });
  }
  return true;
}

const OPEN_DISPUTE = `exists (
  select 1 from dispute d join aggregate da on da.id = d.dispute_id
  where d.deal_id = $1 and da.state not in ('RESOLVED', 'UNRESOLVED_CLOSED'))`;

export async function hasOpenDispute(
  client: PoolClient,
  dealId: string,
): Promise<boolean> {
  const { rows } = await client.query(`select ${OPEN_DISPUTE} as open`, [
    dealId,
  ]);
  return rows[0].open;
}

type Operation = {
  operation_id: string;
  deal_id: string;
  kind: "payout" | "refund";
  amount: string;
  destination: string;
  adapter_key: string;
  state: string;
};

// Records what the adapter said. Final states never change again, and each
// journal posting is keyed by the operation, so this is safe to repeat.
async function applyResult(
  pool: Pool,
  operationId: string,
  result: TransferResult,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const found = await client.query(
      "select deal_id from adapter_operation where operation_id = $1",
      [operationId],
    );
    await lockDeal(client, found.rows[0].deal_id);
    const { rows } = await client.query(
      `select o.operation_id, o.deal_id, o.kind, o.amount_minor::text as amount, a.state
       from adapter_operation o join aggregate a on a.id = o.operation_id
       where o.operation_id = $1`,
      [operationId],
    );
    const operation: Operation = rows[0];
    const open = ["DISPATCH_COMMITTED", "PENDING", "UNKNOWN"];
    // A late or repeated answer must not regress a finished operation (V7-07).
    if (!open.includes(operation.state) || operation.state === result) {
      await client.query("rollback");
      return;
    }
    await systemTransition(client, {
      aggregateId: operationId,
      command: "RecordAdapterResult",
      to: result,
      causationId: randomUUID(),
    });
    if (result === "SUCCEEDED") {
      await postEntry(client, {
        dealId: operation.deal_id,
        kind: operation.kind,
        ref: `settle:${operationId}`,
        debit: "reserved",
        credit: operation.kind === "payout" ? "seller_paid" : "buyer_refunded",
        amountMinor: BigInt(operation.amount),
      });
    }
    // Only an authoritative final failure frees the reservation (D.5 step 4).
    if (result === "FAILED_FINAL") {
      await postEntry(client, {
        dealId: operation.deal_id,
        kind: "transfer_failed",
        ref: `failed:${operationId}`,
        debit: "reserved",
        credit: "held",
        amountMinor: BigInt(operation.amount),
      });
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// D.5 step 2: the linearization point. Under the deal lock, re-check that the
// authorization is still valid, then durably mark it and its operations as
// committed to dispatch. A dispute that commits before this prevents sending;
// one that commits after it cannot.
export async function commitDispatch(
  pool: Pool,
  authorizationId: string,
): Promise<Operation[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const found = await client.query(
      "select deal_id from settlement_authorization where authorization_id = $1",
      [authorizationId],
    );
    if (!found.rows[0]) {
      await client.query("rollback");
      return [];
    }
    const dealId: string = found.rows[0].deal_id;
    await lockDeal(client, dealId);
    const authorization = await client.query(
      "select state from aggregate where id = $1 for update",
      [authorizationId],
    );
    if (
      authorization.rows[0].state !== "RESERVED" ||
      (await hasOpenDispute(client, dealId))
    ) {
      await client.query("rollback");
      return [];
    }
    const causationId = randomUUID();
    await systemTransition(client, {
      aggregateId: authorizationId,
      command: "DispatchSettlement",
      causationId,
    });
    // Consuming binds the authorization to its operations. It does not mean
    // the money arrived; the operation's own state says that.
    await systemTransition(client, {
      aggregateId: authorizationId,
      command: "ConsumeAuthorization",
      causationId,
    });
    const { rows } = await client.query(
      `select o.operation_id, o.deal_id, o.kind, o.amount_minor::text as amount,
         o.destination, o.adapter_key, a.state
       from adapter_operation o join aggregate a on a.id = o.operation_id
       where o.authorization_id = $1 and a.state = 'NOT_SENT'`,
      [authorizationId],
    );
    for (const operation of rows) {
      await systemTransition(client, {
        aggregateId: operation.operation_id,
        command: "CommitDispatch",
        causationId,
      });
    }
    await client.query("commit");
    return rows;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const sendOne = async (
  pool: Pool,
  adapter: TransferAdapter,
  operation: Operation,
) => {
  let result: TransferResult;
  try {
    result = await adapter.send({
      adapterKey: operation.adapter_key,
      kind: operation.kind,
      amountMinor: operation.amount,
      destination: operation.destination,
    });
  } catch {
    // A thrown call tells us nothing about whether the transfer happened.
    result = "UNKNOWN";
  }
  await applyResult(pool, operation.operation_id, result);
};

// Run by the worker. Returns how many operations were sent to the adapter.
export async function dispatchSettlements(
  pool: Pool,
  adapter: TransferAdapter,
): Promise<number> {
  // D.13: a settlement pause stops new dispatches only. Transfers already
  // committed are still reconciled, and nothing reserved is released.
  if (await isPaused(pool, "settlement")) return 0;
  const due = await pool.query(
    `select s.authorization_id from settlement_authorization s
     join aggregate a on a.id = s.authorization_id
     where a.state = 'RESERVED' order by s.created_at limit 20`,
  );
  let sent = 0;
  for (const row of due.rows) {
    for (const operation of await commitDispatch(pool, row.authorization_id)) {
      await sendOne(pool, adapter, operation);
      sent++;
    }
  }
  return sent;
}

// Run by the worker. For every operation that was committed but has no final
// answer, ask the adapter what it knows. If it has never heard of the key,
// the request was lost: send it again with the same key (D.5 step 5).
export async function reconcileOperations(
  pool: Pool,
  adapter: TransferAdapter,
): Promise<number> {
  const { rows } = await pool.query(
    `select o.operation_id, o.deal_id, o.kind, o.amount_minor::text as amount,
       o.destination, o.adapter_key, a.state
     from adapter_operation o join aggregate a on a.id = o.operation_id
     where a.state in ('DISPATCH_COMMITTED', 'PENDING', 'UNKNOWN')
     order by a.created_at limit 50`,
  );
  for (const operation of rows as Operation[]) {
    const known = await adapter.status(operation.adapter_key);
    if (known === "NOT_FOUND") await sendOne(pool, adapter, operation);
    else await applyResult(pool, operation.operation_id, known);
  }
  return rows.length;
}

// B11: funded, deadline passed, nothing ever delivered. The rule both parties
// accepted gives the buyer a full refund. A late submission and this refund
// compete under the same deal lock; whichever commits first wins (V7-11).
export async function refundOverdueDeliveries(pool: Pool): Promise<number> {
  const due = await pool.query(
    `select dl.deal_id from deal_deadline dl
     where dl.delivery_due_at <= now()
       and not exists (select 1 from delivery_package p where p.deal_id = dl.deal_id)
       and not exists (select 1 from settlement_authorization s where s.deal_id = dl.deal_id)`,
  );
  let refunded = 0;
  for (const row of due.rows) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await lockDeal(client, row.deal_id);
      const still = await client.query(
        `select
           not exists (select 1 from delivery_package p where p.deal_id = $1)
           and not exists (select 1 from settlement_authorization s where s.deal_id = $1)
           and not ${OPEN_DISPUTE} as due`,
        [row.deal_id],
      );
      const held = await heldMinor(client, row.deal_id);
      const authorizationId =
        still.rows[0].due && held > 0n
          ? await createAuthorization(client, {
              dealId: row.deal_id,
              path: "NO_DELIVERY_REFUND",
              toSellerMinor: 0n,
              toBuyerMinor: held,
              packageId: null,
              causationId: randomUUID(),
            })
          : null;
      await client.query(authorizationId ? "commit" : "rollback");
      if (authorizationId) refunded++;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  return refunded;
}

export type DisputeClaim =
  | "NOT_RECEIVED"
  | "CANNOT_ACCESS"
  | "WRONG_PRODUCT"
  | "INCOMPLETE"
  | "LOST_ACCESS_LATER"
  | "COMPROMISED"
  | "OTHER";
const CLAIMS: DisputeClaim[] = [
  "NOT_RECEIVED",
  "CANNOT_ACCESS",
  "WRONG_PRODUCT",
  "INCOMPLETE",
  "LOST_ACCESS_LATER",
  "COMPROMISED",
  "OTHER",
];

// B8, D.5 step 3. Opening a dispute holds everything that has not yet been
// dispatched. What has been dispatched is not pretended away: the dispute is
// recorded as coming after dispatch.
export async function openDispute(
  pool: Pool,
  input: { userId: string; dealId: string; claim: string; detail?: string },
): Promise<
  | { ok: true; disputeId: string; afterDispatch: boolean }
  | Failure<"NOT_AUTHORIZED" | "VALIDATION_FAILED" | "ILLEGAL_TRANSITION">
> {
  if (!CLAIMS.includes(input.claim as DisputeClaim))
    return fail("VALIDATION_FAILED");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const done = async <T>(value: T, commit = false) => {
      await client.query(commit ? "commit" : "rollback");
      return value;
    };
    if (!(await lockDeal(client, input.dealId)))
      return done(fail("NOT_AUTHORIZED"));
    const party = await client.query(
      "select 1 from deal_party where deal_id = $1 and user_id = $2",
      [input.dealId, input.userId],
    );
    if (party.rowCount !== 1) return done(fail("NOT_AUTHORIZED"));
    // There is nothing to dispute before money is held.
    const funded = await client.query(
      "select 1 from deal_deadline where deal_id = $1",
      [input.dealId],
    );
    if (funded.rowCount !== 1) return done(fail("ILLEGAL_TRANSITION"));

    const existing = await client.query(
      `select d.dispute_id, d.after_dispatch from dispute d
       join aggregate a on a.id = d.dispute_id
       where d.deal_id = $1 and a.state not in ('RESOLVED', 'UNRESOLVED_CLOSED')`,
      [input.dealId],
    );
    if (existing.rows[0]) {
      return done({
        ok: true as const,
        disputeId: existing.rows[0].dispute_id as string,
        afterDispatch: existing.rows[0].after_dispatch as boolean,
      });
    }
    const dispatched = await client.query(
      `select 1 from adapter_operation o join aggregate a on a.id = o.operation_id
       where o.deal_id = $1 and a.state <> 'NOT_SENT' limit 1`,
      [input.dealId],
    );
    const afterDispatch = dispatched.rowCount === 1;
    const disputeId = await createAggregate(client, {
      type: "dispute",
      dealId: input.dealId,
    });
    await client.query(
      "insert into dispute (dispute_id, deal_id, opened_by, claim, detail, after_dispatch) values ($1, $2, $3, $4, $5, $6)",
      [
        disputeId,
        input.dealId,
        input.userId,
        input.claim,
        (input.detail ?? "").slice(0, 2000),
        afterDispatch,
      ],
    );
    // The other party is told at once that a dispute exists: the fact and
    // the deal, never the claim text.
    await client.query(
      `insert into notice (recipient_id, deal_id, kind)
       select user_id, deal_id, 'DISPUTE_OPENED' from deal_party
       where deal_id = $1 and user_id <> $2`,
      [input.dealId, input.userId],
    );
    const pending = await client.query(
      `select s.authorization_id from settlement_authorization s
       join aggregate a on a.id = s.authorization_id
       where s.deal_id = $1 and a.state in ('CREATED', 'RESERVED')`,
      [input.dealId],
    );
    for (const row of pending.rows) {
      await invalidateAuthorization(client, row.authorization_id, disputeId);
    }
    // B2 human-from-start: the deal already has its reviewer, so the case goes
    // straight to them instead of waiting in a queue.
    const assigned = await client.query(
      "select reviewer_id from deal_reviewer where deal_id = $1",
      [input.dealId],
    );
    if (assigned.rows[0]) {
      const reviewerId: string = assigned.rows[0].reviewer_id;
      await systemTransition(client, {
        aggregateId: disputeId,
        command: "RequestReview",
        causationId: disputeId,
      });
      await client.query(
        "insert into review_assignment (dispute_id, reviewer_id, kind) values ($1, $2, 'review')",
        [disputeId, reviewerId],
      );
      for (const command of ["ClaimReview", "StartReview"]) {
        await transitionWithin(client, {
          aggregateId: disputeId,
          command,
          roles: ["reviewer"],
          principal: `user:${reviewerId}`,
          causationId: disputeId,
        });
      }
    }
    return done({ ok: true as const, disputeId, afterDispatch }, true);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
