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
  locale: "bn" | "en";
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
  const L = (bn: string, en: string) => (props.locale === "en" ? en : bn);
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
    setStatus(L("ভল্ট তৈরি হচ্ছে…", "Creating the vault…"));
    try {
      setRoomId(await createVaultRoom(client, dealId, counterpartyMxid));
      setStatus(
        L(
          "ভল্ট তৈরি হয়েছে। অন্য পক্ষ এই পাতা খুললে যুক্ত হবেন।",
          "The vault is created. The other side joins when they open this page.",
        ),
      );
    } catch (error) {
      setStatus(`${L("হয়নি", "It did not work")}: ${(error as Error).message}`);
    }
  }

  async function submit(form: FormEvent<HTMLFormElement>, itemId: string) {
    form.preventDefault();
    const client = clientRef.current;
    const element = form.currentTarget;
    const value = String(new FormData(element).get("value") ?? "");
    if (!client || !roomId || !value) return;
    setStatus(L("এনক্রিপ্ট করে পাঠানো হচ্ছে…", "Encrypting and sending…"));
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
      setStatus(
        L(
          "পাঠানো হয়েছে। পাঠানো মানে ডেলিভারি গৃহীত হওয়া নয়।",
          "Sent. Sending does not mean the delivery was accepted.",
        ),
      );
    } catch (error) {
      setStatus(
        `${L("হয়নি, কিছু পাঠানো হয়নি", "It did not work, nothing was sent")}: ${(error as Error).message}`,
      );
    }
  }

  const title = (itemId: string) =>
    props.items.find((i) => i.itemId === itemId)?.title ?? itemId;

  return (
    <div data-testid="vault-panel" data-phase={phase}>
      <h3>{L("গোপন ভল্ট", "Secret vault")}</h3>
      <p>
        {L(
          "এখানে যা পাঠানো হয় তা শুধু দুই পক্ষের ডিভাইসে পড়া যায়। বিনিময়ের সার্ভার, এআই বা কর্মী তা পড়তে পারে না। যিনি পান তিনি কপি রাখতে পারেন; পাঠানো জিনিস ফেরত নেওয়া যায় না।",
          "What is sent here can be read only on the two sides' devices. Binimoy's server, the AI and staff cannot read it. Whoever receives it can keep a copy; something sent cannot be taken back.",
        )}
      </p>
      <p role="status" aria-live="polite">
        {status}
      </p>

      {phase === "loading" && <p>{L("ভল্ট খোলা হচ্ছে…", "Opening the vault…")}</p>}
      {phase === "unavailable" && (
        <p>
          {L(
            "এই পরিবেশে ভল্ট চালু নেই। তাই গোপন ডেলিভারি এখন সম্ভব নয়।",
            "The vault is not running in this environment. So secret delivery is not possible right now.",
          )}
        </p>
      )}
      {phase === "error" && (
        <p>
          {L(
            "ভল্ট খোলা যায়নি। পাতা রিফ্রেশ করে আবার চেষ্টা করুন।",
            "The vault could not be opened. Refresh the page and try again.",
          )}
        </p>
      )}
      {phase === "no_room" &&
        (props.myRole === "seller" ? (
          <button type="button" onClick={create}>
            {L("এই ডিলের ভল্ট তৈরি করুন", "Create this deal's vault")}
          </button>
        ) : (
          <p>
            {L(
              "সেলার এখনো ভল্ট তৈরি করেননি।",
              "The seller has not created the vault yet.",
            )}
          </p>
        ))}
      {phase === "waiting_for_other" && (
        <p>
          {L(
            "অন্য পক্ষ এখনো ভল্ট খোলেননি। তিনি এই ডিলের পাতা খুললে পাঠানো যাবে; তার আগে পাঠালে তাঁর ডিভাইস তা পড়তে পারত না।",
            "The other side has not opened the vault yet. You can send once they open this deal's page; anything sent before that could not be read by their device.",
          )}
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
                    {L(
                      "(ভল্টে পাঠানো হয়েছে; আবার পাঠালে নতুনটি গণ্য হবে)",
                      "(sent to the vault; if you send again, the new one counts)",
                    )}
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
              <button type="submit">
                {L("ভল্টে পাঠান", "Send to the vault")}
              </button>
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
              <legend>{L("সেলারের ঘোষণা", "Seller's declarations")}</legend>
              {props.declarable.map((item) => (
                <label key={item.itemId}>
                  <input
                    type="checkbox"
                    name="declared"
                    value={item.itemId}
                    required={item.mandatory}
                    style={{ display: "inline", width: "auto", minHeight: 0 }}
                  />{" "}
                  {L("আমি ঘোষণা করছি", "I declare")}: {item.title}
                  {item.mandatory ? "" : L(" (ঐচ্ছিক)", " (optional)")}
                </label>
              ))}
            </fieldset>
            <p>
              {L(
                "জমা দিলে বায়ারের চেক শুরু হয়। জমা দেওয়া মানে টাকা পাওয়া নয়; বায়ার গ্রহণ করলে তবেই পেমেন্ট হয়।",
                "Submitting starts the buyer's check. Submitting does not mean being paid; payment happens only if the buyer accepts.",
              )}
            </p>
            <button
              type="submit"
              disabled={props.items.some((item) => !mine[item.itemId])}
            >
              {L("ডেলিভারি জমা দিন", "Submit the delivery")}
            </button>
          </form>
        </div>
      )}

      {phase === "ready" && props.myRole === "buyer" && (
        <div>
          <p>
            {L(
              "আপনার নিজের নতুন পাসওয়ার্ড, OTP বা রিকভারি কোড এখানে বা চ্যাটে কখনো দেবেন না। সেগুলো সরাসরি সেবাদাতার সাইটে বসান।",
              "Never put your own new password, OTP or recovery code here or in chat. Enter those directly on the service's own site.",
            )}
          </p>
          {received.length === 0 ? (
            <p>{L("এখনো কিছু আসেনি।", "Nothing has arrived yet.")}</p>
          ) : (
            <ul>
              {received.map((delivery) => (
                <li key={delivery.eventId} data-testid="vault-received">
                  {delivery.value === null ? (
                    L(
                      "এই ডিভাইসে এটি খোলা যায়নি (চাবি নেই)। এটি ডেলিভারি ব্যর্থ হওয়ার প্রমাণ নয়।",
                      "This could not be opened on this device (no key). That is not proof the delivery failed.",
                    )
                  ) : !delivery.bindingMatches ? (
                    L(
                      "এই বার্তাটি এই ডিলের সংস্করণের সাথে বাঁধা নয়, তাই দেখানো হচ্ছে না।",
                      "This message is not tied to this version of the deal, so it is not shown.",
                    )
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
                          {L("দেখান", "Show")}
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
