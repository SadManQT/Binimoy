"use server";

import { randomUUID } from "node:crypto";
import { loadConfig, takaToMinor } from "@lp/contracts";
import {
  type AgreementCommand,
  acceptInvite,
  agreementCommand,
  createDeal,
  createInvite,
  getDealView,
} from "@lp/db/agreements";
import {
  createInvoice,
  getFunding,
  ingestPaymentEvent,
  signMockEvent,
  startFunding,
} from "@lp/db/ledger";
import { redirect } from "next/navigation";
import { mockWebhookSecret } from "../../lib/mock-payment";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";

const text = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();

function termsFromForm(form: FormData) {
  const product: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (name.startsWith("product.")) {
      product[name.slice("product.".length)] = String(value).trim();
    }
  }
  return {
    role: text(form, "role"),
    templateId: text(form, "templateId"),
    templateVersion: Number(text(form, "templateVersion")),
    title: text(form, "title"),
    mode: text(form, "mode"),
    // An unreadable amount becomes "" and is rejected as VALIDATION_FAILED.
    amountMinor: takaToMinor(text(form, "amountTaka")) ?? "",
    product,
  };
}

export async function createDealAction(form: FormData) {
  const user = await requireUser();
  const result = await createDeal(pool(), user.id, termsFromForm(form));
  if (!result.ok) {
    redirect(
      `/deals/new?template=${encodeURIComponent(text(form, "templateId"))}&error=${result.error}`,
    );
  }
  redirect(`/deals/${result.dealId}`);
}

export async function createInviteAction(form: FormData) {
  const user = await requireUser();
  const dealId = text(form, "dealId");
  const result = await createInvite(pool(), user.id, dealId);
  redirect(
    result.ok
      ? `/deals/${dealId}?invite=${result.token}`
      : `/deals/${dealId}?error=${result.error}`,
  );
}

export async function acceptInviteAction(form: FormData) {
  const user = await requireUser();
  const token = text(form, "token");
  const result = await acceptInvite(pool(), user.id, token);
  redirect(
    result.ok
      ? `/deals/${result.dealId}`
      : `/invite/${encodeURIComponent(token)}?error=${result.error}`,
  );
}

const COMMANDS: AgreementCommand[] = [
  "ProposeAgreement",
  "ReviseAgreement",
  "AcceptAgreement",
  "WithdrawAgreement",
];

// The page renders the idempotency key and the version it showed. A double
// submit replays one result; a stale tab gets VERSION_CONFLICT, never a
// silent acceptance of terms the person did not see.
export async function agreementAction(form: FormData) {
  const user = await requireUser();
  const dealId = text(form, "dealId");
  const command = text(form, "command") as AgreementCommand;
  if (!COMMANDS.includes(command))
    redirect(`/deals/${dealId}?error=VALIDATION_FAILED`);

  const payload =
    command === "AcceptAgreement"
      ? { termsHash: text(form, "termsHash") }
      : command === "ReviseAgreement"
        ? termsFromForm(form)
        : {};
  const result = await agreementCommand(
    pool(),
    loadConfig(process.env).APP_ENV,
    {
      userId: user.id,
      agreementId: text(form, "agreementId"),
      command,
      envelope: {
        commandId: randomUUID(),
        idempotencyKey: text(form, "idempotencyKey"),
        dealId,
        expectedAggregateVersion: Number(text(form, "expectedVersion")),
        payload,
      },
    },
  );
  redirect(
    result.ok ? `/deals/${dealId}` : `/deals/${dealId}?error=${result.error}`,
  );
}

export async function createInvoiceAction(form: FormData) {
  const user = await requireUser();
  const dealId = text(form, "dealId");
  const result = await createInvoice(pool(), user.id, dealId);
  redirect(
    result.ok ? `/deals/${dealId}` : `/deals/${dealId}?error=${result.error}`,
  );
}

export async function startFundingAction(form: FormData) {
  const user = await requireUser();
  const dealId = text(form, "dealId");
  const config = loadConfig(process.env);
  const result = await startFunding(
    pool(),
    config.APP_ENV,
    {
      userId: user.id,
      invoiceId: text(form, "invoiceId"),
      envelope: {
        commandId: randomUUID(),
        idempotencyKey: text(form, "idempotencyKey"),
        dealId,
        expectedAggregateVersion: Number(text(form, "expectedVersion")),
        payload: {},
      },
    },
    config.PAYMENT_MODE,
  );
  redirect(
    result.ok ? `/deals/${dealId}` : `/deals/${dealId}?error=${result.error}`,
  );
}

// Plays the synthetic provider: the buyer picks what the "provider" reports,
// and a signed event goes through the same path a real callback would take.
// It exists only because PAYMENT_MODE can only be mock.
export async function mockProviderAction(form: FormData) {
  const user = await requireUser();
  const dealId = text(form, "dealId");
  const funding = await getFunding(pool(), dealId);
  const view = await getDealView(pool(), user.id, dealId);
  if (!funding?.paymentRef || view?.myRole !== "buyer") {
    redirect(`/deals/${dealId}?error=NOT_AUTHORIZED`);
  }
  const expected = BigInt(funding.amountMinor);
  const scenario = text(form, "scenario");
  const amount =
    scenario === "under"
      ? expected - 10000n
      : scenario === "over"
        ? expected + 10000n
        : expected;
  const rawBody = JSON.stringify({
    eventId: `mockevt_${randomUUID()}`,
    type: "payment.succeeded",
    paymentRef: funding.paymentRef,
    amountMinor: (amount > 0n ? amount : 1n).toString(),
    currency: funding.currency,
  });
  const secret = mockWebhookSecret();
  const result = await ingestPaymentEvent(
    pool(),
    loadConfig(process.env).APP_ENV,
    {
      rawBody,
      signature: signMockEvent(rawBody, secret),
      secret,
    },
  );
  redirect(
    result.ok ? `/deals/${dealId}` : `/deals/${dealId}?error=${result.error}`,
  );
}
