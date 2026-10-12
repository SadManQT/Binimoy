import { randomUUID } from "node:crypto";
import { PREDICATES, SERVICE_MODES, TEMPLATES } from "@lp/templates";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { grantStaffRole } from "./access";
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
} from "./delivery";
import { createPool, type Pool } from "./index";
import {
  createInvoice,
  dealBalances,
  getFunding,
  ingestPaymentEvent,
  signMockEvent,
  startFunding,
} from "./ledger";
import { migrate } from "./migrate";
import { renderNotices } from "./notices";
import {
  acceptResolutionProposal,
  claimDeal,
  claimReview,
  closeUnresolvedAiOnly,
  decide,
  getDisputeView,
  proposeResolution,
  requestReview,
  waiveAppeal,
} from "./review";
import {
  dispatchSettlements,
  mockTransferAdapter,
  openDispute,
  reconcileOperations,
} from "./settlement";
import { testPool } from "./testing";
import { setMockFact, verifyDeal } from "./verification";

// Spec D.1: every category has a permitted success, a material breach and an
// unknown or contested outcome in each of the three service modes. 11 x 3 x 3
// = 99 cases, each driven through the real commands against a real database.
// A case asserts the category's own differentiating fact, the recorded
// inspection state, the authorization path and where the money ended up.

const SECRET = "test-webhook-secret";
const AMOUNT = 250000n;
// Milestone deals split the price in two.
const PARTS = [100000n, 150000n];

let pool: Pool;
beforeAll(async () => {
  const base = await testPool();
  await migrate(base);
  await base.end();
  // The cases run side by side, so they need more than the default handful
  // of connections.
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  pool = createPool(url as string, "lp_test");
});
afterAll(() => pool.end());

async function newUser(role?: "reviewer"): Promise<string> {
  const { rows } = await pool.query(
    "insert into app_user (name, email) values ('Catalog', $1) returning id",
    [`u-${randomUUID()}@example.test`],
  );
  if (role) {
    await grantStaffRole(pool, {
      userId: rows[0].id,
      role,
      grantedBy: "operator:test",
      reason: "test",
    });
  }
  return rows[0].id;
}
const envelope = (version: number, payload = {}) => ({
  commandId: randomUUID(),
  idempotencyKey: `key-${randomUUID()}`,
  expectedAggregateVersion: version,
  payload,
});

type Template = (typeof TEMPLATES)[number];
type Mode = (typeof SERVICE_MODES)[number];
type Deal = {
  dealId: string;
  seller: string;
  buyer: string;
  reviewer: string | null;
  template: Template;
  product: Record<string, string>;
};

async function fundedDeal(template: Template, mode: Mode): Promise<Deal> {
  const seller = await newUser();
  const buyer = await newUser();
  const product = Object.fromEntries(
    template.fields.map((f) => [f.key, `agreed-${f.key}`]),
  );
  const created = await createDeal(pool, seller, {
    role: "seller",
    templateId: template.templateId,
    templateVersion: template.version,
    title: `${template.categoryId} ${mode}`,
    mode,
    amountMinor: AMOUNT.toString(),
    product,
    ...(template.milestones
      ? {
          milestones: PARTS.map((part, n) => ({
            title: `Milestone ${n + 1}`,
            amountMinor: part.toString(),
          })),
        }
      : {}),
  });
  if (!created.ok) throw new Error(`createDeal ${template.templateId}`);
  const invite = await createInvite(pool, seller, created.dealId);
  if (!invite.ok) throw new Error("invite failed");
  await acceptInvite(pool, buyer, invite.token);
  for (const [userId, command] of [
    [seller, "ProposeAgreement"],
    [buyer, "AcceptAgreement"],
    [seller, "AcceptAgreement"],
  ] as const) {
    const view = await getDealView(pool, userId, created.dealId);
    if (!view) throw new Error("no view");
    await agreementCommand(pool, "test", {
      userId,
      agreementId: created.agreementId,
      command,
      envelope: envelope(view.agreement.aggregateVersion, {
        termsHash: view.agreement.termsHash,
      }),
    });
  }
  // B2: a human-from-start deal cannot be funded until its reviewer joins.
  let reviewer: string | null = null;
  if (mode === "human_from_start") {
    reviewer = await newUser("reviewer");
    const claimed = await claimDeal(pool, {
      reviewerId: reviewer,
      dealId: created.dealId,
    });
    if (!claimed.ok) throw new Error("claimDeal failed");
  }
  const invoice = await createInvoice(pool, buyer, created.dealId);
  if (!invoice.ok) throw new Error(`invoice: ${invoice.error}`);
  await startFunding(pool, "test", {
    userId: buyer,
    invoiceId: invoice.invoiceId,
    envelope: envelope(1),
  });
  const funding = await getFunding(pool, created.dealId);
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
  return { dealId: created.dealId, seller, buyer, reviewer, template, product };
}

