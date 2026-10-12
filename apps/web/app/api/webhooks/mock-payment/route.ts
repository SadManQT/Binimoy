import { loadConfig } from "@lp/contracts";
import { ingestPaymentEvent } from "@lp/db/ledger";
import { NextResponse } from "next/server";
import { mockWebhookSecret } from "../../../../lib/mock-payment";
import { pool } from "../../../../lib/pool";

export const dynamic = "force-dynamic";

// The synthetic payment provider's callback. The signature is checked over
// the raw body before anything is parsed or stored.
export async function POST(request: Request) {
  const result = await ingestPaymentEvent(
    pool(),
    loadConfig(process.env).APP_ENV,
    {
      rawBody: await request.text(),
      signature: request.headers.get("x-mock-signature") ?? "",
      secret: mockWebhookSecret(),
    },
  );
  if (result.ok) return NextResponse.json({ outcome: result.outcome });
  return NextResponse.json(
    { error: result.error },
    { status: result.error === "NOT_AUTHORIZED" ? 401 : 400 },
  );
}
