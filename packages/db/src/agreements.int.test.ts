import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  acceptInvite,
  agreementCommand,
  createDeal,
  createInvite,
  getDealView,
  listDeals,
} from "./agreements";
import { migrate } from "./migrate";
import { testPool } from "./testing";

const pool = await testPool();
beforeAll(async () => {
  await migrate(pool);
});
afterAll(() => pool.end());

async function newUser(name = "Test"): Promise<string> {
  const { rows } = await pool.query(
    "insert into app_user (name, email) values ($1, $2) returning id",
    [name, `u-${randomUUID()}@example.test`],
  );
  return rows[0].id;
}

const product = {
  product: "EditorPro",
  edition: "Professional",
  region: "BD",
  duration: "12 months",
  device_limit: "2",
  activation_destination: "buyer@example.test",
};
const dealInput = (patch: Record<string, unknown> = {}) => ({
  role: "seller" as const,
  templateId: "software_license",
  templateVersion: 1,
  title: "EditorPro license",
  mode: "ai_first",
  amountMinor: "250000",
  product,
  ...patch,
});

async function created(input = dealInput()) {
  const seller = await newUser("Seller");
  const result = await createDeal(pool, seller, input);
  if (!result.ok) throw new Error(`createDeal failed: ${result.error}`);
  return { seller, ...result };
}

// A deal with both parties joined through a real invitation.
async function joined() {
  const deal = await created();
  const buyer = await newUser("Buyer");
  const invite = await createInvite(pool, deal.seller, deal.dealId);
  if (!invite.ok) throw new Error("invite failed");
  const accepted = await acceptInvite(pool, buyer, invite.token);
  if (!accepted.ok) throw new Error("accept invite failed");
  return { ...deal, buyer };
}

const view = async (userId: string, dealId: string) => {
  const result = await getDealView(pool, userId, dealId);
  if (!result) throw new Error("no view");
  return result;
};

const command = async (
  userId: string,
  deal: { dealId: string; agreementId: string },
  name: Parameters<typeof agreementCommand>[2]["command"],
  payload: Record<string, unknown> = {},
) => {
  const current = await view(userId, deal.dealId);
  return agreementCommand(pool, "test", {
    userId,
    agreementId: deal.agreementId,
    command: name,
    envelope: {
      commandId: randomUUID(),
      idempotencyKey: `key-${randomUUID()}`,
      expectedAggregateVersion: current.agreement.aggregateVersion,
      payload,
    },
  });
};
const hash = async (userId: string, dealId: string) =>
  (await view(userId, dealId)).agreement.termsHash;

test("creating a deal drafts version 1 of the agreement from the template", async () => {
  const deal = await created();
  const v = await view(deal.seller, deal.dealId);
  expect(v.myRole).toBe("seller");
  expect(v.agreement).toMatchObject({ state: "DRAFT", versionNo: 1 });
  expect(v.agreement.terms).toMatchObject({
    templateId: "software_license",
    templateVersion: 1,
    categoryId: "CAT-04",
    mode: "ai_first",
    currency: "BDT",
    amountMinor: "250000",
    feeMinor: "0",
    objectiveRelease: false,
    product,
  });
  expect(v.agreement.terms.items.length).toBeGreaterThan(3);
  expect(v.agreement.termsHash).toMatch(/^[a-f0-9]{64}$/);
  expect(await listDeals(pool, deal.seller)).toEqual([
    expect.objectContaining({ dealId: deal.dealId, state: "DRAFT" }),
  ]);
});

test.each([
  ["a missing required product field", { product: { ...product, region: "" } }],
  ["an unknown product field", { product: { ...product, extra: "x" } }],
  ["a zero amount", { amountMinor: "0" }],
  ["a decimal amount", { amountMinor: "25.50" }],
  ["an unsupported service mode", { mode: "human_only" }],
  ["an unknown template", { templateId: "nope" }],
  ["a role that is not buyer or seller", { role: "reviewer" }],
])("creating a deal with %s is rejected", async (_name, patch) => {
  const user = await newUser();
  expect(await createDeal(pool, user, dealInput(patch))).toMatchObject({
    ok: false,
    error: "VALIDATION_FAILED",
  });
  expect(await listDeals(pool, user)).toEqual([]);
});

