import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  createVaultAdmin,
  matrixUserId,
  mintMatrixLoginToken,
  type VaultConfig,
} from "./vault";

// These need the local Matrix homeserver (`pnpm matrix:local`). Without it
// they are reported as skipped, never as passed.
const config: VaultConfig | null = process.env.MATRIX_HOMESERVER_URL
  ? {
      homeserverUrl: process.env.MATRIX_HOMESERVER_URL,
      serverName: process.env.MATRIX_SERVER_NAME ?? "",
      jwtSecret: process.env.MATRIX_JWT_SECRET ?? "",
      registrationSecret: process.env.MATRIX_REGISTRATION_SECRET ?? "",
    }
  : null;

describe.skipIf(!config)("secret vault homeserver", () => {
  const cfg = config as VaultConfig;
  const api = async (
    token: string | null,
    method: string,
    path: string,
    body?: unknown,
  ) => {
    const response = await fetch(`${cfg.homeserverUrl}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, json: await response.json() };
  };
  const loginWith = (token: string) =>
    api(null, "POST", "/_matrix/client/v3/login", {
      type: "org.matrix.login.jwt",
      token,
    });
  async function person() {
    const userId = randomUUID();
    const login = await loginWith(mintMatrixLoginToken(userId, cfg));
    expect(login.status).toBe(200);
    return {
      userId,
      mxid: matrixUserId(userId, cfg.serverName),
      token: login.json.access_token as string,
    };
  }
  async function vaultRoom(
    seller: { token: string },
    invitees: { mxid: string }[],
  ) {
    const room = await api(
      seller.token,
      "POST",
      "/_matrix/client/v3/createRoom",
      {
        preset: "private_chat",
        invite: invitees.map((i) => i.mxid),
        creation_content: { "m.federate": false },
        initial_state: [
          {
            type: "m.room.encryption",
            state_key: "",
            content: { algorithm: "m.megolm.v1.aes-sha2" },
          },
        ],
      },
    );
    expect(room.status).toBe(200);
    return room.json.room_id as string;
  }
  const send = (
    token: string,
    roomId: string,
    type: string,
    content: unknown,
  ) =>
    api(
      token,
      "PUT",
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${type}/${randomUUID()}`,
      content,
    ).then((r) => r.json.event_id as string);

  test("a login token signs in exactly the user it was minted for", async () => {
    const a = await person();
    const who = await api(a.token, "GET", "/_matrix/client/v3/account/whoami");
    expect(who.json.user_id).toBe(a.mxid);
    expect(a.mxid).toMatch(/^@u_[0-9a-f]{32}:/);
  });

  test("a token signed with the wrong secret or already expired is refused", async () => {
    const userId = randomUUID();
    const forged = mintMatrixLoginToken(userId, { ...cfg, jwtSecret: "wrong" });
    expect((await loginWith(forged)).status).toBe(403);
    // The homeserver allows two minutes of clock leeway, so go well past it.
    const expired = mintMatrixLoginToken(userId, cfg, -600);
    expect((await loginWith(expired)).status).toBe(403);
  });

  test("a private encrypted room with exactly the two parties is accepted", async () => {
    const admin = await createVaultAdmin(cfg);
    const seller = await person();
    const buyer = await person();
    const roomId = await vaultRoom(seller, [buyer]);
    expect(await admin.verifyRoom(roomId, [seller.mxid, buyer.mxid])).toEqual({
      ok: true,
    });
    // The application's own account is never a member (D.7).
    expect(await admin.roomMembers(roomId)).not.toContain(admin.mxid);
  });

  test("a room with a third member, or with the wrong parties, is rejected", async () => {
    const admin = await createVaultAdmin(cfg);
    const seller = await person();
    const buyer = await person();
    const extra = await person();
    const crowded = await vaultRoom(seller, [buyer, extra]);
    expect(await admin.verifyRoom(crowded, [seller.mxid, buyer.mxid])).toEqual({
      ok: false,
      reason: "MEMBERS_MISMATCH",
    });
    const other = await vaultRoom(seller, [extra]);
    expect(await admin.verifyRoom(other, [seller.mxid, buyer.mxid])).toEqual({
      ok: false,
      reason: "MEMBERS_MISMATCH",
    });
    expect(
      await admin.verifyRoom("!nope:binimoy.local", [seller.mxid, buyer.mxid]),
    ).toMatchObject({ ok: false });
  });

  test("a room that is not encrypted, or is publicly joinable, is rejected", async () => {
    const admin = await createVaultAdmin(cfg);
    const seller = await person();
    const buyer = await person();
    const open = await api(
      seller.token,
      "POST",
      "/_matrix/client/v3/createRoom",
      {
        preset: "public_chat",
        invite: [buyer.mxid],
      },
    );
    expect(
      await admin.verifyRoom(open.json.room_id, [seller.mxid, buyer.mxid]),
    ).toEqual({ ok: false, reason: "NOT_PRIVATE" });
  });

  test("a delivery event counts only if it is encrypted and sent by the seller", async () => {
    const admin = await createVaultAdmin(cfg);
    const seller = await person();
    const buyer = await person();
    const roomId = await vaultRoom(seller, [buyer]);
    await api(
      buyer.token,
      "POST",
      `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`,
      {},
    );

    const encrypted = await send(seller.token, roomId, "m.room.encrypted", {
      algorithm: "m.megolm.v1.aes-sha2",
      ciphertext: "not-real-ciphertext",
      session_id: "s",
      sender_key: "k",
      device_id: "d",
    });
    expect(await admin.verifyEvent(roomId, encrypted, seller.mxid)).toBe(true);
    // Same event, but the buyer is claimed as its author.
    expect(await admin.verifyEvent(roomId, encrypted, buyer.mxid)).toBe(false);

    const plaintext = await send(seller.token, roomId, "m.room.message", {
      msgtype: "m.text",
      body: "the password is hunter2",
    });
    expect(await admin.verifyEvent(roomId, plaintext, seller.mxid)).toBe(false);
    expect(await admin.verifyEvent(roomId, "$missing", seller.mxid)).toBe(
      false,
    );

    const elsewhere = await vaultRoom(seller, [buyer]);
    expect(await admin.verifyEvent(elsewhere, encrypted, seller.mxid)).toBe(
      false,
    );
  });
});
