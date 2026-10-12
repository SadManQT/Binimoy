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
  acceptDelivery,
  getDeliveryView,
  recordInspection,
  submitDelivery,
  type VerifyVaultEvent,
} from "./delivery";
import {
  createInvoice,
  dealBalances,
  getFunding,
  ingestPaymentEvent,
  signMockEvent,
  startFunding,
} from "./ledger";
import { migrate } from "./migrate";
import {
  commitDispatch,
  dispatchSettlements,
  type MockBehavior,
  mockTransferAdapter,
  openDispute,
  reconcileOperations,
  refundOverdueDeliveries,
} from "./settlement";
import { testPool } from "./testing";

const SECRET = "test-webhook-secret";
const AMOUNT = 250000n;
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

// A software-license deal, agreed and funded with 2,500.00 BDT held.
async function fundedDeal(funded = true) {
  const seller = await newUser("Seller");
  const buyer = await newUser("Buyer");
  const deal = await createDeal(pool, seller, {
    role: "seller",
    templateId: "software_license",
    templateVersion: 1,
    title: "Settlement test",
    mode: "ai_first",
    amountMinor: AMOUNT.toString(),
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
  for (const [userId, command] of [
    [seller, "ProposeAgreement"],
    [buyer, "AcceptAgreement"],
    [seller, "AcceptAgreement"],
  ] as const) {
    const view = await getDealView(pool, userId, deal.dealId);
    if (!view) throw new Error("no view");
    await agreementCommand(pool, "test", {
      userId,
      agreementId: deal.agreementId,
      command,
      envelope: envelope(view.agreement.aggregateVersion, {
        termsHash: view.agreement.termsHash,
      }),
    });
  }
  if (funded) {
    const invoice = await createInvoice(pool, buyer, deal.dealId);
    if (!invoice.ok) throw new Error("invoice failed");
    await startFunding(pool, "test", {
      userId: buyer,
      invoiceId: invoice.invoiceId,
      envelope: envelope(1),
    });
    const funding = await getFunding(pool, deal.dealId);
    const body = JSON.stringify({
      eventId: `evt-${randomUUID()}`,
      type: "payment.succeeded",
      paymentRef: funding?.paymentRef,
      amountMinor: AMOUNT.toString(),
      currency: "BDT",
    });
    await ingestPaymentEvent(pool, "test", {
      rawBody: body,
      signature: signMockEvent(body, SECRET),
      secret: SECRET,
    });
  }
  return { dealId: deal.dealId, seller, buyer };
}
type Deal = Awaited<ReturnType<typeof fundedDeal>>;

const genuine: VerifyVaultEvent = async () => true;
const FULL = [
  { itemId: "license_identity", declared: true },
  { itemId: "distribution_rights", declared: true },
  { itemId: "key_delivered", vaultEventId: "$event" },
];
const deliver = (
  deal: Deal,
  items: unknown = FULL,
  verify = genuine,
  by = deal.seller,
) => submitDelivery(pool, verify, { userId: by, dealId: deal.dealId, items });

async function inspect(
  deal: Deal,
  itemId: string,
  outcome: string,
  by = deal.buyer,
) {
  const view = await getDeliveryView(pool, deal.dealId);
  const found = view.package?.inspections.find((i) => i.itemId === itemId);
  if (!found) throw new Error(`no inspection for ${itemId}`);
  return recordInspection(pool, {
    userId: by,
    inspectionId: found.inspectionId,
    outcome,
  });
}
// Delivered, every mandatory item passed, accepted by the buyer.
async function acceptedDelivery(deal: Deal) {
  const delivered = await deliver(deal);
  if (!delivered.ok) throw new Error(`deliver failed: ${delivered.error}`);
  await inspect(deal, "activation_works", "PASSED");
  await inspect(deal, "license_terms_confirmed", "PASSED");
  const accepted = await acceptDelivery(pool, {
    userId: deal.buyer,
    packageId: delivered.packageId,
  });
  if (!accepted.ok) throw new Error(`accept failed: ${accepted.error}`);
  return { ...delivered, authorizationId: accepted.authorizationId };
}
const states = async (deal: Deal) => {
  const view = await getDeliveryView(pool, deal.dealId);
  return {
    authorization: view.settlement?.state,
    operation: view.settlement?.operations[0]?.state,
  };
};
const transfers = async (authorizationId: string) =>
  (
    await pool.query(
      "select count(*)::int as n from mock_transfer where adapter_key like $1",
      [`binimoy:${authorizationId}:%`],
    )
  ).rows[0].n as number;
const adapter = (mode: MockBehavior = "ok") =>
  mockTransferAdapter(pool, () => mode);
const balances = (deal: Deal) => dealBalances(pool, deal.dealId);

test("the whole happy path: deliver, inspect, accept, pay the seller", async () => {
  const deal = await fundedDeal();
  const delivered = await deliver(deal);
  expect(delivered).toMatchObject({ ok: true, versionNo: 1 });
  // B5 step 7: the seller clicking "delivered" moved no money.
  expect(await balances(deal)).toMatchObject({ held: AMOUNT, reserved: 0n });

  const view = await getDeliveryView(pool, deal.dealId);
  const state = (itemId: string) =>
    view.package?.inspections.find((i) => i.itemId === itemId)?.state;
  expect(state("license_identity")).toBe("PASSED");
  expect(state("key_delivered")).toBe("PASSED");
  expect(state("activation_works")).toBe("PENDING");
  expect(state("renewal_and_expiry")).toBe("PENDING");

  expect(await inspect(deal, "activation_works", "PASSED")).toMatchObject({
    ok: true,
  });
  expect(
    await inspect(deal, "license_terms_confirmed", "PASSED"),
  ).toMatchObject({ ok: true });
  if (!delivered.ok) throw new Error("unreachable");
  const accepted = await acceptDelivery(pool, {
    userId: deal.buyer,
    packageId: delivered.packageId,
  });
  expect(accepted).toMatchObject({ ok: true });
  // Authorized and reserved, but not yet paid (INV-06).
  expect(await balances(deal)).toMatchObject({
    held: 0n,
    reserved: AMOUNT,
    sellerPaid: 0n,
    conserved: true,
  });
  expect(await states(deal)).toEqual({
    authorization: "RESERVED",
    operation: "NOT_SENT",
  });

  // The dispatcher is global, so other tests' deals may be sent too. Every
  // assertion below is about this deal only.
  await dispatchSettlements(pool, adapter());
  expect(await balances(deal)).toMatchObject({
    held: 0n,
    reserved: 0n,
    sellerPaid: AMOUNT,
    buyerRefunded: 0n,
    conserved: true,
  });
  expect(await states(deal)).toEqual({
    authorization: "CONSUMED",
    operation: "SUCCEEDED",
  });
});

test("an incomplete, unverified or unauthorized submission is not a delivery", async () => {
  const deal = await fundedDeal();
  expect(
    await deliver(
      deal,
      FULL.filter((i) => i.itemId !== "key_delivered"),
    ),
  ).toEqual({ ok: false, error: "INCOMPLETE_DELIVERY" });
  expect(
    await deliver(deal, [
      { itemId: "license_identity", declared: false },
      ...FULL.slice(1),
    ]),
  ).toEqual({ ok: false, error: "INCOMPLETE_DELIVERY" });
  // The homeserver does not confirm the event as the seller's.
  expect(await deliver(deal, FULL, async () => false)).toEqual({
    ok: false,
    error: "VAULT_INVALID",
  });
  expect(await deliver(deal, FULL, genuine, deal.buyer)).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  expect(
    await deliver(deal, [
      ...FULL,
      { itemId: "activation_works", declared: true },
    ]),
  ).toEqual({ ok: false, error: "VALIDATION_FAILED" });
  expect((await getDeliveryView(pool, deal.dealId)).package).toBeNull();

  const unfunded = await fundedDeal(false);
  expect(await deliver(unfunded)).toEqual({
    ok: false,
    error: "ILLEGAL_TRANSITION",
  });
});

test("acceptance needs every mandatory item passed, in dependency order, by the buyer", async () => {
  const deal = await fundedDeal();
  const delivered = await deliver(deal);
  if (!delivered.ok) throw new Error("deliver failed");
  const accept = (by = deal.buyer) =>
    acceptDelivery(pool, { userId: by, packageId: delivered.packageId });

  expect(await accept()).toEqual({ ok: false, error: "INCOMPLETE_DELIVERY" });
  // license_terms_confirmed depends on activation_works.
  expect(await inspect(deal, "license_terms_confirmed", "PASSED")).toEqual({
    ok: false,
    error: "INCOMPLETE_DELIVERY",
  });
  // The seller cannot pass the buyer's checks, and the buyer cannot record an
  // item whose proof is not the buyer's own test.
  expect(
    await inspect(deal, "activation_works", "PASSED", deal.seller),
  ).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  expect(await inspect(deal, "key_delivered", "FAILED")).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });

  await inspect(deal, "activation_works", "FAILED");
  expect(await accept()).toEqual({ ok: false, error: "INCOMPLETE_DELIVERY" });
  // "Cannot check" is not a pass either.
  await inspect(deal, "activation_works", "UNKNOWN");
  expect(await accept()).toEqual({ ok: false, error: "INCOMPLETE_DELIVERY" });

  await inspect(deal, "activation_works", "PASSED");
  await inspect(deal, "license_terms_confirmed", "PASSED");
  expect(await accept(deal.seller)).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  // The optional item is still pending and does not block acceptance.
  expect(await accept()).toMatchObject({ ok: true });
  // Every attempt is on record, not just the last one.
  const { rows } = await pool.query(
    `select r.outcome from inspection_result r
     join inspection_item i on i.inspection_id = r.inspection_id
     where i.package_id = $1 and i.item_id = 'activation_works' order by r.id`,
    [delivered.packageId],
  );
  expect(rows.map((r) => r.outcome)).toEqual(["FAILED", "UNKNOWN", "PASSED"]);
});

