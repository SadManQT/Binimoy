import { getTemplate } from "@lp/templates";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  acceptDelivery,
  getDeliveryView,
  recordInspection,
  submitDelivery,
} from "./delivery";
import { createInvoice, dealBalances } from "./ledger";
import { migrate } from "./migrate";
import { deliverOutbox, listNotices, renderNotices } from "./notices";
import { getOps, setPause } from "./ops";
import { getReceipt } from "./receipt";
import {
  dispatchSettlements,
  mockTransferAdapter,
  openDispute,
  reconcileOperations,
} from "./settlement";
import { testPool } from "./testing";
import {
  agreedDeal,
  fundedDeal,
  newUser,
  sellerItems,
  TEST_AMOUNT,
  type TestDeal,
} from "./testkit";
import { setMockFact, verifyDeal } from "./verification";

const pool = await testPool();
beforeAll(async () => {
  await migrate(pool);
});
afterAll(async () => {
  // A pause is global: never leave one behind for the next test file.
  for (const kind of ["funding", "settlement", "research", "ai"] as const) {
    await setPause(pool, {
      kind,
      paused: false,
      actor: "operator:test",
      reason: "test cleanup",
    });
  }
  await pool.end();
});

const TOPUP = getTemplate("game_topup", 1);
const LICENSE = getTemplate("software_license", 1);
const adapter = () => mockTransferAdapter(pool);

async function deliver(deal: TestDeal) {
  const delivered = await submitDelivery(pool, async () => true, {
    userId: deal.seller,
    dealId: deal.dealId,
    items: sellerItems(deal.template),
  });
  if (!delivered.ok) throw new Error(`deliver: ${delivered.error}`);
  return delivered.packageId;
}
// The fictional supplier confirms everything, for the agreed player ID.
async function proven(deal: TestDeal) {
  for (const predicate of [
    "mock_topup.supplier_authorized",
    "mock_topup.fulfilled_to_destination",
    "mock_topup.quantity_matches",
  ]) {
    await setMockFact(pool, {
      userId: deal.seller,
      dealId: deal.dealId,
      fact: { predicate, outcome: "PASSED", boundTo: deal.product.player_id },
    });
  }
}
const windowOf = async (deal: TestDeal) =>
  (await getDeliveryView(pool, deal.dealId)).package;
const paths = async (deal: TestDeal) =>
  (
    await pool.query(
      `select s.path from settlement_authorization s join aggregate a on a.id = s.authorization_id
       where s.deal_id = $1 and a.state <> 'INVALIDATED'`,
      [deal.dealId],
    )
  ).rows.map((r) => r.path as string);
const kinds = async (userId: string, dealId: string) =>
  (await listNotices(pool, userId))
    .filter((n) => n.dealId === dealId)
    .map((n) => n.kind);

test("V7-15: the challenge period starts only when the buyer has been shown the notice", async () => {
  const deal = await fundedDeal(pool, TOPUP);
  const packageId = await deliver(deal);
  await proven(deal);

  // Proven, and the buyer has a notice waiting. The clock has not started.
  expect(await windowOf(deal)).toMatchObject({
    objectiveNoticePending: true,
    objectiveDueAt: null,
  });
  expect(await kinds(deal.buyer, deal.dealId)).toContain(
    "OBJECTIVE_RELEASE_NOTICE",
  );
  expect(await kinds(deal.seller, deal.dealId)).not.toContain(
    "OBJECTIVE_RELEASE_NOTICE",
  );
  // The seller reading their own notices is not the buyer being told.
  await renderNotices(pool, deal.seller);
  // Any amount of waiting changes nothing: silence without notice is not consent.
  await pool.query(
    "update objective_window set opened_at = now() - interval '30 days' where package_id = $1",
    [packageId],
  );
  await verifyDeal(pool, deal.dealId);
  expect(await paths(deal)).toEqual([]);
  expect((await windowOf(deal))?.objectiveDueAt).toBeNull();

  // The buyer's authenticated page shows it: the full period starts now.
  const before = Date.now();
  await renderNotices(pool, deal.buyer);
  const due = (await windowOf(deal))?.objectiveDueAt as Date;
  const hours = TOPUP.timing.objectiveChallengeHours as number;
  expect(due.getTime()).toBeGreaterThanOrEqual(
    before + hours * 3_600_000 - 5000,
  );
  // Showing it again does not move the deadline.
  await renderNotices(pool, deal.buyer);
  expect((await windowOf(deal))?.objectiveDueAt).toEqual(due);

  await verifyDeal(pool, deal.dealId);
  expect(await paths(deal)).toEqual([]);
  await pool.query(
    "update objective_window set due_at = now() - interval '1 second' where package_id = $1",
    [packageId],
  );
  await verifyDeal(pool, deal.dealId);
  expect(await paths(deal)).toEqual(["OBJECTIVE_RELEASE"]);
});