// What the fictional provider says, and what the buyer finds, for one case.
// Anything not named passes.
type Script = {
  // predicate -> what the provider reports ("absent" = it has no record).
  provider?: Record<
    string,
    "FAILED" | "UNKNOWN" | "absent" | "wrong_destination"
  >;
  // itemId -> what the buyer records.
  buyer?: Record<string, "FAILED" | "UNKNOWN">;
};

const balances = (deal: Deal) => dealBalances(pool, deal.dealId);
const inspections = async (deal: Deal) =>
  (await getDeliveryView(pool, deal.dealId)).package?.inspections ?? [];
const stateOf = async (deal: Deal, itemId: string) =>
  (await inspections(deal)).find((i) => i.itemId === itemId)?.state;

async function setProvider(deal: Deal, script: Script) {
  const predicates = new Set(
    deal.template.items
      .map((i) => i.predicate)
      .filter((p) => PREDICATES[p]?.capability?.startsWith("mock_")),
  );
  for (const predicate of predicates) {
    const says = script.provider?.[predicate];
    if (says === "absent") continue;
    const field = PREDICATES[predicate]?.bindsField;
    const result = await setMockFact(pool, {
      userId: deal.seller,
      dealId: deal.dealId,
      fact: {
        predicate,
        outcome: says === "FAILED" || says === "UNKNOWN" ? says : "PASSED",
        boundTo:
          says === "wrong_destination"
            ? "some-other-destination"
            : field
              ? deal.product[field]
              : undefined,
        detail: "synthetic",
      },
    });
    if (!result.ok) throw new Error(`setMockFact ${predicate}`);
  }
}

// The seller hands over everything; then provider answers and buyer tests
// alternate until nothing more can be recorded.
async function deliverAndInspect(deal: Deal, script: Script) {
  await setProvider(deal, script);
  const delivered = await submitDelivery(pool, async () => true, {
    userId: deal.seller,
    dealId: deal.dealId,
    items: deal.template.items
      .filter((i) => i.submissionRoles.includes("seller"))
      .map((i) =>
        i.dataClass === "vault_secret"
          ? { itemId: i.itemId, vaultEventId: `$${randomUUID()}` }
          : { itemId: i.itemId, declared: true },
      ),
  });
  if (!delivered.ok) throw new Error(`deliver: ${delivered.error}`);
  for (let round = 0; round < deal.template.items.length; round += 1) {
    let progressed = false;
    const current = await inspections(deal);
    const passed = new Set(
      current.filter((i) => i.state === "PASSED").map((i) => i.itemId),
    );
    for (const item of deal.template.items) {
      if (item.predicate !== "buyer_confirms") continue;
      const row = current.find((i) => i.itemId === item.itemId);
      if (row?.state !== "PENDING") continue;
      const outcome = script.buyer?.[item.itemId] ?? "PASSED";
      if (outcome === "PASSED" && !item.dependsOn.every((d) => passed.has(d))) {
        continue;
      }
      const recorded = await recordInspection(pool, {
        userId: deal.buyer,
        inspectionId: row.inspectionId,
        outcome,
      });
      if (!recorded.ok) throw new Error(`inspect ${item.itemId}`);
      progressed = true;
    }
    // Provider facts that depend on what the buyer just did.
    if (await verifyDeal(pool, deal.dealId)) progressed = true;
    if (!progressed) break;
  }
  return delivered.packageId;
}

