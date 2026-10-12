import { randomUUID } from "node:crypto";
import type { SERVICE_MODES, Template } from "@lp/templates";
import { grantStaffRole, type StaffRole } from "./access";
import {
  acceptInvite,
  agreementCommand,
  createDeal,
  createInvite,
  getDealView,
} from "./agreements";
import type { Pool } from "./index";
import {
  createInvoice,
  getFunding,
  ingestPaymentEvent,
  signMockEvent,
  startFunding,
} from "./ledger";
import { claimDeal } from "./review";

// Shared setup for integration tests: people and deals made through the real
// commands. Test-only; nothing in the application imports this.

export const TEST_SECRET = "test-webhook-secret";
export const TEST_AMOUNT = 250000n;
// Milestone deals split the price in two.
export const TEST_PARTS = [100000n, 150000n];

export type Mode = (typeof SERVICE_MODES)[number];
export type TestDeal = {
  dealId: string;
  agreementId: string;
  seller: string;
  buyer: string;
  reviewer: string | null;
  template: Template;
  product: Record<string, string>;
};

export const envelope = (version: number, payload = {}) => ({
  commandId: randomUUID(),
  idempotencyKey: `key-${randomUUID()}`,
  expectedAggregateVersion: version,
  payload,
});

export async function newUser(pool: Pool, role?: StaffRole): Promise<string> {
  const { rows } = await pool.query(
    "insert into app_user (name, email) values ('Test person', $1) returning id",
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

// Both parties in, terms accepted by both, and (for human-from-start) the
// reviewer assigned. Not funded.
export async function agreedDeal(
  pool: Pool,
  template: Template,
  mode: Mode = "ai_first",
): Promise<TestDeal> {
  const seller = await newUser(pool);
  const buyer = await newUser(pool);
  const product = Object.fromEntries(
    template.fields.map((f) => [f.key, `agreed-${f.key}`]),
  );
  const created = await createDeal(pool, seller, {
    role: "seller",
    templateId: template.templateId,
    templateVersion: template.version,
    title: `${template.categoryId} ${mode}`,
    mode,
    amountMinor: TEST_AMOUNT.toString(),
    product,
    ...(template.milestones
      ? {
          milestones: TEST_PARTS.map((part, n) => ({
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
    reviewer = await newUser(pool, "reviewer");
    const claimed = await claimDeal(pool, {
      reviewerId: reviewer,
      dealId: created.dealId,
    });
    if (!claimed.ok) throw new Error("claimDeal failed");
  }
  return {
    dealId: created.dealId,
    agreementId: created.agreementId,
    seller,
    buyer,
    reviewer,
    template,
    product,
  };
}

// Pays the invoice through the synthetic provider's signed event.
export async function fund(pool: Pool, deal: TestDeal) {
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
    amountMinor: TEST_AMOUNT.toString(),
    currency: "BDT",
  });
  await ingestPaymentEvent(pool, "test", {
    rawBody: body,
    signature: signMockEvent(body, TEST_SECRET),
    secret: TEST_SECRET,
  });
  return invoice;
}

export async function fundedDeal(
  pool: Pool,
  template: Template,
  mode: Mode = "ai_first",
): Promise<TestDeal> {
  const deal = await agreedDeal(pool, template, mode);
  const funded = await fund(pool, deal);
  if (!funded.ok) throw new Error(`funding: ${funded.error}`);
  return deal;
}

// Everything the seller hands over for this template, as the form would.
export const sellerItems = (template: Template) =>
  template.items
    .filter((i) => i.submissionRoles.includes("seller"))
    .map((i) =>
      i.dataClass === "vault_secret"
        ? { itemId: i.itemId, vaultEventId: `$${randomUUID()}` }
        : { itemId: i.itemId, declared: true },
    );