test("V7-16: evidence that changes during the challenge period needs a new notice and a full new period", async () => {
  const deal = await fundedDeal(pool, TOPUP);
  await deliver(deal);
  await proven(deal);
  await renderNotices(pool, deal.buyer);
  expect((await windowOf(deal))?.objectiveDueAt).not.toBeNull();

  const set = (outcome: string) =>
    setMockFact(pool, {
      userId: deal.seller,
      dealId: deal.dealId,
      fact: { predicate: "mock_topup.quantity_matches", outcome },
    });
  await set("UNKNOWN");
  expect(await windowOf(deal)).toMatchObject({
    objectiveNoticePending: false,
    objectiveDueAt: null,
  });
  await set("PASSED");
  // The old acknowledgment does not carry over to the new proof.
  expect(await windowOf(deal)).toMatchObject({
    objectiveNoticePending: true,
    objectiveDueAt: null,
  });
  expect(
    (await kinds(deal.buyer, deal.dealId)).filter(
      (k) => k === "OBJECTIVE_RELEASE_NOTICE",
    ),
  ).toHaveLength(2);
});

test("notices follow the recorded events, once each, to the right people, with no private content", async () => {
  const deal = await fundedDeal(pool, LICENSE);
  const packageId = await deliver(deal);
  const view = await getDeliveryView(pool, deal.dealId);
  for (const itemId of ["activation_works", "license_terms_confirmed"]) {
    const row = view.package?.inspections.find((i) => i.itemId === itemId);
    await recordInspection(pool, {
      userId: deal.buyer,
      inspectionId: row?.inspectionId as string,
      outcome: "PASSED",
    });
  }
  await acceptDelivery(pool, { userId: deal.buyer, packageId });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await reconcileOperations(pool, adapter());
    await dispatchSettlements(pool, adapter());
    if ((await dealBalances(pool, deal.dealId)).sellerPaid === TEST_AMOUNT)
      break;
  }
  // The suite shares a schema: drain until this deal's last event is through.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await deliverOutbox(pool, "test-worker");
    if (
      (await kinds(deal.seller, deal.dealId)).includes("TRANSFER_COMPLETED")
    ) {
      break;
    }
  }
  const buyer = await kinds(deal.buyer, deal.dealId);
  const seller = await kinds(deal.seller, deal.dealId);
  for (const kind of [
    "AGREEMENT_ACCEPTED",
    "FUNDING_CONFIRMED",
    "SETTLEMENT_AUTHORIZED",
    "TRANSFER_COMPLETED",
  ]) {
    expect(buyer, kind).toContain(kind);
    expect(seller, kind).toContain(kind);
  }
  // The buyer is told a delivery arrived; the seller, who sent it, is not.
  expect(buyer).toContain("DELIVERY_SUBMITTED");
  expect(seller).not.toContain("DELIVERY_SUBMITTED");
  // Draining again adds nothing.
  await deliverOutbox(pool, "test-worker");
  expect(await kinds(deal.buyer, deal.dealId)).toEqual(buyer);
  expect(new Set(buyer).size).toBe(buyer.length);

  // D.6: minimal metadata only. No vault reference, no amount of prose.
  const mine = (await listNotices(pool, deal.buyer)).filter(
    (n) => n.dealId === deal.dealId,
  );
  expect(JSON.stringify(mine)).not.toContain("$");
  expect(await listNotices(pool, await newUser(pool))).toEqual([]);

  // A dispute tells the other party at once.
  await openDispute(pool, {
    userId: deal.buyer,
    dealId: deal.dealId,
    claim: "LOST_ACCESS_LATER",
    detail: "the key stopped working",
  });
  expect(await kinds(deal.seller, deal.dealId)).toContain("DISPUTE_OPENED");
  expect(JSON.stringify(await listNotices(pool, deal.seller))).not.toContain(
    "stopped working",
  );
});