// The sweeps are global and the cases run side by side, so wait for this
// deal's own money to arrive rather than trusting one sweep.
async function settle(
  deal: Deal,
  done: (b: Awaited<ReturnType<typeof balances>>) => boolean,
) {
  const adapter = mockTransferAdapter(pool);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await reconcileOperations(pool, adapter);
    await dispatchSettlements(pool, adapter);
    const now = await balances(deal);
    if (done(now)) return now;
  }
  return balances(deal);
}

const accept = (deal: Deal, packageId: string) =>
  acceptDelivery(pool, { userId: deal.buyer, packageId });

const DECISION = {
  rule: "The accepted checklist and its refund rule.",
  facts: "As recorded in the inspection results for this package.",
  rejectedInferences: "No inference drawn from either party's tone.",
};

// The buyer disputes; the case then ends the way its service mode allows.
async function contest(
  deal: Deal,
  mode: Mode,
  outcome: "REFUND" | "UNRESOLVED",
) {
  const dispute = await openDispute(pool, {
    userId: deal.buyer,
    dealId: deal.dealId,
    claim: outcome === "REFUND" ? "WRONG_PRODUCT" : "OTHER",
    detail: "see inspection results",
  });
  if (!dispute.ok) throw new Error(`dispute: ${dispute.error}`);
  const state = async () =>
    (await getDisputeView(pool, deal.buyer, deal.dealId)).dispute?.state;

  if (mode === "ai_only") {
    expect(
      await requestReview(pool, { userId: deal.buyer, dealId: deal.dealId }),
    ).toEqual({ ok: false, error: "REVIEW_UNAVAILABLE" });
    if (outcome === "UNRESOLVED") {
      await pool.query(
        "update dispute set opened_at = now() - interval '8 days' where dispute_id = $1",
        [dispute.disputeId],
      );
      await closeUnresolvedAiOnly(pool);
      expect(await state()).toBe("UNRESOLVED_CLOSED");
      return;
    }
    // No human decides in this mode: the parties agree, or nothing moves.
    const proposed = await proposeResolution(pool, {
      userId: deal.buyer,
      dealId: deal.dealId,
      toSellerMinor: "0",
    });
    if (!("proposalId" in proposed)) throw new Error("propose failed");
    expect(
      await acceptResolutionProposal(pool, {
        userId: deal.seller,
        proposalId: proposed.proposalId,
      }),
    ).toMatchObject({ ok: true });
    expect(await state()).toBe("RESOLVED");
    return;
  }

  let reviewer = deal.reviewer;
  if (!reviewer) {
    await requestReview(pool, { userId: deal.buyer, dealId: deal.dealId });
    reviewer = await newUser("reviewer");
    const claimed = await claimReview(pool, {
      reviewerId: reviewer,
      disputeId: dispute.disputeId,
    });
    if (!("ok" in claimed) || !claimed.ok) throw new Error("claim failed");
  }
  expect(await state()).toBe("REVIEWING");
  const decided = await decide(pool, {
    reviewerId: reviewer,
    disputeId: dispute.disputeId,
    decision:
      outcome === "REFUND"
        ? {
            ...DECISION,
            outcome: "ALLOCATE",
            toSellerMinor: "0",
            reasoning: "A mandatory item failed; nothing usable was received.",
          }
        : {
            ...DECISION,
            outcome: "UNRESOLVED",
            reasoning:
              "The deciding fact could not be established either way from what is recorded.",
          },
  });
  expect(decided).toMatchObject({ ok: true });
  if (outcome === "UNRESOLVED") {
    expect(await state()).toBe("UNRESOLVED_CLOSED");
    return;
  }
  for (const userId of [deal.buyer, deal.seller]) {
    await waiveAppeal(pool, { userId, dealId: deal.dealId });
  }
  expect(await state()).toBe("RESOLVED");
}

