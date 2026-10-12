import { createHmac } from "node:crypto";

// Spec D.7. The application server's part of the secret vault. It can:
//   - let the signed-in user's browser log in to the Matrix homeserver, and
//   - read room and event METADATA to check who is in a vault room and who
//     sent an event.
// It never joins a vault room and holds no decryption keys, so it cannot read
// what the parties exchange. See ADR-004 for what this does not protect.

export type VaultConfig = {
  homeserverUrl: string;
  serverName: string;
  jwtSecret: string;
  registrationSecret: string;
};

// One Matrix account per application user, derived from the user id.
export const matrixLocalpart = (userId: string) =>
  `u_${userId.replaceAll("-", "")}`;
export const matrixUserId = (userId: string, serverName: string) =>
  `@${matrixLocalpart(userId)}:${serverName}`;

const base64url = (value: string | Buffer) =>
  Buffer.from(value).toString("base64url");

// A one-minute token the browser trades for its own Matrix device. The server
// signs it only for the user of the current session. No Matrix password exists.
export function mintMatrixLoginToken(
  userId: string,
  config: Pick<VaultConfig, "jwtSecret">,
  lifetimeSeconds = 60,
): string {
  const now = Math.floor(Date.now() / 1000);
  const body = `${base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({
      sub: matrixLocalpart(userId),
      iat: now,
      exp: now + lifetimeSeconds,
    }),
  )}`;
  const signature = createHmac("sha256", config.jwtSecret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export type RoomCheck =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "UNKNOWN_ROOM"
        | "MEMBERS_MISMATCH"
        | "NOT_ENCRYPTED"
        | "NOT_PRIVATE";
    };

const ADMIN_LOCALPART = "binimoy_vault_admin";

// A homeserver admin account used only for metadata lookups. It is created on
// first use; its password is derived, so nothing needs to be stored.
export async function createVaultAdmin(config: VaultConfig) {
  const password = createHmac("sha256", config.registrationSecret)
    .update("vault-admin-password")
    .digest("hex");
  const call = async (
    token: string | null,
    method: string,
    path: string,
    body?: unknown,
  ) => {
    const response = await fetch(`${config.homeserverUrl}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, json: await response.json() };
  };
  const login = () =>
    call(null, "POST", "/_matrix/client/v3/login", {
      type: "m.login.password",
      identifier: { type: "m.id.user", user: ADMIN_LOCALPART },
      password,
    });

  let session = await login();
  if (session.status !== 200) {
    const nonce = (await call(null, "GET", "/_synapse/admin/v1/register")).json
      .nonce as string;
    const mac = createHmac("sha1", config.registrationSecret)
      .update(`${nonce}\0${ADMIN_LOCALPART}\0${password}\0admin`)
      .digest("hex");
    await call(null, "POST", "/_synapse/admin/v1/register", {
      nonce,
      username: ADMIN_LOCALPART,
      password,
      admin: true,
      mac,
    });
    session = await login();
  }
  if (session.status !== 200) {
    throw new Error(
      "Could not sign in the vault admin account on the homeserver.",
    );
  }
  const token: string = session.json.access_token;
  const room = (roomId: string) =>
    `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}`;

  async function roomMembers(roomId: string): Promise<string[] | null> {
    const state = await call(token, "GET", `${room(roomId)}/state`);
    if (state.status !== 200) return null;
    // Invited counts: an invited account can join and then receive keys.
    return (
      state.json.state as {
        type: string;
        state_key: string;
        content: { membership?: string };
      }[]
    )
      .filter(
        (e) =>
          e.type === "m.room.member" &&
          ["join", "invite"].includes(e.content.membership ?? ""),
      )
      .map((e) => e.state_key)
      .sort();
  }

  return {
    mxid: `@${ADMIN_LOCALPART}:${config.serverName}`,
    roomMembers: async (roomId: string) => (await roomMembers(roomId)) ?? [],

    // D.7: private, encrypted, not federated, and containing exactly the
    // deal's two parties.
    async verifyRoom(roomId: string, parties: string[]): Promise<RoomCheck> {
      const state = await call(token, "GET", `${room(roomId)}/state`);
      if (state.status !== 200) return { ok: false, reason: "UNKNOWN_ROOM" };
      const events = state.json.state as {
        type: string;
        content: Record<string, unknown>;
      }[];
      const content = (type: string) =>
        events.find((e) => e.type === type)?.content ?? {};
      if (
        content("m.room.join_rules").join_rule !== "invite" ||
        content("m.room.create")["m.federate"] !== false
      ) {
        return { ok: false, reason: "NOT_PRIVATE" };
      }
      if (content("m.room.encryption").algorithm !== "m.megolm.v1.aes-sha2") {
        return { ok: false, reason: "NOT_ENCRYPTED" };
      }
      const members = await roomMembers(roomId);
      const expected = [...parties].sort();
      if (
        !members ||
        members.length !== expected.length ||
        members.some((m, i) => m !== expected[i])
      ) {
        return { ok: false, reason: "MEMBERS_MISMATCH" };
      }
      return { ok: true };
    },

    // True only for an encrypted event in this room sent by this account.
    // This proves a payload was handed over, not that its contents are right.
    async verifyEvent(
      roomId: string,
      eventId: string,
      sender: string,
    ): Promise<boolean> {
      const found = await call(
        token,
        "GET",
        `${room(roomId)}/context/${encodeURIComponent(eventId)}?limit=0`,
      );
      const event = found.json?.event;
      return (
        found.status === 200 &&
        event?.type === "m.room.encrypted" &&
        event?.sender === sender &&
        event?.room_id === roomId
      );
    },
  };
}

export type VaultAdmin = Awaited<ReturnType<typeof createVaultAdmin>>;