test("V7-38: an operator pause stops new funding or undispatched settlement, and nothing else", async () => {
  const pause = (kind: "funding" | "settlement", paused: boolean) =>
    setPause(pool, {
      kind,
      paused,
      actor: "operator:test",
      reason: paused ? "incident drill" : "drill over",
    });
  try {
    const unfunded = await agreedDeal(pool, LICENSE);
    await pause("funding", true);
    expect(await createInvoice(pool, unfunded.buyer, unfunded.dealId)).toEqual({
      ok: false,
      error: "PAUSED",
    });
    expect((await getOps(pool)).paused).toMatchObject({
      funding: { reason: "incident drill", by: "operator:test" },
    });
    await pause("funding", false);
    expect(
      await createInvoice(pool, unfunded.buyer, unfunded.dealId),
    ).toMatchObject({ ok: true });

    // A reserved, undispatched payout waits while settlement is paused.
    const deal = await fundedDeal(pool, TOPUP);
    const packageId = await deliver(deal);
    await proven(deal);
    await pause("settlement", true);
    expect(
      await acceptDelivery(pool, { userId: deal.buyer, packageId }),
    ).toMatchObject({ ok: true });
    expect(await dispatchSettlements(pool, adapter())).toBe(0);
    expect(await dealBalances(pool, deal.dealId)).toMatchObject({
      reserved: TEST_AMOUNT,
      sellerPaid: 0n,
    });
    // Status and dispute intake still work during the pause.
    expect((await getDeliveryView(pool, deal.dealId)).settlement?.state).toBe(
      "RESERVED",
    );
    expect(
      await openDispute(pool, {
        userId: deal.buyer,
        dealId: deal.dealId,
        claim: "OTHER",
        detail: "raised during the pause",
      }),
    ).toMatchObject({ ok: true });
    await pause("settlement", false);
    // INV-09: the dispute raised during the pause holds the money after it.
    await dispatchSettlements(pool, adapter());
    expect(await dealBalances(pool, deal.dealId)).toMatchObject({
      held: TEST_AMOUNT,
      sellerPaid: 0n,
    });
    // Every pause and resume is on record with who and why.
    expect(
      (await getOps(pool)).audit.filter((a) => a.actor === "operator:test")
        .length,
    ).toBeGreaterThanOrEqual(4);
  } finally {
    await pause("funding", false);
    await pause("settlement", false);
  }
});

test("FE-24: a receipt reconstructs the deal at its bound versions, without secrets, for parties only", async () => {
  const deal = await fundedDeal(pool, LICENSE);
  const first = await deliver(deal);
  const second = await deliver(deal);
  const view = await getDeliveryView(pool, deal.dealId);
  for (const itemId of ["activation_works", "license_terms_confirmed"]) {
    const row = view.package?.inspections.find((i) => i.itemId === itemId);
    await recordInspection(pool, {
      userId: deal.buyer,
      inspectionId: row?.inspectionId as string,
      outcome: "PASSED",
    });
  }
  await acceptDelivery(pool, { userId: deal.buyer, packageId: second });

  expect(
    await getReceipt(pool, {
      userId: await newUser(pool),
      dealId: deal.dealId,
    }),
  ).toBeNull();
  const receipt = await getReceipt(pool, {
    userId: deal.seller,
    dealId: deal.dealId,
  });
  if (!receipt) throw new Error("no receipt");
  expect(receipt).toMatchObject({
    synthetic: true,
    agreement: {
      versionNo: 1,
      templateId: "software_license",
      mode: "ai_first",
      amountMinor: TEST_AMOUNT.toString(),
    },
    funding: { state: "CONFIRMED" },
  });
  expect(receipt.agreement.termsHash).toMatch(/^[0-9a-f]{64}$/);
  expect(Date.parse(receipt.generatedAt)).not.toBeNaN();
  // Both package versions, the replaced one marked as such.
  expect(receipt.packages.map((p) => [p.versionNo, p.state])).toEqual([
    [1, "SUPERSEDED"],
    [2, "SUBMITTED"],
  ]);
  expect(receipt.packages[0]?.packageId).toBe(first);
  const accepted = receipt.packages[1];
  expect(accepted?.accepted).toBe(true);
  // Every result with where it came from; an untested optional item is
  // shown as pending, not as passed.
  expect(
    accepted?.inspections.find((i) => i.itemId === "key_delivered"),
  ).toMatchObject({ state: "PASSED", proofType: "independent_fact" });
  expect(
    accepted?.inspections.find((i) => i.itemId === "renewal_and_expiry"),
  ).toMatchObject({ state: "PASSED", proofType: "seller_statement" });
  expect(receipt.allocations).toMatchObject([
    {
      path: "ACCEPTED_RELEASE",
      state: "RESERVED",
      toSellerMinor: TEST_AMOUNT.toString(),
      toBuyerMinor: "0",
      operations: [{ kind: "payout", state: "NOT_SENT" }],
    },
  ]);
  // Reserved is not paid: the receipt says the transfer is still open.
  expect(receipt.pending).toBe(true);
  expect(receipt.balances).toMatchObject({
    reservedMinor: TEST_AMOUNT.toString(),
    sellerPaidMinor: "0",
  });
  // D.12: no vault reference, no user id, no conversation.
  const serialized = JSON.stringify(receipt);
  expect(serialized).not.toContain("$");
  expect(serialized).not.toContain(deal.buyer);
  expect(serialized).not.toMatch(/reputation|trust|score/i);
});
