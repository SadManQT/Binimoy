import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { grantStaffRole, revokeStaffRole } from "./access";
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
  getFunding,
  ingestPaymentEvent,
  signMockEvent,
  startFunding,
} from "./ledger";
import { migrate } from "./migrate";
import {
  acceptResolutionProposal,
  appealDecision,
  claimDeal,
  claimReview,
  closeUnresolvedAiOnly,
  decide,
  finalizeDecisions,
  getCase,
  getDisputeView,
  proposeResolution,
  reopenDispute,
  requestReview,
  reviewQueue,
  waiveAppeal,
} from "./review";
import {
  dispatchSettlements,
  mockTransferAdapter,
  openDispute,
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
async function reviewer(name = "Reviewer"): Promise<string> {
  const id = await newUser(name);
  await grantStaffRole(pool, {
    userId: id,
    role: "reviewer",
    grantedBy: "operator:test",
    reason: "test",
  });
  return id;
}
const envelope = (version: number, payload = {}) => ({
  commandId: randomUUID(),
  idempotencyKey: `key-${randomUUID()}`,
  expectedAggregateVersion: version,
  payload,
});

async function agreedDeal(mode: string) {
  const seller = await newUser("Seller");
  const buyer = await newUser("Buyer");
  const deal = await createDeal(pool, seller, {
    role: "seller",
    templateId: "software_license",
    templateVersion: 1,
    title: "Review test",
    mode,
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
  return { dealId: deal.dealId, seller, buyer };
}
type Deal = Awaited<ReturnType<typeof agreedDeal>>;

async function fund(deal: Deal) {
  const invoice = await createInvoice(pool, deal.buyer, deal.dealId);
  if (!invoice.ok) return invoice;
  await startFunding(pool, "test", {
    userId: deal.buyer,
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
  return invoice;
}

// A funded deal with an open dispute raised by the buyer.
async function disputed(mode = "ai_first") {
  const deal = await agreedDeal(mode);
  await fund(deal);
  const dispute = await openDispute(pool, {
    userId: deal.buyer,
    dealId: deal.dealId,
    claim: "CANNOT_ACCESS",
    detail: "invalid credentials after delivery",
  });
  if (!dispute.ok) throw new Error("dispute failed");
  return { ...deal, disputeId: dispute.disputeId };
}
// Queued and claimed: the reviewer is on the case, state REVIEWING.
async function underReview() {
  const deal = await disputed();
  await requestReview(pool, { userId: deal.buyer, dealId: deal.dealId });
  const first = await reviewer();
  const claimed = await claimReview(pool, {
    reviewerId: first,
    disputeId: deal.disputeId,
  });
  if (!("ok" in claimed) || !claimed.ok) throw new Error("claim failed");
  return { ...deal, first };
}

const state = async (deal: Deal) =>
  (await getDisputeView(pool, deal.buyer, deal.dealId)).dispute?.state;
const balances = (deal: Deal) => dealBalances(pool, deal.dealId);
const pay = () => dispatchSettlements(pool, mockTransferAdapter(pool));
const allocation = (toSellerMinor: string) => ({
  outcome: "ALLOCATE",
  toSellerMinor,
  rule: "Agreement item activation_works; refund rule of the accepted terms.",
  facts: "Key delivered through the vault; buyer reported invalid credentials.",
  rejectedInferences: "No inference drawn from either party's tone.",
  reasoning: "Partial value was received; the split reflects what was usable.",
});

test("B9 mutual resolution: an exact split both parties approve is paid as agreed", async () => {
  const deal = await disputed();
  const proposed = await proposeResolution(pool, {
    userId: deal.seller,
    dealId: deal.dealId,
    toSellerMinor: "100000",
  });
  if (!("proposalId" in proposed)) throw new Error("propose failed");
  // Proposing moves nothing.
  expect(await balances(deal)).toMatchObject({ held: AMOUNT, reserved: 0n });
  // The proposer cannot supply the second consent.
  expect(
    await acceptResolutionProposal(pool, {
      userId: deal.seller,
      proposalId: proposed.proposalId,
    }),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
  const outsider = await newUser("Outsider");
  expect(
    await acceptResolutionProposal(pool, {
      userId: outsider,
      proposalId: proposed.proposalId,
    }),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });

  expect(
    await acceptResolutionProposal(pool, {
      userId: deal.buyer,
      proposalId: proposed.proposalId,
    }),
  ).toMatchObject({ ok: true });
  expect(await state(deal)).toBe("RESOLVED");
  await pay();
  expect(await balances(deal)).toMatchObject({
    sellerPaid: 100000n,
    buyerRefunded: 150000n,
    held: 0n,
    reserved: 0n,
    conserved: true,
  });
});

test("a proposal that was replaced, or exceeds what is held, cannot take effect", async () => {
  const deal = await disputed();
  const propose = (toSellerMinor: string) =>
    proposeResolution(pool, {
      userId: deal.seller,
      dealId: deal.dealId,
      toSellerMinor,
    });
  expect(await propose("999999999")).toEqual({
    ok: false,
    error: "VALIDATION_FAILED",
  });
  expect(await propose("12.50")).toEqual({
    ok: false,
    error: "VALIDATION_FAILED",
  });
  const first = await propose("200000");
  const second = await propose("50000");
  if (!("proposalId" in first) || !("proposalId" in second)) {
    throw new Error("propose failed");
  }
  // The buyer still has the first proposal on screen.
  expect(
    await acceptResolutionProposal(pool, {
      userId: deal.buyer,
      proposalId: first.proposalId,
    }),
  ).toEqual({ ok: false, error: "VERSION_CONFLICT" });
  expect(await balances(deal)).toMatchObject({ held: AMOUNT, reserved: 0n });
  expect(
    (await getDisputeView(pool, deal.buyer, deal.dealId)).proposal,
  ).toMatchObject({ toSellerMinor: "50000", toBuyerMinor: "200000" });
});

test("review cannot be requested in AI-only mode; an unresolved AI-only case closes without a winner (B13-15)", async () => {
  const deal = await disputed("ai_only");
  expect(
    await requestReview(pool, { userId: deal.buyer, dealId: deal.dealId }),
  ).toEqual({ ok: false, error: "REVIEW_UNAVAILABLE" });

  expect(await closeUnresolvedAiOnly(pool)).toBe(0);
  await pool.query(
    "update dispute set opened_at = now() - interval '8 days' where dispute_id = $1",
    [deal.disputeId],
  );
  expect(await closeUnresolvedAiOnly(pool)).toBeGreaterThanOrEqual(1);
  expect(await state(deal)).toBe("UNRESOLVED_CLOSED");
  // Nobody was paid; the money is still held.
  await pay();
  expect(await balances(deal)).toMatchObject({
    held: AMOUNT,
    sellerPaid: 0n,
    buyerRefunded: 0n,
  });
  // New evidence can reopen it, and the parties can still agree a split.
  expect(
    await reopenDispute(pool, { userId: deal.seller, dealId: deal.dealId }),
  ).toEqual({ ok: true });
  expect(await state(deal)).toBe("OPEN");
});

test("only an active staff reviewer who is not a party can take a case, and only one can (V7-18)", async () => {
  const deal = await disputed();
  await requestReview(pool, { userId: deal.seller, dealId: deal.dealId });
  expect(await state(deal)).toBe("QUEUED");
  const claim = (reviewerId: string) =>
    claimReview(pool, { reviewerId, disputeId: deal.disputeId });

  const nobody = await newUser("Not staff");
  expect(await claim(nobody)).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
  // A party who also holds the staff role is conflicted.
  await grantStaffRole(pool, {
    userId: deal.seller,
    role: "reviewer",
    grantedBy: "operator:test",
    reason: "test",
  });
  expect(await claim(deal.seller)).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  const revoked = await reviewer();
  await revokeStaffRole(pool, {
    userId: revoked,
    role: "reviewer",
    revokedBy: "operator:test",
  });
  expect(await claim(revoked)).toEqual({ ok: false, error: "NOT_AUTHORIZED" });

  const [a, b] = [await reviewer("A"), await reviewer("B")];
  const results = await Promise.all([claim(a), claim(b)]);
  expect(results.filter((r) => "ok" in r && r.ok)).toHaveLength(1);
  expect(await state(deal)).toBe("REVIEWING");
});

test("a case is readable only by its assigned reviewer, and only while assigned (D.2)", async () => {
  const deal = await underReview();
  const other = await reviewer("Other");
  const mine = await getCase(pool, deal.first, deal.disputeId);
  expect(mine).toMatchObject({
    kind: "review",
    claim: "CANNOT_ACCESS",
    openedBy: "buyer",
    state: "REVIEWING",
  });
  expect(mine?.balances.held).toBe(AMOUNT);
  expect(await getCase(pool, other, deal.disputeId)).toBeNull();
  expect(await getCase(pool, deal.buyer, deal.disputeId)).toBeNull();

  const queue = await reviewQueue(pool, deal.first);
  expect(
    queue?.cases.some((c) => c.disputeId === deal.disputeId && c.mine),
  ).toBe(true);
  expect(await reviewQueue(pool, deal.buyer)).toBeNull();

  // Losing the staff role ends the access, even mid-case.
  await revokeStaffRole(pool, {
    userId: deal.first,
    role: "reviewer",
    revokedBy: "operator:test",
  });
  expect(await getCase(pool, deal.first, deal.disputeId)).toBeNull();
  expect(
    await decide(pool, {
      reviewerId: deal.first,
      disputeId: deal.disputeId,
      decision: allocation("100000"),
    }),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
});

test("a decision needs reasons and the exact held amount, moves no money during the appeal window, then pays", async () => {
  const deal = await underReview();
  const decideAs = (reviewerId: string, decision: unknown) =>
    decide(pool, { reviewerId, disputeId: deal.disputeId, decision });

  expect(await decideAs(deal.buyer, allocation("100000"))).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  expect(
    await decideAs(deal.first, { ...allocation("100000"), reasoning: "  " }),
  ).toEqual({ ok: false, error: "VALIDATION_FAILED" });
  expect(await decideAs(deal.first, allocation("999999999"))).toEqual({
    ok: false,
    error: "INSUFFICIENT_HELD_FUNDS",
  });

  expect(await decideAs(deal.first, allocation("100000"))).toEqual({
    ok: true,
    state: "DECIDED_AWAITING_APPEAL",
  });
  const view = (await getDisputeView(pool, deal.seller, deal.dealId)).dispute;
  expect(view?.decisions[0]).toMatchObject({
    kind: "review",
    toSellerMinor: "100000",
    toBuyerMinor: "150000",
    rejectedInferences: "No inference drawn from either party's tone.",
  });
  expect(view?.appealable).toBe(true);

  // Inside the window nothing is authorized or sent.
  expect(await finalizeDecisions(pool)).toBe(0);
  await pay();
  expect(await balances(deal)).toMatchObject({ held: AMOUNT, reserved: 0n });

  await pool.query(
    "alter table review_decision disable trigger review_decision_append_only",
  );
  await pool.query(
    "update review_decision set appeal_deadline = now() - interval '1 minute' where dispute_id = $1",
    [deal.disputeId],
  );
  await pool.query(
    "alter table review_decision enable trigger review_decision_append_only",
  );
  expect(
    await appealDecision(pool, { userId: deal.buyer, dealId: deal.dealId }),
  ).toEqual({ ok: false, error: "APPEAL_WINDOW_CLOSED" });
  expect(await finalizeDecisions(pool)).toBeGreaterThanOrEqual(1);
  expect(await state(deal)).toBe("RESOLVED");
  await pay();
  expect(await balances(deal)).toMatchObject({
    sellerPaid: 100000n,
    buyerRefunded: 150000n,
    conserved: true,
  });
});

test("V7-17: a timely appeal holds the money and must be decided by a different reviewer", async () => {
  const deal = await underReview();
  await decide(pool, {
    reviewerId: deal.first,
    disputeId: deal.disputeId,
    decision: allocation("250000"),
  });
  const outsider = await newUser("Outsider");
  expect(
    await appealDecision(pool, { userId: outsider, dealId: deal.dealId }),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
  expect(
    await appealDecision(pool, { userId: deal.buyer, dealId: deal.dealId }),
  ).toEqual({ ok: true });
  expect(await state(deal)).toBe("APPEALED");
  // The first decision can no longer take effect by the passage of time.
  expect(await finalizeDecisions(pool)).toBe(0);
  await pay();
  expect(await balances(deal)).toMatchObject({ held: AMOUNT, reserved: 0n });

  // The original reviewer has lost the case and cannot take the appeal.
  expect(await getCase(pool, deal.first, deal.disputeId)).toBeNull();
  expect(
    await claimReview(pool, {
      reviewerId: deal.first,
      disputeId: deal.disputeId,
    }),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
  expect(
    await decide(pool, {
      reviewerId: deal.first,
      disputeId: deal.disputeId,
      decision: allocation("250000"),
    }),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });

  const second = await reviewer("Second");
  expect(
    await claimReview(pool, { reviewerId: second, disputeId: deal.disputeId }),
  ).toEqual({ ok: true, kind: "appeal" });
  const appealCase = await getCase(pool, second, deal.disputeId);
  // The appeal reviewer sees the original decision.
  expect(appealCase?.decisions).toHaveLength(1);
  expect(
    await decide(pool, {
      reviewerId: second,
      disputeId: deal.disputeId,
      decision: allocation("0"),
    }),
  ).toEqual({ ok: true, state: "RESOLVED" });
  await pay();
  // B13-20: the second reviewer disagreed; both decisions stay on record.
  expect(await balances(deal)).toMatchObject({
    sellerPaid: 0n,
    buyerRefunded: AMOUNT,
    conserved: true,
  });
  const final = (await getDisputeView(pool, deal.buyer, deal.dealId)).dispute;
  expect(final?.decisions.map((d) => [d.kind, d.toSellerMinor])).toEqual([
    ["review", "250000"],
    ["appeal", "0"],
  ]);
});

test("both parties giving up their appeal window makes the decision effective at once", async () => {
  const deal = await underReview();
  await decide(pool, {
    reviewerId: deal.first,
    disputeId: deal.disputeId,
    decision: allocation("250000"),
  });
  expect(
    await waiveAppeal(pool, { userId: deal.buyer, dealId: deal.dealId }),
  ).toEqual({ ok: true, finalized: false });
  // One party repeating their waiver is not two waivers.
  expect(
    await waiveAppeal(pool, { userId: deal.buyer, dealId: deal.dealId }),
  ).toEqual({ ok: true, finalized: false });
  expect(await state(deal)).toBe("DECIDED_AWAITING_APPEAL");
  expect(
    await waiveAppeal(pool, { userId: deal.seller, dealId: deal.dealId }),
  ).toEqual({ ok: true, finalized: true });
  expect(await state(deal)).toBe("RESOLVED");
  await pay();
  expect(await balances(deal)).toMatchObject({
    sellerPaid: AMOUNT,
    conserved: true,
  });
});

test("a reviewer may find the case unresolved; the money stays held (B10)", async () => {
  const deal = await underReview();
  expect(
    await decide(pool, {
      reviewerId: deal.first,
      disputeId: deal.disputeId,
      decision: { ...allocation("0"), outcome: "UNRESOLVED" },
    }),
  ).toEqual({ ok: true, state: "UNRESOLVED_CLOSED" });
  await pay();
  expect(await balances(deal)).toMatchObject({
    held: AMOUNT,
    sellerPaid: 0n,
    buyerRefunded: 0n,
  });
  expect(await getCase(pool, deal.first, deal.disputeId)).toBeNull();
});

test("B2 human-from-start: no funding until a reviewer joins, and a dispute goes straight to that reviewer", async () => {
  const deal = await agreedDeal("human_from_start");
  expect(await fund(deal)).toEqual({
    ok: false,
    error: "REVIEWER_NOT_ASSIGNED",
  });

  const assigned = await reviewer("Assigned");
  const queue = await reviewQueue(pool, assigned);
  expect(queue?.deals.some((d) => d.dealId === deal.dealId)).toBe(true);
  expect(
    await claimDeal(pool, { reviewerId: deal.buyer, dealId: deal.dealId }),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
  expect(
    await claimDeal(pool, { reviewerId: assigned, dealId: deal.dealId }),
  ).toEqual({ ok: true });
  const late = await reviewer("Late");
  expect(
    await claimDeal(pool, { reviewerId: late, dealId: deal.dealId }),
  ).toEqual({
    ok: false,
    error: "VERSION_CONFLICT",
  });

  expect(await fund(deal)).toMatchObject({ ok: true });
  expect((await balances(deal)).held).toBe(AMOUNT);

  const dispute = await openDispute(pool, {
    userId: deal.seller,
    dealId: deal.dealId,
    claim: "OTHER",
  });
  if (!dispute.ok) throw new Error("dispute failed");
  expect(await state(deal)).toBe("REVIEWING");
  expect(await getCase(pool, assigned, dispute.disputeId)).toMatchObject({
    kind: "review",
    openedBy: "seller",
  });
  expect(await getCase(pool, late, dispute.disputeId)).toBeNull();
});