test("an invitation lets exactly one other person join, as the missing role", async () => {
  const deal = await created();
  const buyer = await newUser();
  const late = await newUser();
  const invite = await createInvite(pool, deal.seller, deal.dealId);
  if (!invite.ok) throw new Error("invite failed");

  expect(await acceptInvite(pool, deal.seller, invite.token)).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  expect(await acceptInvite(pool, buyer, invite.token)).toEqual({
    ok: true,
    dealId: deal.dealId,
  });
  expect((await view(buyer, deal.dealId)).myRole).toBe("buyer");
  expect(await acceptInvite(pool, late, invite.token)).toEqual({
    ok: false,
    error: "INVITE_INVALID",
  });
  expect(await getDealView(pool, late, deal.dealId)).toBeNull();
});

test("an expired or made-up invitation does not work", async () => {
  const deal = await created();
  const buyer = await newUser();
  const invite = await createInvite(pool, deal.seller, deal.dealId);
  if (!invite.ok) throw new Error("invite failed");
  await pool.query(
    "update deal_invite set expires_at = now() - interval '1 minute' where deal_id = $1",
    [deal.dealId],
  );
  expect(await acceptInvite(pool, buyer, invite.token)).toEqual({
    ok: false,
    error: "INVITE_INVALID",
  });
  expect(await acceptInvite(pool, buyer, "not-a-real-token")).toEqual({
    ok: false,
    error: "INVITE_INVALID",
  });
});

test("only a party can invite, a new invitation replaces the old one, and the token is stored only as a hash", async () => {
  const deal = await created();
  const outsider = await newUser();
  expect(await createInvite(pool, outsider, deal.dealId)).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  const first = await createInvite(pool, deal.seller, deal.dealId);
  const second = await createInvite(pool, deal.seller, deal.dealId);
  if (!first.ok || !second.ok) throw new Error("invite failed");
  const buyer = await newUser();
  expect(await acceptInvite(pool, buyer, first.token)).toEqual({
    ok: false,
    error: "INVITE_INVALID",
  });
  const { rows } = await pool.query(
    "select token_hash from deal_invite where deal_id = $1",
    [deal.dealId],
  );
  for (const row of rows) {
    expect(row.token_hash).not.toBe(first.token);
    expect(row.token_hash).not.toBe(second.token);
  }
  expect(await acceptInvite(pool, buyer, second.token)).toMatchObject({
    ok: true,
  });
  expect(await createInvite(pool, deal.seller, deal.dealId)).toEqual({
    ok: false,
    error: "INVITE_INVALID",
  });
});

test("an agreement cannot be proposed before the counterparty has joined", async () => {
  const deal = await created();
  expect(await command(deal.seller, deal, "ProposeAgreement")).toEqual({
    ok: false,
    error: "COUNTERPARTY_MISSING",
  });
});

test("both parties accepting the same terms makes the agreement ACCEPTED and immutable (INV-01)", async () => {
  const deal = await joined();
  expect(await command(deal.seller, deal, "ProposeAgreement")).toMatchObject({
    ok: true,
    state: "AWAITING_ACCEPTANCE",
  });
  const termsHash = await hash(deal.buyer, deal.dealId);
  expect(
    await command(deal.buyer, deal, "AcceptAgreement", { termsHash }),
  ).toMatchObject({ ok: true, state: "AWAITING_ACCEPTANCE" });
  expect((await view(deal.seller, deal.dealId)).agreement.acceptedBy).toEqual([
    "buyer",
  ]);
  expect(
    await command(deal.seller, deal, "AcceptAgreement", { termsHash }),
  ).toMatchObject({ ok: true, state: "ACCEPTED" });

  expect(
    await command(deal.seller, deal, "ReviseAgreement", dealInput()),
  ).toEqual({ ok: false, error: "ILLEGAL_TRANSITION" });
  expect(await hash(deal.seller, deal.dealId)).toBe(termsHash);
});

