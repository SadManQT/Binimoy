import { matrixUserId, mintMatrixLoginToken } from "@lp/adapters";
import { NextResponse } from "next/server";
import { apiError, apiUser } from "../../../../lib/api";
import { vaultConfig } from "../../../../lib/vault";

export const dynamic = "force-dynamic";

// Gives the signed-in user's browser what it needs to log in to the vault
// homeserver as itself. The token is valid for about a minute and only for
// this user; the browser trades it for its own device and keys.
export async function GET(request: Request) {
  const user = await apiUser(request);
  if (!user) return apiError("NOT_AUTHORIZED", 401);
  const config = vaultConfig();
  if (!config) return apiError("VAULT_UNAVAILABLE", 503);
  return NextResponse.json(
    {
      homeserverUrl: config.homeserverUrl,
      userId: matrixUserId(user.id, config.serverName),
      loginToken: mintMatrixLoginToken(user.id, config),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
