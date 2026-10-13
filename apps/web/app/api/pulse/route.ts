import { userPulse } from "@lp/db/agreements";
import { NextResponse } from "next/server";
import { apiError, apiUser } from "../../../lib/api";
import { pool } from "../../../lib/pool";

export const dynamic = "force-dynamic";

// What the deal list and the notifications page poll: a fingerprint of the
// signed-in person's own deals. It carries no content.
export async function GET(request: Request) {
  const user = await apiUser(request);
  if (!user) return apiError("NOT_AUTHORIZED", 401);
  return NextResponse.json(
    { pulse: await userPulse(pool(), user.id) },
    { headers: { "cache-control": "no-store" } },
  );
}
