import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  activeStaffRoles,
  grantStaffRole,
  monitoringAllowed,
  recordMonitoringConsent,
  revokeStaffRole,
  withdrawMonitoringConsent,
} from "./access";
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
  return { buyer, seller, dealId };
}

const POLICY = "monitoring-v1";
const consent = (dealId: string, userId: string, policyVersion = POLICY) =>
  recordMonitoringConsent(pool, {
    dealId,
    userId,
    policyVersion,
    purposes: ["delivery_assistance", "dispute_resolution"],
    modelDestination: "fixture",
    attachmentClasses: ["image"],
  });

test("AI processing is not allowed until both parties consent (B13-11)", async () => {
  const deal = await newDeal();
  expect(await monitoringAllowed(pool, deal.dealId, POLICY)).toBe(false);
  expect(await consent(deal.dealId, deal.buyer)).toEqual({ ok: true });
  expect(await monitoringAllowed(pool, deal.dealId, POLICY)).toBe(false);
  expect(await consent(deal.dealId, deal.seller)).toEqual({ ok: true });
  expect(await monitoringAllowed(pool, deal.dealId, POLICY)).toBe(true);
});

test("consent to an old policy version does not cover a new one", async () => {
  const deal = await newDeal();
  await consent(deal.dealId, deal.buyer);
  await consent(deal.dealId, deal.seller);
  expect(await monitoringAllowed(pool, deal.dealId, "monitoring-v2")).toBe(
    false,
  );
});

test("someone who is not a party cannot consent for a deal", async () => {
  const deal = await newDeal();
  const outsider = await newUser();
  expect(await consent(deal.dealId, outsider)).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  await consent(deal.dealId, deal.buyer);
  expect(await monitoringAllowed(pool, deal.dealId, POLICY)).toBe(false);
});

test("accepting twice is harmless and records one active consent", async () => {
  const deal = await newDeal();
  await consent(deal.dealId, deal.buyer);
  expect(await consent(deal.dealId, deal.buyer)).toEqual({ ok: true });
  const { rows } = await pool.query(
    "select count(*)::int as n from monitoring_consent where deal_id = $1",
    [deal.dealId],
  );
  expect(rows[0].n).toBe(1);
});

test("withdrawal stops processing and keeps the history; re-consent is a new record", async () => {
  const deal = await newDeal();
  await consent(deal.dealId, deal.buyer);
  await consent(deal.dealId, deal.seller);
  await withdrawMonitoringConsent(pool, {
    dealId: deal.dealId,
    userId: deal.seller,
  });
  expect(await monitoringAllowed(pool, deal.dealId, POLICY)).toBe(false);
  await consent(deal.dealId, deal.seller);
  expect(await monitoringAllowed(pool, deal.dealId, POLICY)).toBe(true);
  const { rows } = await pool.query(
    "select count(*)::int as total, count(withdrawn_at)::int as withdrawn from monitoring_consent where deal_id = $1 and user_id = $2",
    [deal.dealId, deal.seller],
  );
  expect(rows[0]).toEqual({ total: 2, withdrawn: 1 });
});

test("a staff role exists only while granted, and the grant history is kept", async () => {
  const user = await newUser();
  expect(await activeStaffRoles(pool, user)).toEqual([]);
  await grantStaffRole(pool, {
    userId: user,
    role: "reviewer",
    grantedBy: "operator:test",
    reason: "test enrollment",
  });
  expect(await activeStaffRoles(pool, user)).toEqual(["reviewer"]);
  await revokeStaffRole(pool, {
    userId: user,
    role: "reviewer",
    revokedBy: "operator:test",
  });
  expect(await activeStaffRoles(pool, user)).toEqual([]);
  const { rows } = await pool.query(
    "select granted_by, reason, revoked_by, revoked_at is not null as revoked from staff_role where user_id = $1",
    [user],
  );
  expect(rows).toEqual([
    {
      granted_by: "operator:test",
      reason: "test enrollment",
      revoked_by: "operator:test",
      revoked: true,
    },
  ]);
});

test("an unknown staff role is rejected by the database", async () => {
  const user = await newUser();
  await expect(
    grantStaffRole(pool, {
      userId: user,
      role: "superadmin" as "reviewer",
      grantedBy: "operator:test",
      reason: "should fail",
    }),
  ).rejects.toThrow(/check constraint/);
});
