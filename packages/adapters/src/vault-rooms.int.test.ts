import { randomUUID } from "node:crypto";
import {
  acceptInvite,
  agreementCommand,
  createDeal,
  createInvite,
  getDealView,
} from "@lp/db/agreements";
import { migrate } from "@lp/db/migrate";
import { testPool } from "@lp/db/testing";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  createVaultAdmin,
  matrixUserId,
  mintMatrixLoginToken,
  type VaultAdmin,
  type VaultConfig,
} from "./vault";
import { getVaultRoom, registerVaultRoom } from "./vault-rooms";

const config: VaultConfig | null = process.env.MATRIX_HOMESERVER_URL
  ? {
      homeserverUrl: process.env.MATRIX_HOMESERVER_URL,
      serverName: process.env.MATRIX_SERVER_NAME ?? "",
      jwtSecret: process.env.MATRIX_JWT_SECRET ?? "",
      registrationSecret: process.env.MATRIX_REGISTRATION_SECRET ?? "",
    }
  : null;

describe.skipIf(!config)("vault room registration", () => {
  const cfg = config as VaultConfig;
  let pool: Awaited<ReturnType<typeof testPool>>;
  let admin: VaultAdmin;
  beforeAll(async () => {
    pool = await testPool();
    await migrate(pool);
    admin = await createVaultAdmin(cfg);
  });
  afterAll(() => pool.end());

  async function person(name: string) {
    const { rows } = await pool.query(
      "insert into app_user (name, email) values ($1, $2) returning id",
      [name, `u-${randomUUID()}@example.test`],
    );
    const userId: string = rows[0].id;
    const login = await fetch(`${cfg.homeserverUrl}/_matrix/client/v3/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "org.matrix.login.jwt",
        token: mintMatrixLoginToken(userId, cfg),
      }),
    });
    return {
      userId,
      mxid: matrixUserId(userId, cfg.serverName),
      token: (await login.json()).access_token as string,
    };
  }
  type Person = Awaited<ReturnType<typeof person>>;

  async function room(creator: Person, invitees: Person[]) {
    const response = await fetch(
      `${cfg.homeserverUrl}/_matrix/client/v3/createRoom`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${creator.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
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
        }),
      },
    );
    return (await response.json()).room_id as string;
  }

  async function deal(accepted = true) {
    const seller = await person("Seller");
    const buyer = await person("Buyer");
    const created = await createDeal(pool, seller.userId, {
      role: "seller",
      templateId: "software_license",
      templateVersion: 1,
      title: "Vault test",
      mode: "ai_first",
      amountMinor: "100000",
      product: {
        product: "P",
        edition: "E",
        region: "BD",
        duration: "1y",
        device_limit: "1",
        activation_destination: "x",
      },
    });
    if (!created.ok) throw new Error("createDeal failed");
    const invite = await createInvite(pool, seller.userId, created.dealId);
    if (!invite.ok) throw new Error("invite failed");
    await acceptInvite(pool, buyer.userId, invite.token);
    const run = async (
      userId: string,
      command: "ProposeAgreement" | "AcceptAgreement",
    ) => {
      const view = await getDealView(pool, userId, created.dealId);
      if (!view) throw new Error("no view");
      await agreementCommand(pool, "test", {
        userId,
        agreementId: created.agreementId,
        command,
        envelope: {
          commandId: randomUUID(),
          idempotencyKey: `key-${randomUUID()}`,
          expectedAggregateVersion: view.agreement.aggregateVersion,
          payload: { termsHash: view.agreement.termsHash },
        },
      });
    };
    if (accepted) {
      await run(seller.userId, "ProposeAgreement");
      await run(buyer.userId, "AcceptAgreement");
      await run(seller.userId, "AcceptAgreement");
    }
    return { dealId: created.dealId, seller, buyer };
  }

  const register = (userId: string, dealId: string, roomId: string) =>
    registerVaultRoom(pool, admin, cfg.serverName, { userId, dealId, roomId });

  test("a party can register a room holding exactly the deal's two parties", async () => {
    const d = await deal();
    const roomId = await room(d.seller, [d.buyer]);
    expect(await register(d.seller.userId, d.dealId, roomId)).toEqual({
      ok: true,
      roomId,
    });
    expect(await getVaultRoom(pool, d.dealId)).toBe(roomId);
    // Registering the same room again is harmless.
    expect(await register(d.buyer.userId, d.dealId, roomId)).toEqual({
      ok: true,
      roomId,
    });
  });

  test("a room containing anyone else is refused", async () => {
    const d = await deal();
    const stranger = await person("Stranger");
    const roomId = await room(d.seller, [d.buyer, stranger]);
    expect(await register(d.seller.userId, d.dealId, roomId)).toEqual({
      ok: false,
      error: "VAULT_INVALID",
    });
    expect(await getVaultRoom(pool, d.dealId)).toBeNull();
  });

  test("someone outside the deal cannot register a room for it", async () => {
    const d = await deal();
    const stranger = await person("Stranger");
    const roomId = await room(d.seller, [d.buyer]);
    expect(await register(stranger.userId, d.dealId, roomId)).toEqual({
      ok: false,
      error: "NOT_AUTHORIZED",
    });
  });

  test("once registered, the vault room cannot be swapped for another", async () => {
    const d = await deal();
    const first = await room(d.seller, [d.buyer]);
    const second = await room(d.seller, [d.buyer]);
    await register(d.seller.userId, d.dealId, first);
    expect(await register(d.seller.userId, d.dealId, second)).toEqual({
      ok: false,
      error: "VAULT_INVALID",
    });
    expect(await getVaultRoom(pool, d.dealId)).toBe(first);
  });

  test("one room cannot serve two deals", async () => {
    const d = await deal();
    const roomId = await room(d.seller, [d.buyer]);
    await register(d.seller.userId, d.dealId, roomId);
    const other = await deal();
    expect(await register(other.seller.userId, other.dealId, roomId)).toEqual({
      ok: false,
      error: "VAULT_INVALID",
    });
  });

  test("no vault before both parties have accepted the agreement", async () => {
    const d = await deal(false);
    const roomId = await room(d.seller, [d.buyer]);
    expect(await register(d.seller.userId, d.dealId, roomId)).toEqual({
      ok: false,
      error: "ILLEGAL_TRANSITION",
    });
  });
});