test("V7-13: a replacement invalidates the old version's checks, acceptance and unsent authorization", async () => {
  const deal = await fundedDeal();
  const first = await acceptedDelivery(deal);
  expect(await balances(deal)).toMatchObject({ held: 0n, reserved: AMOUNT });

  const second = await deliver(deal);
  expect(second).toMatchObject({ ok: true, versionNo: 2 });
  expect(await balances(deal)).toMatchObject({
    held: AMOUNT,
    reserved: 0n,
    conserved: true,
  });
  await dispatchSettlements(pool, adapter());
  expect(await transfers(first.authorizationId)).toBe(0);

  const old = await pool.query(
    `select a.state from inspection_item i join aggregate a on a.id = i.inspection_id
     where i.package_id = $1`,
    [first.packageId],
  );
  expect(new Set(old.rows.map((r) => r.state))).toEqual(new Set(["STALE"]));
  expect(
    await acceptDelivery(pool, {
      userId: deal.buyer,
      packageId: first.packageId,
    }),
  ).toEqual({ ok: false, error: "VERSION_CONFLICT" });
  // The new version starts its buyer checks from scratch.
  if (!second.ok) throw new Error("unreachable");
  expect(
    await acceptDelivery(pool, {
      userId: deal.buyer,
      packageId: second.packageId,
    }),
  ).toEqual({ ok: false, error: "INCOMPLETE_DELIVERY" });
});