const authorizationPaths = async (deal: Deal) =>
  (
    await pool.query(
      `select s.path from settlement_authorization s join aggregate a on a.id = s.authorization_id
       where s.deal_id = $1 and a.state <> 'INVALIDATED' order by s.created_at`,
      [deal.dealId],
    )
  ).rows.map((r) => r.path as string);

// D.1's differentiating scenario for each category: the fact that fails in
// the breach case, and the fact nobody can establish in the unknown case.
const SCENARIOS: Record<
  string,
  { item: string; breach: Script; unknownItem: string; unknown: Script }
> = {
  // Seller's recovery channel retained after the transfer.
  "CAT-01": {
    item: "recovery_with_buyer",
    breach: {
      provider: { "mock_account.recovery_controlled_by_buyer": "FAILED" },
    },
    unknownItem: "ownership_transferred",
    unknown: { provider: { "mock_account.transfer_confirmed": "absent" } },
  },
  // Inventory does not match what was promised.
  "CAT-02": {
    item: "attributes_match",
    breach: { provider: { "mock_game.attributes_match": "FAILED" } },
    unknownItem: "recovery_with_buyer",
    unknown: {
      provider: { "mock_account.recovery_controlled_by_buyer": "UNKNOWN" },
    },
  },
  // Fulfilled, but to a different player ID.
  "CAT-03": {
    item: "fulfilled_to_destination",
    breach: {
      provider: { "mock_topup.fulfilled_to_destination": "wrong_destination" },
    },
    unknownItem: "quantity_matches",
    unknown: { provider: { "mock_topup.quantity_matches": "absent" } },
  },
  // The key was already consumed: activation fails for the buyer.
  "CAT-04": {
    item: "activation_works",
    breach: { buyer: { activation_works: "FAILED" } },
    unknownItem: "activation_works",
    unknown: { buyer: { activation_works: "UNKNOWN" } },
  },
  // Entitlement landed with the wrong role or in someone else's workspace.
  "CAT-05": {
    item: "fulfilled_into_buyer_account",
    breach: { provider: { "mock_saas.role_and_seats": "wrong_destination" } },
    unknownItem: "plan_matches",
    unknown: { provider: { "mock_saas.plan_matches": "UNKNOWN" } },
  },
  // Already used; and a code the issuer cannot verify at all.
  "CAT-06": {
    item: "balance_verified",
    breach: { provider: { "mock_giftcard.balance_matches": "FAILED" } },
    unknownItem: "balance_verified",
    unknown: { provider: { "mock_giftcard.balance_matches": "absent" } },
  },
  // Editable source missing; and a function the buyer cannot test.
  "CAT-07": {
    item: "sources_present",
    breach: { buyer: { sources_present: "FAILED" } },
    unknownItem: "functions_tested",
    unknown: { buyer: { functions_tested: "UNKNOWN" } },
  },
  // The build fails in the isolated runner; and a runner outage.
  "CAT-08": {
    item: "build_and_tests",
    breach: { provider: { "mock_build.tests_pass": "FAILED" } },
    unknownItem: "build_and_tests",
    unknown: { provider: { "mock_build.tests_pass": "UNKNOWN" } },
  },
  // DNS-only handover: the registrar transfer is fine, the database is not there.
  "CAT-09": {
    item: "database_present",
    breach: { buyer: { database_present: "FAILED" } },
    unknownItem: "registrar_transfer",
    unknown: { provider: { "mock_registrar.transfer_confirmed": "absent" } },
  },
  // Enrolled on an account that is not the agreed one.
  "CAT-10": {
    item: "enrolled",
    breach: {
      provider: {
        "mock_enrollment.enrolled_at_destination": "wrong_destination",
      },
    },
    unknownItem: "transfer_permitted",
    unknown: { provider: { "mock_enrollment.transfer_permitted": "UNKNOWN" } },
  },
  // The work does not meet the written criteria.
  "CAT-11": {
    item: "meets_criteria",
    breach: { buyer: { meets_criteria: "FAILED" } },
    unknownItem: "meets_criteria",
    unknown: { buyer: { meets_criteria: "UNKNOWN" } },
  },
};

