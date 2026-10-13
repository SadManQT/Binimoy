import { dealPulse } from "@lp/db/agreements";
import { NextResponse } from "next/server";
import { apiUser } from "../../../../../lib/api";
import { pool } from "../../../../../lib/pool";

export const dynamic = "force-dynamic";

// What an open deal page polls. Not signed in, not a party and no such deal
// all look the same (D.2).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await apiUser(request);
  const pulse = user
    ? await dealPulse(pool(), user.id, (await params).id)
    : null;
  if (!pulse) return new NextResponse(null, { status: 404 });
  return NextResponse.json(
    { pulse },
    { headers: { "cache-control": "no-store" } },
  );
}