test("accepting twice and dispatching from two workers pays exactly once", async () => {
  const deal = await fundedDeal();
  const first = await acceptedDelivery(deal);
  const again = await acceptDelivery(pool, {
    userId: deal.buyer,
    packageId: first.packageId,
  });
  expect(again).toEqual({ ok: true, authorizationId: first.authorizationId });

  await Promise.all([
    dispatchSettlements(pool, adapter()),
    dispatchSettlements(pool, adapter()),
  ]);
  expect(await transfers(first.authorizationId)).toBe(1);
  expect(await balances(deal)).toMatchObject({
    sellerPaid: AMOUNT,
    conserved: true,
  });
});

test("V7-07: a timeout after the provider succeeded stays reserved until reconciled, then pays once", async () => {
  const deal = await fundedDeal();
  const { authorizationId } = await acceptedDelivery(deal);
  await dispatchSettlements(pool, adapter("timeout_after_success"));
  expect(await states(deal)).toEqual({
    authorization: "CONSUMED",
    operation: "UNKNOWN",
  });
  // Not paid as far as we know, and not available for anything else.
  expect(await balances(deal)).toMatchObject({
    held: 0n,
    reserved: AMOUNT,
    sellerPaid: 0n,
  });

  await reconcileOperations(pool, adapter());
  await reconcileOperations(pool, adapter());
  expect(await states(deal)).toEqual({
    authorization: "CONSUMED",
    operation: "SUCCEEDED",
  });
  expect(await balances(deal)).toMatchObject({
    reserved: 0n,
    sellerPaid: AMOUNT,
    conserved: true,
  });
  expect(await transfers(authorizationId)).toBe(1);
});

