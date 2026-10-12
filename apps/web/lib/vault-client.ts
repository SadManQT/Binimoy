"use client";

import {
  ClientEvent,
  createClient,
  type MatrixClient,
  type MatrixEvent,
  SyncState,
} from "matrix-js-sdk";

// Spec D.7. Everything here runs in the party's own browser. Encryption and
// decryption are done by the Matrix SDK's crypto module; this file only wires
// it up. The application server never sees a payload or a key.

export const DELIVERY_EVENT = "binimoy.delivery.item";

// What a delivery payload is bound to. The reader checks every field against
// the deal it is looking at before showing the value (V7-21).
export type DeliveryBinding = {
  dealId: string;
  termsHash: string;
  agreementVersion: number;
  itemId: string;
};
export type DeliveryContent = DeliveryBinding & { value: string };

export type ReceivedDelivery = {
  eventId: string;
  sender: string;
  itemId: string;
  // Null when the payload could not be decrypted on this device.
  value: string | null;
  bindingMatches: boolean;
};

type Session = { homeserverUrl: string; userId: string; loginToken: string };

export class VaultUnavailable extends Error {}

// One Matrix device per browser profile and user. Its keys live in the
// browser's IndexedDB; the access token is kept so the same device is reused.
export async function openVault(): Promise<MatrixClient> {
  const response = await fetch("/api/vault/session", { cache: "no-store" });
  if (response.status === 503) throw new VaultUnavailable();
  if (!response.ok) throw new Error(`vault session failed: ${response.status}`);
  const session: Session = await response.json();

  const storageKey = `binimoy.vault.${session.userId}`;
  let device: { accessToken: string; deviceId: string } | null = null;
  try {
    device = JSON.parse(localStorage.getItem(storageKey) ?? "null");
  } catch {
    device = null;
  }
  if (!device) {
    const login = await createClient({
      baseUrl: session.homeserverUrl,
    }).loginRequest({
      type: "org.matrix.login.jwt",
      token: session.loginToken,
      initial_device_display_name: "Binimoy vault",
    } as Parameters<MatrixClient["loginRequest"]>[0]);
    device = { accessToken: login.access_token, deviceId: login.device_id };
    localStorage.setItem(storageKey, JSON.stringify(device));
  }

  const client = createClient({
    baseUrl: session.homeserverUrl,
    userId: session.userId,
    deviceId: device.deviceId,
    accessToken: device.accessToken,
  });
  await client.initRustCrypto();
  const ready = new Promise<void>((resolve, reject) => {
    client.on(ClientEvent.Sync, (state) => {
      if (state === SyncState.Prepared || state === SyncState.Syncing)
        resolve();
      if (state === SyncState.Error) reject(new Error("vault sync failed"));
    });
  });
  await client.startClient({ initialSyncLimit: 50 });
  await ready;
  return client;
}

// The seller's browser creates the room; the server then asks the homeserver
// who is in it before accepting it as this deal's vault.
export async function createVaultRoom(
  client: MatrixClient,
  dealId: string,
  counterparty: string,
): Promise<string> {
  const { room_id: roomId } = await client.createRoom({
    preset: "private_chat" as never,
    invite: [counterparty],
    creation_content: { "m.federate": false },
    initial_state: [
      {
        type: "m.room.encryption",
        state_key: "",
        content: { algorithm: "m.megolm.v1.aes-sha2" },
      },
    ],
  });
  const registered = await fetch("/api/vault/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dealId, roomId }),
  });
  if (!registered.ok) {
    throw new Error(
      `vault room was refused: ${(await registered.json()).error}`,
    );
  }
  return roomId;
}

// Both parties must have joined, each with a device, before anything is sent:
// a device that does not exist yet cannot be given the keys.
export function bothJoined(client: MatrixClient, roomId: string): boolean {
  return client.getRoom(roomId)?.getJoinedMemberCount() === 2;
}

export async function sendDelivery(
  client: MatrixClient,
  roomId: string,
  content: DeliveryContent,
): Promise<string> {
  if (!bothJoined(client, roomId)) {
    throw new Error("the other party has not opened the vault yet");
  }
  const crypto = client.getCrypto();
  if (!crypto || !(await crypto.isEncryptionEnabledInRoom(roomId))) {
    // Never fall back to sending a secret unencrypted.
    throw new Error("this room is not encrypted; nothing was sent");
  }
  const sent = await client.sendEvent(
    roomId,
    DELIVERY_EVENT as never,
    content as never,
  );
  return sent.event_id;
}

export async function readDeliveries(
  client: MatrixClient,
  roomId: string,
  expected: Omit<DeliveryBinding, "itemId">,
  expectedSender: string,
): Promise<ReceivedDelivery[]> {
  const room = client.getRoom(roomId);
  if (!room) return [];
  const received: ReceivedDelivery[] = [];
  for (const event of room.getLiveTimeline().getEvents() as MatrixEvent[]) {
    await client.decryptEventIfNeeded(event);
    const failed = event.isDecryptionFailure();
    if (!failed && event.getType() !== DELIVERY_EVENT) continue;
    if (failed && event.getWireType() !== "m.room.encrypted") continue;
    // Only what the counterparty sent counts as a delivery.
    if (event.getSender() !== expectedSender) continue;
    const content = event.getContent() as Partial<DeliveryContent>;
    received.push({
      eventId: event.getId() ?? "",
      sender: event.getSender() ?? "",
      itemId: failed ? "" : String(content.itemId ?? ""),
      value: failed ? null : String(content.value ?? ""),
      bindingMatches:
        !failed &&
        content.dealId === expected.dealId &&
        content.termsHash === expected.termsHash &&
        content.agreementVersion === expected.agreementVersion,
    });
  }
  return received;
}
