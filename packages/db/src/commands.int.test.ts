import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { type Actor, createAggregate, executeCommand } from "./commands";
import { migrate } from "./migrate";
import { testPool } from "./testing";

const pool = await testPool();
beforeAll(async () => {
  await migrate(pool);
});
afterAll(() => pool.end());

async function newUser(): Promise<string> {
  const { rows } = await pool.query(
    "insert into app_user (name, email) values ('Test', $1) returning id",
    [`u-${randomUUID()}@example.test`],
  );
  return rows[0].id;
}

// A deal with a buyer and a seller, plus one delivery package in DRAFT.
async function newDeal() {
  const buyer = await newUser();
  const seller = await newUser();
  const { rows } = await pool.query(
    "insert into deal (created_by) values ($1) returning id",
    [buyer],
  );
  const dealId: string = rows[0].id;
  await pool.query(
    "insert into deal_party (deal_id, user_id, role) values ($1, $2, 'buyer'), ($1, $3, 'seller')",
    [dealId, buyer, seller],
  );
  const client = await pool.connect();
  const deliveryId = await createAggregate(client, {
    type: "delivery",
    dealId,
  });
  client.release();
  return { buyer, seller, dealId, deliveryId };
}

const user = (userId: string): Actor => ({ kind: "user", userId });
const envelope = (patch: Record<string, unknown> = {}) => ({
  commandId: randomUUID(),
  idempotencyKey: `key-${randomUUID()}`,
  expectedAggregateVersion: 1,
  payload: {},
  ...patch,
});
const submit = (
  deal: { seller: string; deliveryId: string },
  patch: Record<string, unknown> = {},
  actor: Actor = user(deal.seller),
) =>
  executeCommand(pool, {
    environment: "test",
    actor,
    aggregateId: deal.deliveryId,
    command: "SubmitDelivery",
    envelope: envelope(patch),
  });

const count = async (table: string, aggregateId: string) => {
  const sql =
    table === "outbox"
      ? "select count(*)::int as n from outbox o join event e using (event_id) where e.aggregate_id = $1"
      : "select count(*)::int as n from event where aggregate_id = $1";
  return (await pool.query(sql, [aggregateId])).rows[0].n as number;
};

test("a legal command changes state and writes its event and outbox entry together", async () => {
  const deal = await newDeal();
  const result = await submit(deal, { payload: { note: "v1" } });
  expect(result).toMatchObject({
    ok: true,
    state: "SUBMITTED",
    aggregateVersion: 2,
  });
  const { rows } = await pool.query(
    "select event_type, aggregate_version, actor_ref, payload from event where aggregate_id = $1",
    [deal.deliveryId],
  );
  expect(rows).toEqual([
    {
      event_type: "delivery.SubmitDelivery",
      aggregate_version: 2,
      actor_ref: `user:${deal.seller}`,
      payload: { from: "DRAFT", to: "SUBMITTED", data: { note: "v1" } },
    },
  ]);
  expect(await count("outbox", deal.deliveryId)).toBe(1);
});

test("an illegal transition is rejected and nothing is written", async () => {
  const deal = await newDeal();
  await submit(deal);
  const again = await submit(deal, { expectedAggregateVersion: 2 });
  expect(again).toEqual({ ok: false, error: "ILLEGAL_TRANSITION" });
  expect(await count("event", deal.deliveryId)).toBe(1);
});

test("the wrong party role is refused", async () => {
  const deal = await newDeal();
  expect(await submit(deal, {}, user(deal.buyer))).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  expect(await count("event", deal.deliveryId)).toBe(0);
});

test("a seller from another deal cannot act on this one", async () => {
  const deal = await newDeal();
  const other = await newDeal();
  expect(await submit(deal, {}, user(other.seller))).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
});

test("an unknown aggregate id reads as not authorized, not as missing", async () => {
  const deal = await newDeal();
  const result = await executeCommand(pool, {
    environment: "test",
    actor: user(deal.seller),
    aggregateId: randomUUID(),
    command: "SubmitDelivery",
    envelope: envelope(),
  });
  expect(result).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
});

test("a dealId that does not match the aggregate is refused", async () => {
  const deal = await newDeal();
  const other = await newDeal();
  expect(await submit(deal, { dealId: other.dealId })).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
});

test("a user cannot issue a system-only command", async () => {
  const deal = await newDeal();
  const client = await pool.connect();
  const invoiceId = await createAggregate(client, {
    type: "funding_invoice",
    dealId: deal.dealId,
  });
  client.release();
  const fund = await executeCommand(pool, {
    environment: "test",
    actor: user(deal.buyer),
    aggregateId: invoiceId,
    command: "FundTestDeal",
    envelope: envelope(),
  });
  expect(fund).toMatchObject({ ok: true, state: "PENDING" });
  const forged = await executeCommand(pool, {
    environment: "test",
    actor: user(deal.buyer),
    aggregateId: invoiceId,
    command: "ConfirmFunding",
    envelope: envelope({ expectedAggregateVersion: 2 }),
  });
  expect(forged).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
  const adapter = await executeCommand(pool, {
    environment: "test",
    actor: { kind: "system", name: "mock-payment-adapter" },
    aggregateId: invoiceId,
    command: "ConfirmFunding",
    envelope: envelope({ expectedAggregateVersion: 2 }),
  });
  expect(adapter).toMatchObject({ ok: true, state: "CONFIRMED" });
});