test("a pending transfer stays reserved and settles when the provider finishes", async () => {
  const deal = await fundedDeal();
  const { authorizationId } = await acceptedDelivery(deal);
  await dispatchSettlements(pool, adapter("pending"));
  expect((await states(deal)).operation).toBe("PENDING");
  expect(await balances(deal)).toMatchObject({
    reserved: AMOUNT,
    sellerPaid: 0n,
  });

  await reconcileOperations(pool, adapter());
  expect((await states(deal)).operation).toBe("PENDING");
  // The provider completes it later.
  await pool.query(
    "update mock_transfer set status = 'SUCCEEDED' where adapter_key like $1",
    [`binimoy:${authorizationId}:%`],
  );
  await reconcileOperations(pool, adapter());
  expect((await states(deal)).operation).toBe("SUCCEEDED");
  expect(await balances(deal)).toMatchObject({
    sellerPaid: AMOUNT,
    conserved: true,
  });
});

test("a final failure returns the reservation to held and pays nobody", async () => {
  const deal = await fundedDeal();
  await acceptedDelivery(deal);
  await dispatchSettlements(pool, adapter("fail"));
  expect((await states(deal)).operation).toBe("FAILED_FINAL");
  expect(await balances(deal)).toMatchObject({
    held: AMOUNT,
    reserved: 0n,
    sellerPaid: 0n,
    conserved: true,
  });
});

test("V7-08: a request lost before the provider, or a crash before sending, is retried under the same key", async () => {
  const lost = await fundedDeal();
  const first = await acceptedDelivery(lost);
  await dispatchSettlements(pool, adapter("timeout_before_send"));
  expect((await states(lost)).operation).toBe("UNKNOWN");
  expect(await transfers(first.authorizationId)).toBe(0);
  await reconcileOperations(pool, adapter());
  expect(await transfers(first.authorizationId)).toBe(1);
  expect(await balances(lost)).toMatchObject({
    sellerPaid: AMOUNT,
    conserved: true,
  });

  // The worker dies right after the dispatch commit, before calling the adapter.
  const crashed = await fundedDeal();
  const second = await acceptedDelivery(crashed);
  expect(await commitDispatch(pool, second.authorizationId)).toHaveLength(1);
  expect(await states(crashed)).toEqual({
    authorization: "CONSUMED",
    operation: "DISPATCH_COMMITTED",
  });
  // A new worker's dispatcher has nothing to pick up; reconciliation does.
  await dispatchSettlements(pool, adapter());
  await reconcileOperations(pool, adapter());
  expect(await transfers(second.authorizationId)).toBe(1);
  expect(await balances(crashed)).toMatchObject({
    sellerPaid: AMOUNT,
    conserved: true,
  });
});