describe.concurrent.each(TEMPLATES.map((t) => [t.categoryId, t] as const))(
  "%s",
  (categoryId, template) => {
    const scenario = SCENARIOS[categoryId];
    if (!scenario) throw new Error(`no scenario for ${categoryId}`);

    test.concurrent.each(SERVICE_MODES)(
      "success, %s",
      async (mode) => {
        const deal = await fundedDeal(template, mode);
        const rounds = template.milestones ? PARTS.length : 1;
        for (let n = 0; n < rounds; n += 1) {
          const packageId = await deliverAndInspect(deal, {});
          const current = await inspections(deal);
          for (const row of current.filter((i) => i.mandatory)) {
            expect(row.state, row.itemId).toBe("PASSED");
          }
          // B5 step 7: delivering and passing inspection moved no money.
          expect((await balances(deal)).sellerPaid).toBe(
            PARTS.slice(0, n).reduce((a, b) => a + b, 0n) *
              (template.milestones ? 1n : 0n),
          );
          if (template.objectiveRelease) {
            // The buyer does nothing. The window opens, and only its end pays.
            await renderNotices(pool, deal.buyer);
            const view = await getDeliveryView(pool, deal.dealId);
            expect(view.package?.objectiveDueAt).not.toBeNull();
            expect(await authorizationPaths(deal)).toEqual([]);
            await pool.query(
              "update objective_window set due_at = now() - interval '1 second' where package_id = $1",
              [packageId],
            );
            expect(await verifyDeal(pool, deal.dealId)).toBe(true);
          } else {
            expect(await accept(deal, packageId)).toMatchObject({ ok: true });
          }
          const paid = template.milestones
            ? PARTS.slice(0, n + 1).reduce((a, b) => a + b, 0n)
            : AMOUNT;
          const after = await settle(deal, (b) => b.sellerPaid === paid);
          // C14.12: one accepted milestone pays that milestone only.
          expect(after).toMatchObject({
            sellerPaid: paid,
            held: AMOUNT - paid,
            buyerRefunded: 0n,
            conserved: true,
          });
        }
        expect(await authorizationPaths(deal)).toEqual(
          Array(rounds).fill(
            template.objectiveRelease
              ? "OBJECTIVE_RELEASE"
              : "ACCEPTED_RELEASE",
          ),
        );
      },
      240_000,
    );

    test.concurrent.each(SERVICE_MODES)(
      "material breach, %s",
      async (mode) => {
        const deal = await fundedDeal(template, mode);
        let alreadyPaid = 0n;
        if (template.milestones) {
          // The first milestone is fine and is paid; the second is the breach.
          const first = await deliverAndInspect(deal, {});
          expect(await accept(deal, first)).toMatchObject({ ok: true });
          alreadyPaid = PARTS[0] as bigint;
          await settle(deal, (b) => b.sellerPaid === alreadyPaid);
        }
        const packageId = await deliverAndInspect(deal, scenario.breach);
        expect(await stateOf(deal, scenario.item)).toBe("FAILED");
        // Neither the buyer's click nor the passage of time can pay for it.
        expect(await accept(deal, packageId)).toEqual({
          ok: false,
          error: "INCOMPLETE_DELIVERY",
        });
        await pool.query(
          "update objective_window set due_at = now() - interval '1 second' where package_id = $1",
          [packageId],
        );
        await verifyDeal(pool, deal.dealId);
        expect((await balances(deal)).held).toBe(AMOUNT - alreadyPaid);

        await contest(deal, mode, "REFUND");
        const refund = AMOUNT - alreadyPaid;
        const after = await settle(deal, (b) => b.buyerRefunded === refund);
        expect(after).toMatchObject({
          buyerRefunded: refund,
          // INV-14: what was already paid for an accepted milestone stays paid.
          sellerPaid: alreadyPaid,
          held: 0n,
          conserved: true,
        });
        expect((await authorizationPaths(deal)).at(-1)).toBe(
          mode === "ai_only" ? "MUTUAL_RESOLUTION" : "REVIEWED_RESOLUTION",
        );
      },
      240_000,
    );

    test.concurrent.each(SERVICE_MODES)(
      "unknown or contested, %s",
      async (mode) => {
        const deal = await fundedDeal(template, mode);
        const packageId = await deliverAndInspect(deal, scenario.unknown);
        // INV-13: unknown is recorded as unknown, not as a pass or a failure.
        expect(await stateOf(deal, scenario.unknownItem)).toBe("UNKNOWN");
        expect(await accept(deal, packageId)).toEqual({
          ok: false,
          error: "INCOMPLETE_DELIVERY",
        });
        // INV-08: an unknown mandatory item disables objective release.
        const view = await getDeliveryView(pool, deal.dealId);
        expect(view.package?.objectiveDueAt).toBeNull();

        await contest(deal, mode, "UNRESOLVED");
        const after = await settle(deal, () => true);
        // Nobody is declared the winner, and nobody is paid.
        expect(after).toMatchObject({
          held: AMOUNT,
          sellerPaid: 0n,
          buyerRefunded: 0n,
          conserved: true,
        });
        expect(await authorizationPaths(deal)).toEqual([]);
      },
      240_000,
    );
  },
);

