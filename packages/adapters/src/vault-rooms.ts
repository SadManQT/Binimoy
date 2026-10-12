import type { ErrorCode } from "@lp/contracts";
import type { Pool } from "pg";
import { matrixUserId, type VaultAdmin } from "./vault";

type Failure<E extends ErrorCode> = { ok: false; error: E };
const fail = <E extends ErrorCode>(error: E): Failure<E> => ({
  ok: false,
  error,
});

export async function getVaultRoom(
  pool: Pool,
  dealId: string,
): Promise<string | null> {
  const { rows } = await pool.query(
    "select room_id from vault_room where deal_id = $1",
    [dealId],
  );
  return rows[0]?.room_id ?? null;
}

// A party's browser creates the room and reports its id. Before it becomes
// the deal's vault, the homeserver is asked who is actually in it: it must be
// private, encrypted, and hold exactly the deal's two parties (D.7).
export async function registerVaultRoom(
  pool: Pool,
  admin: VaultAdmin,
  serverName: string,
  input: { userId: string; dealId: string; roomId: string },
): Promise<
  | { ok: true; roomId: string }
  | Failure<"NOT_AUTHORIZED" | "ILLEGAL_TRANSITION" | "VAULT_INVALID">
> {
  const { rows } = await pool.query(
    `select p.user_id, a.state from deal_party p
     join aggregate a on a.deal_id = p.deal_id and a.type = 'agreement'
     where p.deal_id = $1`,
    [input.dealId],
  );
  if (!rows.some((r) => r.user_id === input.userId)) {
    return fail("NOT_AUTHORIZED");
  }
  // Parties are fixed once the agreement is accepted.
  if (rows.length !== 2 || rows[0].state !== "ACCEPTED") {
    return fail("ILLEGAL_TRANSITION");
  }
  const existing = await getVaultRoom(pool, input.dealId);
  if (existing) {
    return existing === input.roomId
      ? { ok: true, roomId: existing }
      : fail("VAULT_INVALID");
  }
  const check = await admin.verifyRoom(
    input.roomId,
    rows.map((r) => matrixUserId(r.user_id, serverName)),
  );
  if (!check.ok) return fail("VAULT_INVALID");
  try {
    await pool.query(
      "insert into vault_room (deal_id, room_id, registered_by) values ($1, $2, $3)",
      [input.dealId, input.roomId, input.userId],
    );
  } catch (error) {
    // The room already serves another deal, or the other party registered a
    // different room for this deal a moment ago.
    if ((error as { code?: string }).code === "23505") {
      const now = await getVaultRoom(pool, input.dealId);
      return now === input.roomId
        ? { ok: true, roomId: now }
        : fail("VAULT_INVALID");
    }
    throw error;
  }
  return { ok: true, roomId: input.roomId };
}
