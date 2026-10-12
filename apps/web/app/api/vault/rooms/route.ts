import { registerVaultRoom } from "@lp/adapters";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiUser } from "../../../../lib/api";
import { pool } from "../../../../lib/pool";
import { vaultAdmin, vaultConfig } from "../../../../lib/vault";

export const dynamic = "force-dynamic";

const body = z.object({ dealId: z.uuid(), roomId: z.string().min(1).max(255) });

// A party's browser reports the room it created. The homeserver is asked who
// is really in it before it becomes the deal's vault.
export async function POST(request: Request) {
  const user = await apiUser(request);
  if (!user) return apiError("NOT_AUTHORIZED", 401);
  const config = vaultConfig();
  const admin = vaultAdmin();
  if (!config || !admin) return apiError("VAULT_UNAVAILABLE", 503);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_FAILED", 400);
  const result = await registerVaultRoom(
    pool(),
    await admin,
    config.serverName,
    {
      userId: user.id,
      ...parsed.data,
    },
  );
  if (result.ok) return NextResponse.json({ roomId: result.roomId });
  return apiError(result.error, result.error === "NOT_AUTHORIZED" ? 403 : 409);
}