test("a stale expected version is a conflict", async () => {
  const deal = await newDeal();
  expect(await submit(deal, { expectedAggregateVersion: 7 })).toEqual({
    ok: false,
    error: "VERSION_CONFLICT",
  });
});

test("a malformed envelope or id is a validation failure, not a crash", async () => {
  const deal = await newDeal();
  expect(await submit(deal, { idempotencyKey: "x" })).toEqual({
    ok: false,
    error: "VALIDATION_FAILED",
  });
  const badId = await executeCommand(pool, {
    environment: "test",
    actor: user(deal.seller),
    aggregateId: "not-a-uuid",
    command: "SubmitDelivery",
    envelope: envelope(),
  });
  expect(badId).toEqual({ ok: false, error: "VALIDATION_FAILED" });
});

test("replaying the same key and payload returns the original result once", async () => {
  const deal = await newDeal();
  const key = { idempotencyKey: "retry-key-0001", payload: { a: 1, b: 2 } };
  const first = await submit(deal, key);
  const replay = await submit(deal, {
    idempotencyKey: "retry-key-0001",
    payload: { b: 2, a: 1 },
  });
  expect(first.ok).toBe(true);
  expect(replay).toEqual(first);
  expect(await count("event", deal.deliveryId)).toBe(1);
});

test("the same key with a different payload is an idempotency conflict (V7-05)", async () => {
  const deal = await newDeal();
  await submit(deal, { idempotencyKey: "retry-key-0002", payload: { a: 1 } });
  const changed = await submit(deal, {
    idempotencyKey: "retry-key-0002",
    payload: { a: 999 },
  });
  expect(changed).toEqual({ ok: false, error: "IDEMPOTENCY_CONFLICT" });
  expect(await count("event", deal.deliveryId)).toBe(1);
});

test("a rejected command is not remembered as a result for its key", async () => {
  const deal = await newDeal();
  const key = "retry-key-0003";
  const rejected = await submit(deal, {
    idempotencyKey: key,
    expectedAggregateVersion: 9,
  });
  expect(rejected).toEqual({ ok: false, error: "VERSION_CONFLICT" });
  const retried = await submit(deal, { idempotencyKey: key });
  expect(retried).toMatchObject({ ok: true, state: "SUBMITTED" });
});

test("concurrent duplicates of one command converge on a single effect", async () => {
  const deal = await newDeal();
  const same = { idempotencyKey: "race-key-0001" };
  const results = await Promise.all([
    submit(deal, same),
    submit(deal, same),
    submit(deal, same),
  ]);
  expect(results.every((r) => r.ok)).toBe(true);
  expect(new Set(results.map((r) => (r.ok ? r.eventId : ""))).size).toBe(1);
  expect(await count("event", deal.deliveryId)).toBe(1);
});

test("two different commands racing on one version: exactly one wins", async () => {
  const deal = await newDeal();
  const results = await Promise.all([submit(deal), submit(deal)]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok)).toEqual([
    { ok: false, error: "VERSION_CONFLICT" },
  ]);
  expect(await count("event", deal.deliveryId)).toBe(1);
});

test("events are append-only", async () => {
  const deal = await newDeal();
  await submit(deal);
  await expect(
    pool.query("update event set payload = '{}' where aggregate_id = $1", [
      deal.deliveryId,
    ]),
  ).rejects.toThrow(/append-only/);
  await expect(
    pool.query("delete from event where aggregate_id = $1", [deal.deliveryId]),
  ).rejects.toThrow(/append-only/);
});

test("one identity cannot be both buyer and seller of a deal (D.2)", async () => {
  const solo = await newUser();
  const { rows } = await pool.query(
    "insert into deal (created_by) values ($1) returning id",
    [solo],
  );
  await expect(
    pool.query(
      "insert into deal_party (deal_id, user_id, role) values ($1, $2, 'buyer'), ($1, $2, 'seller')",
      [rows[0].id, solo],
    ),
  ).rejects.toThrow(/duplicate key/);
});

test("a deal cannot have two buyers", async () => {
  const deal = await newDeal();
  const extra = await newUser();
  await expect(
    pool.query(
      "insert into deal_party (deal_id, user_id, role) values ($1, $2, 'buyer')",
      [deal.dealId, extra],
    ),
  ).rejects.toThrow(/duplicate key/);
});