test("the matrix above is 99 cases", () => {
  expect(TEMPLATES.length * SERVICE_MODES.length * 3).toBe(99);
  expect(Object.keys(SCENARIOS)).toEqual(TEMPLATES.map((t) => t.categoryId));
});

const template = (id: string) => {
  const found = TEMPLATES.find((t) => t.templateId === id);
  if (!found) throw new Error(id);
  return found;
};
const expireWindow = (packageId: string) =>
  pool.query(
    "update objective_window set due_at = now() - interval '1 second' where package_id = $1",
    [packageId],
  );

test("INV-09: an objection inside the challenge window stops objective release", async () => {
  const deal = await fundedDeal(template("game_topup"), "ai_first");
  const packageId = await deliverAndInspect(deal, {});
  await renderNotices(pool, deal.buyer);
  expect(
    (await getDeliveryView(pool, deal.dealId)).package?.objectiveDueAt,
  ).not.toBeNull();
  // Inside the window nothing is authorized.
  expect(await verifyDeal(pool, deal.dealId)).toBe(false);
  expect(await authorizationPaths(deal)).toEqual([]);

  const dispute = await openDispute(pool, {
    userId: deal.buyer,
    dealId: deal.dealId,
    claim: "NOT_RECEIVED",
    detail: "nothing arrived in the game",
  });
  expect(dispute.ok).toBe(true);
  await expireWindow(packageId);
  await verifyDeal(pool, deal.dealId);
  // The window is gone and its end pays nobody.
  expect(
    (await getDeliveryView(pool, deal.dealId)).package?.objectiveDueAt,
  ).toBeNull();
  expect(await authorizationPaths(deal)).toEqual([]);
  expect(await settle(deal, () => true)).toMatchObject({
    held: AMOUNT,
    sellerPaid: 0n,
  });
});

test("INV-07: a proof that is withdrawn before dispatch withdraws the authorization that rested on it", async () => {
  const deal = await fundedDeal(template("course_access"), "ai_first");
  const packageId = await deliverAndInspect(deal, {});
  await renderNotices(pool, deal.buyer);
  await expireWindow(packageId);
  await verifyDeal(pool, deal.dealId);
  expect(await authorizationPaths(deal)).toEqual(["OBJECTIVE_RELEASE"]);
  expect(await balances(deal)).toMatchObject({ held: 0n, reserved: AMOUNT });

  // The provider now says the enrollment was revoked. Nothing was sent yet.
  await setMockFact(pool, {
    userId: deal.seller,
    dealId: deal.dealId,
    fact: {
      predicate: "mock_enrollment.enrolled_at_destination",
      outcome: "FAILED",
    },
  });
  expect(await stateOf(deal, "enrolled")).toBe("FAILED");
  expect(await authorizationPaths(deal)).toEqual([]);
  expect(await balances(deal)).toMatchObject({
    held: AMOUNT,
    reserved: 0n,
    conserved: true,
  });
  // The earlier pass is still on record beside the failure (INV-06).
  const history = await pool.query(
    `select r.outcome from inspection_result r join inspection_item i on i.inspection_id = r.inspection_id
     where i.package_id = $1 and i.item_id = 'enrolled' order by r.id`,
    [packageId],
  );
  expect(history.rows.map((r) => r.outcome)).toEqual(["PASSED", "FAILED"]);
});