test("one party accepting twice does not stand in for the other", async () => {
  const deal = await joined();
  await command(deal.seller, deal, "ProposeAgreement");
  const termsHash = await hash(deal.seller, deal.dealId);
  await command(deal.seller, deal, "AcceptAgreement", { termsHash });
  expect(
    await command(deal.seller, deal, "AcceptAgreement", { termsHash }),
  ).toMatchObject({ ok: true, state: "AWAITING_ACCEPTANCE" });
});

test("acceptance of old terms does not carry over to revised terms (V7-13)", async () => {
  const deal = await joined();
  await command(deal.seller, deal, "ProposeAgreement");
  const oldHash = await hash(deal.buyer, deal.dealId);
  await command(deal.buyer, deal, "AcceptAgreement", { termsHash: oldHash });

  expect(
    await command(
      deal.seller,
      deal,
      "ReviseAgreement",
      dealInput({ amountMinor: "300000" }),
    ),
  ).toMatchObject({ ok: true, state: "DRAFT" });
  await command(deal.seller, deal, "ProposeAgreement");
  const newHash = await hash(deal.seller, deal.dealId);
  expect(newHash).not.toBe(oldHash);

  // Replaying the old consent against the new terms is a conflict.
  expect(
    await command(deal.buyer, deal, "AcceptAgreement", { termsHash: oldHash }),
  ).toEqual({ ok: false, error: "VERSION_CONFLICT" });

  // The seller's acceptance alone is not enough: the buyer's was for v1.
  expect(
    await command(deal.seller, deal, "AcceptAgreement", { termsHash: newHash }),
  ).toMatchObject({ ok: true, state: "AWAITING_ACCEPTANCE" });
  const v = await view(deal.buyer, deal.dealId);
  expect(v.agreement).toMatchObject({ versionNo: 2, acceptedBy: ["seller"] });
  expect(v.agreement.terms.amountMinor).toBe("300000");
});

test("a revision with invalid terms is rejected and changes nothing", async () => {
  const deal = await joined();
  const before = await hash(deal.seller, deal.dealId);
  expect(
    await command(
      deal.seller,
      deal,
      "ReviseAgreement",
      dealInput({ amountMinor: "-5" }),
    ),
  ).toEqual({ ok: false, error: "VALIDATION_FAILED" });
  expect(await hash(deal.seller, deal.dealId)).toBe(before);
});

test("an outsider can neither read nor act on the agreement", async () => {
  const deal = await joined();
  const outsider = await newUser();
  expect(await getDealView(pool, outsider, deal.dealId)).toBeNull();
  const result = await agreementCommand(pool, "test", {
    userId: outsider,
    agreementId: deal.agreementId,
    command: "ProposeAgreement",
    envelope: {
      commandId: randomUUID(),
      idempotencyKey: `key-${randomUUID()}`,
      expectedAggregateVersion: 1,
      payload: {},
    },
  });
  expect(result).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
});

test("withdrawing cancels the agreement and kills open invitations", async () => {
  const deal = await created();
  const invite = await createInvite(pool, deal.seller, deal.dealId);
  if (!invite.ok) throw new Error("invite failed");
  expect(await command(deal.seller, deal, "WithdrawAgreement")).toMatchObject({
    ok: true,
    state: "CANCELLED",
  });
  const buyer = await newUser();
  expect(await acceptInvite(pool, buyer, invite.token)).toEqual({
    ok: false,
    error: "INVITE_INVALID",
  });
  expect(await createInvite(pool, deal.seller, deal.dealId)).toEqual({
    ok: false,
    error: "INVITE_INVALID",
  });
});

test("stored terms and acceptances cannot be edited or deleted", async () => {
  const deal = await joined();
  await command(deal.seller, deal, "ProposeAgreement");
  const termsHash = await hash(deal.seller, deal.dealId);
  await command(deal.seller, deal, "AcceptAgreement", { termsHash });
  for (const sql of [
    "update agreement_version set terms = '{}' where agreement_id = $1",
    "delete from agreement_version where agreement_id = $1",
    "update agreement_acceptance set terms_hash = 'x' where agreement_id = $1",
    "delete from agreement_acceptance where agreement_id = $1",
  ]) {
    await expect(pool.query(sql, [deal.agreementId])).rejects.toThrow(
      /append-only/,
    );
  }
});
