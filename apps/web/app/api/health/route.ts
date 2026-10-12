import { NextResponse } from "next/server";
import { getHealth } from "../../../lib/health";
import { pool } from "../../../lib/pool";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getHealth(pool());
  return NextResponse.json(health, { status: health.ready ? 200 : 503 });
}