test("INV-14: a provider answer that changes after the payout does not undo it", async () => {
  const deal = await fundedDeal(template("course_access"), "ai_first");
  const packageId = await deliverAndInspect(deal, {});
  await renderNotices(pool, deal.buyer);
  await expireWindow(packageId);
  await verifyDeal(pool, deal.dealId);
  await settle(deal, (b) => b.sellerPaid === AMOUNT);
  await setMockFact(pool, {
    userId: deal.buyer,
    dealId: deal.dealId,
    fact: {
      predicate: "mock_enrollment.enrolled_at_destination",
      outcome: "FAILED",
    },
  });
  expect(await stateOf(deal, "enrolled")).toBe("PASSED");
  expect(await balances(deal)).toMatchObject({
    sellerPaid: AMOUNT,
    conserved: true,
  });
});

test("only a party can play the synthetic provider, and only for facts the agreement uses", async () => {
  const deal = await fundedDeal(template("game_topup"), "ai_first");
  const set = (userId: string, fact: unknown) =>
    setMockFact(pool, { userId, dealId: deal.dealId, fact });
  const ok = { predicate: "mock_topup.quantity_matches", outcome: "PASSED" };
  expect(await set(await newUser(), ok)).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  for (const fact of [
    { predicate: "mock_registrar.transfer_confirmed", outcome: "PASSED" },
    { predicate: "seller_declares", outcome: "PASSED" },
    { predicate: "mock_topup.quantity_matches", outcome: "TRUSTED" },
  ]) {
    expect(await set(deal.seller, fact)).toEqual({
      ok: false,
      error: "VALIDATION_FAILED",
    });
  }
  expect(await set(deal.buyer, ok)).toEqual({ ok: true });
});

test("C14.12: milestone prices must add up, belong to a milestone template, and end with the last milestone", async () => {
  const seller = await newUser();
  const service = template("service_milestones");
  const make = (
    templateId: string,
    fields: Template["fields"],
    milestones: unknown,
  ) =>
    createDeal(pool, seller, {
      role: "seller",
      templateId,
      templateVersion: 1,
      title: "Milestone rules",
      mode: "ai_first",
      amountMinor: AMOUNT.toString(),
      product: Object.fromEntries(fields.map((f) => [f.key, "x"])),
      milestones,
    });
  const invalid = { ok: false, error: "VALIDATION_FAILED" };
  expect(
    await make("service_milestones", service.fields, [
      { title: "One", amountMinor: "100000" },
      { title: "Two", amountMinor: "100000" },
    ]),
  ).toEqual(invalid);
  expect(await make("service_milestones", service.fields, [])).toEqual(invalid);
  expect(
    await make("service_milestones", service.fields, [
      { title: "One", amountMinor: "250000" },
      { title: "Free", amountMinor: "0" },
    ]),
  ).toEqual(invalid);
  expect(
    await make("gift_card", template("gift_card").fields, [
      { title: "One", amountMinor: "250000" },
    ]),
  ).toEqual(invalid);

  const deal = await fundedDeal(service, "ai_first");
  for (const part of PARTS) {
    const packageId = await deliverAndInspect(deal, {});
    expect(
      (await getDeliveryView(pool, deal.dealId)).package?.milestoneNo,
    ).toBe(PARTS.indexOf(part) + 1);
    expect(await accept(deal, packageId)).toMatchObject({ ok: true });
  }
  // Every milestone is accepted: there is nothing left to deliver.
  expect(
    await submitDelivery(pool, async () => true, {
      userId: deal.seller,
      dealId: deal.dealId,
      items: [
        { itemId: "rights_stated", declared: true },
        { itemId: "deliverable_delivered", vaultEventId: "$late" },
      ],
    }),
  ).toEqual({ ok: false, error: "ILLEGAL_TRANSITION" });
});
