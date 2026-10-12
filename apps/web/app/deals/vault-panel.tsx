"use client";

import type { MatrixClient } from "matrix-js-sdk";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  bothJoined,
  createVaultRoom,
  openVault,
  type ReceivedDelivery,
  readDeliveries,
  sendDelivery,
  VaultUnavailable,
} from "../../lib/vault-client";
import { submitDeliveryAction } from "./actions";

type Props = {
  dealId: string;
  myRole: "buyer" | "seller";
  myMxid: string;
  counterpartyMxid: string;
  roomId: string | null;
  termsHash: string;
  agreementVersion: number;
  // Items delivered through the vault.
  items: { itemId: string; title: string }[];
  // Items the seller confirms by statement rather than through the vault.
  declarable: { itemId: string; title: string; mandatory: boolean }[];
};

type Phase =
  | "loading"
  | "unavailable"
  | "error"
  | "no_room"
  | "waiting_for_other"
  | "ready";

export function VaultPanel(props: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState("");
  const [roomId, setRoomId] = useState(props.roomId);
  const [received, setReceived] = useState<ReceivedDelivery[]>([]);
  // The seller's own vault messages for this agreement version: item -> event.
  const [mine, setMine] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<string[]>([]);
  const clientRef = useRef<MatrixClient | null>(null);
  const { dealId, termsHash, agreementVersion, counterpartyMxid, myMxid } =
    props;

  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    if (!roomId) {
      setPhase("no_room");
      return;
    }
    const room = client.getRoom(roomId);
    if (room?.getMyMembership() === "invite") await client.joinRoom(roomId);
    setPhase(bothJoined(client, roomId) ? "ready" : "waiting_for_other");
    const binding = { dealId, termsHash, agreementVersion };
    setReceived(
      await readDeliveries(client, roomId, binding, counterpartyMxid),
    );
    // Read back from the room, so a reload does not lose what was sent. The
    // latest message per item is the one that gets submitted.
    const own: Record<string, string> = {};
    for (const delivery of await readDeliveries(
      client,
      roomId,
      binding,
      myMxid,
    )) {
      if (delivery.bindingMatches && delivery.itemId) {
        own[delivery.itemId] = delivery.eventId;
      }
    }
    setMine(own);
  }, [roomId, dealId, termsHash, agreementVersion, counterpartyMxid, myMxid]);

  // The vault is opened once per page view. The ref lets that one effect call
  // the latest refresh without re-opening the vault when its inputs change.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let cancelled = false;
    openVault().then(
      (client) => {
        if (cancelled) {
          client.stopClient();
          return;
        }
        clientRef.current = client;
        refreshRef.current();
      },
      (error) =>
        setPhase(error instanceof VaultUnavailable ? "unavailable" : "error"),
    );
    return () => {
      cancelled = true;
      clientRef.current?.stopClient();
      clientRef.current = null;
    };
  }, []);

  // New room events and membership changes arrive through sync; re-reading on
  // a short timer keeps this simple and always shows what the device has.
  useEffect(() => {
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function create() {
    const client = clientRef.current;
    if (!client) return;
    setStatus("ভল্ট তৈরি হচ্ছে…");
    try {
      setRoomId(await createVaultRoom(client, dealId, counterpartyMxid));
      setStatus("ভল্ট তৈরি হয়েছে। অন্য পক্ষ এই পাতা খুললে যুক্ত হবেন।");
    } catch (error) {
      setStatus(`হয়নি: ${(error as Error).message}`);
    }
  }

  async function submit(form: FormEvent<HTMLFormElement>, itemId: string) {
    form.preventDefault();
    const client = clientRef.current;
    const element = form.currentTarget;
    const value = String(new FormData(element).get("value") ?? "");
    if (!client || !roomId || !value) return;
    setStatus("এনক্রিপ্ট করে পাঠানো হচ্ছে…");
    try {
      await sendDelivery(client, roomId, {
        dealId,
        termsHash,
        agreementVersion,
        itemId,
        value,
      });
      element.reset();
      await refresh();
      setStatus("পাঠানো হয়েছে। পাঠানো মানে সরবরাহ গৃহীত হওয়া নয়।");
    } catch (error) {
      setStatus(`হয়নি, কিছু পাঠানো হয়নি: ${(error as Error).message}`);
    }
  }

  const title = (itemId: string) =>
    props.items.find((i) => i.itemId === itemId)?.title ?? itemId;

  return (
    <div data-testid="vault-panel" data-phase={phase}>
      <h3>গোপন ভল্ট</h3>
      <p>
        এখানে যা পাঠানো হয় তা শুধু দুই পক্ষের ডিভাইসে পড়া যায়। বিনিময়ের সার্ভার, এআই বা কর্মী তা
        পড়তে পারে না। যিনি পান তিনি কপি রাখতে পারেন; পাঠানো জিনিস ফেরত নেওয়া যায় না।
      </p>
      <p role="status" aria-live="polite">
        {status}
      </p>

      {phase === "loading" && <p>ভল্ট খোলা হচ্ছে…</p>}
      {phase === "unavailable" && (
        <p>এই পরিবেশে ভল্ট চালু নেই। তাই গোপন সরবরাহ এখন সম্ভব নয়।</p>
      )}
      {phase === "error" && <p>ভল্ট খোলা যায়নি। পাতা রিফ্রেশ করে আবার চেষ্টা করুন।</p>}
      {phase === "no_room" &&
        (props.myRole === "seller" ? (
          <button type="button" onClick={create}>
            এই ডিলের ভল্ট তৈরি করুন
          </button>
        ) : (
          <p>বিক্রেতা এখনো ভল্ট তৈরি করেননি।</p>
        ))}
      {phase === "waiting_for_other" && (
        <p>
          অন্য পক্ষ এখনো ভল্ট খোলেননি। তিনি এই ডিলের পাতা খুললে পাঠানো যাবে; তার আগে পাঠালে
          তাঁর ডিভাইস তা পড়তে পারত না।
        </p>
      )}

      {phase === "ready" && props.myRole === "seller" && (
        <div>
          {props.items.map((item) => (
            <form key={item.itemId} onSubmit={(e) => submit(e, item.itemId)}>
              <label>
                {item.title}
                {mine[item.itemId] && (
                  <span data-testid={`vault-sent-${item.itemId}`}>
                    {" "}
                    (ভল্টে পাঠানো হয়েছে; আবার পাঠালে নতুনটি গণ্য হবে)
                  </span>
                )}
                <input
                  name="value"
                  type="password"
                  required
                  autoComplete="off"
                  data-testid={`vault-input-${item.itemId}`}
                />
              </label>
              <button type="submit">ভল্টে পাঠান</button>
            </form>
          ))}

          <form action={submitDeliveryAction} data-testid="submit-delivery">
            <input type="hidden" name="dealId" value={dealId} />
            <input
              type="hidden"
              name="vaultEvents"
              value={JSON.stringify(mine)}
            />
            <fieldset>
              <legend>বিক্রেতার ঘোষণা</legend>
              {props.declarable.map((item) => (
                <label key={item.itemId}>
                  <input
                    type="checkbox"
                    name="declared"
                    value={item.itemId}
                    required={item.mandatory}
                    style={{ display: "inline", width: "auto", minHeight: 0 }}
                  />{" "}
                  আমি ঘোষণা করছি: {item.title}
                  {item.mandatory ? "" : " (ঐচ্ছিক)"}
                </label>
              ))}
            </fieldset>
            <p>
              জমা দিলে ক্রেতার পরীক্ষা শুরু হয়। জমা দেওয়া মানে টাকা পাওয়া নয়; ক্রেতা গ্রহণ করলে
              তবেই পরিশোধ হয়।
            </p>
            <button
              type="submit"
              disabled={props.items.some((item) => !mine[item.itemId])}
            >
              সরবরাহ জমা দিন
            </button>
          </form>
        </div>
      )}

      {phase === "ready" && props.myRole === "buyer" && (
        <div>
          <p>
            আপনার নিজের নতুন পাসওয়ার্ড, OTP বা রিকভারি কোড এখানে বা চ্যাটে কখনো দেবেন না।
            সেগুলো সরাসরি সেবাদাতার সাইটে বসান।
          </p>
          {received.length === 0 ? (
            <p>এখনো কিছু আসেনি।</p>
          ) : (
            <ul>
              {received.map((delivery) => (
                <li key={delivery.eventId} data-testid="vault-received">
                  {delivery.value === null ? (
                    "এই ডিভাইসে এটি খোলা যায়নি (চাবি নেই)। এটি সরবরাহ ব্যর্থ হওয়ার প্রমাণ নয়।"
                  ) : !delivery.bindingMatches ? (
                    "এই বার্তাটি এই চুক্তির সংস্করণের সাথে বাঁধা নয়, তাই দেখানো হচ্ছে না।"
                  ) : (
                    <>
                      {title(delivery.itemId)}:{" "}
                      {revealed.includes(delivery.eventId) ? (
                        <code data-testid="vault-value">{delivery.value}</code>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setRevealed((p) => [...p, delivery.eventId])
                          }
                        >
                          দেখান
                        </button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