test("no delivery by the deadline refunds the buyer; a later submission is refused (V7-11)", async () => {
  const deal = await fundedDeal();
  expect(await refundOverdueDeliveries(pool)).toBe(0);
  await pool.query(
    "update deal_deadline set delivery_due_at = now() - interval '1 minute' where deal_id = $1",
    [deal.dealId],
  );
  expect(await refundOverdueDeliveries(pool)).toBeGreaterThanOrEqual(1);
  expect(await refundOverdueDeliveries(pool)).toBe(0);
  expect(await balances(deal)).toMatchObject({ held: 0n, reserved: AMOUNT });

  expect(await deliver(deal)).toEqual({
    ok: false,
    error: "ILLEGAL_TRANSITION",
  });
  await dispatchSettlements(pool, adapter());
  expect(await balances(deal)).toMatchObject({
    buyerRefunded: AMOUNT,
    sellerPaid: 0n,
    reserved: 0n,
    conserved: true,
  });
});

test("V7-11: a delivery that arrives before the refund is inspected instead", async () => {
  const deal = await fundedDeal();
  await pool.query(
    "update deal_deadline set delivery_due_at = now() - interval '1 minute' where deal_id = $1",
    [deal.dealId],
  );
  expect(await deliver(deal)).toMatchObject({ ok: true });
  await refundOverdueDeliveries(pool);
  expect((await getDeliveryView(pool, deal.dealId)).settlement).toBeNull();
  expect(await balances(deal)).toMatchObject({
    held: AMOUNT,
    buyerRefunded: 0n,
  });
});

test("V7-10: a dispute before dispatch holds the money and nothing is sent", async () => {
  const deal = await fundedDeal();
  const { authorizationId, packageId } = await acceptedDelivery(deal);
  const dispute = await openDispute(pool, {
    userId: deal.buyer,
    dealId: deal.dealId,
    claim: "CANNOT_ACCESS",
    detail: "invalid credentials",
  });
  expect(dispute).toMatchObject({ ok: true, afterDispatch: false });
  expect(await states(deal)).toMatchObject({ authorization: "INVALIDATED" });
  expect(await balances(deal)).toMatchObject({
    held: AMOUNT,
    reserved: 0n,
    conserved: true,
  });
  await dispatchSettlements(pool, adapter());
  expect(await transfers(authorizationId)).toBe(0);
  // Acceptance cannot be used to slip past an open dispute.
  expect(await acceptDelivery(pool, { userId: deal.buyer, packageId })).toEqual(
    {
      ok: false,
      error: "DISPUTE_OPEN",
    },
  );
  // Opening it again returns the same case.
  expect(
    await openDispute(pool, {
      userId: deal.seller,
      dealId: deal.dealId,
      claim: "OTHER",
    }),
  ).toEqual(dispute);
});

test("V7-10: a dispute after the dispatch commit is recorded as such and the transfer is not pretended away", async () => {
  const deal = await fundedDeal();
  const { authorizationId } = await acceptedDelivery(deal);
  await commitDispatch(pool, authorizationId);
  const dispute = await openDispute(pool, {
    userId: deal.buyer,
    dealId: deal.dealId,
    claim: "WRONG_PRODUCT",
  });
  expect(dispute).toMatchObject({ ok: true, afterDispatch: true });
  // The reservation is not handed back while the transfer may be underway.
  expect(await balances(deal)).toMatchObject({ held: 0n, reserved: AMOUNT });
  await reconcileOperations(pool, adapter());
  expect(await balances(deal)).toMatchObject({
    sellerPaid: AMOUNT,
    conserved: true,
  });
  expect((await getDeliveryView(pool, deal.dealId)).dispute).toMatchObject({
    claim: "WRONG_PRODUCT",
    state: "OPEN",
    afterDispatch: true,
  });
});

test("only a party can open a dispute, only on a funded deal, only with a known claim", async () => {
  const deal = await fundedDeal();
  const outsider = await newUser("Outsider");
  const open = (userId: string, dealId: string, claim: string) =>
    openDispute(pool, { userId, dealId, claim });
  expect(await open(outsider, deal.dealId, "OTHER")).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  expect(await open(deal.buyer, deal.dealId, "SELLER_IS_A_SCAMMER")).toEqual({
    ok: false,
    error: "VALIDATION_FAILED",
  });
  const unfunded = await fundedDeal(false);
  expect(await open(unfunded.buyer, unfunded.dealId, "OTHER")).toEqual({
    ok: false,
    error: "ILLEGAL_TRANSITION",
  });
});
