import type { Conversation } from "@lp/db/conversation";
import { MONITORING_POLICY } from "@lp/db/conversation";
import { copyFor } from "../../lib/copy";
import { getI18n } from "../../lib/i18n";
import { More } from "../components/more";
import {
  acceptMonitoringAction,
  postMessageAction,
  reportSecretAction,
  reviseMessageAction,
  withdrawMonitoringAction,
} from "./actions";

const KIND_TEXT = {
  bn: {
    original: "মূল",
    edit: "সম্পাদিত",
    deleted: "মুছে ফেলা হয়েছে",
    redacted: "গোপন তথ্য থাকায় লেখা সরানো হয়েছে",
  } as Record<string, string>,
  en: {
    original: "Original",
    edit: "Edited",
    deleted: "Deleted",
    redacted: "Text removed because it held a secret",
  } as Record<string, string>,
};

// B3: the monitored room. `readOnly` is for the assigned reviewer, who reads
// and never speaks here.
export async function ConversationSection({
  dealId,
  conversation,
  readOnly = false,
}: {
  dealId: string;
  conversation: Conversation;
  readOnly?: boolean;
}) {
  const { locale, L } = await getI18n();
  const roles = copyFor(locale).role;
  const kinds = KIND_TEXT[locale];
  const when = (date: Date) =>
    date.toLocaleString(locale === "en" ? "en-GB" : "bn-BD", {
      timeZone: "Asia/Dhaka",
    });
  const hidden = <input type="hidden" name="dealId" value={dealId} />;
  return (
    <div data-testid="conversation">
      <h3>{L("ডিলের কথোপকথন (পর্যবেক্ষিত)", "Deal conversation (monitored)")}</h3>
      <div data-testid="monitoring-label">
        <p>
          <strong>
            {L("এই কথোপকথন গোপন নয়।", "This conversation is not private.")}
          </strong>{" "}
          {L(
            "পাসওয়ার্ড বা কোড এখানে লিখবেন না; সেগুলো গোপন ভল্টে দিন।",
            "Do not write passwords or codes here; put them in the secret vault.",
          )}
        </p>
        <More>
          {L(
            "এখানকার বার্তা বিনিময়ের সার্ভারে পড়া যায়, ডিসপিউট হলে নিযুক্ত রিভিউয়ার দেখতে পারেন, এবং দুই পক্ষ সম্মতি দিলে ডেলিভারিতে সহায়তা ও সমস্যা মীমাংসার জন্য এআই দিয়ে প্রক্রিয়া করা হতে পারে। পাসওয়ার্ড, OTP, পিন বা লাইসেন্স কি এখানে নয়, গোপন ভল্টে দিন। বাইরের (যেমন WhatsApp) কথা এখানে ধরা পড়ে না।",
            "Messages here can be read on Binimoy's server, can be seen by the assigned reviewer in a dispute, and, if both sides agree, may be processed by AI to help with delivery and settle problems. Put passwords, OTPs, PINs and license keys in the secret vault, not here. Conversations elsewhere (such as WhatsApp) are not captured here.",
          )}
        </More>
      </div>
      <p>
        {L("এআই পড়তে পারে", "AI may read this")}:{" "}
        <strong data-testid="ai-may-read">
          {conversation.aiMayRead
            ? L(
                "হ্যাঁ, দুই পক্ষ সম্মতি দিয়েছেন (তবে এই সংস্করণে কোনো এআই যুক্ত নেই)",
                "Yes, both sides agreed (but no AI is connected in this version)",
              )
            : L(
                "না, দুই পক্ষের সম্মতি এখনো সম্পূর্ণ নয়",
                "No, both sides have not agreed yet",
              )}
        </strong>
      </p>

      {conversation.messages.length === 0 ? (
        <p>{L("এখনো কোনো বার্তা নেই।", "No messages yet.")}</p>
      ) : (
        <ol>
          {conversation.messages.map((message) => {
            const latest = message.versions.at(-1);
            const gone = latest?.body === null;
            return (
              <li key={message.messageId} data-testid="message">
                <strong>{roles[message.authorRole]}</strong>
                {message.mine ? L(" (আপনি)", " (you)") : ""} ·{" "}
                {latest ? when(latest.createdAt) : ""}
                <br />
                {gone ? (
                  <em>{kinds[latest?.kind ?? "deleted"]}</em>
                ) : (
                  <span data-testid="message-body">{latest?.body}</span>
                )}
                {message.versions.length > 1 && (
                  <details>
                    <summary>
                      {L("আগের সংস্করণ", "Earlier versions")} (
                      {message.versions.length - 1})
                    </summary>
                    <ol>
                      {message.versions.slice(0, -1).map((version) => (
                        <li key={version.seq}>
                          {kinds[version.kind]} · {when(version.createdAt)}:{" "}
                          {version.body ?? <em>{L("লেখা নেই", "no text")}</em>}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                {!readOnly && !gone && (
                  <details>
                    <summary>
                      {L(
                        "এই বার্তা নিয়ে কিছু করুন",
                        "Do something with this message",
                      )}
                    </summary>
                    {message.mine && conversation.iConsented && (
                      <form action={reviseMessageAction}>
                        {hidden}
                        <input
                          type="hidden"
                          name="messageId"
                          value={message.messageId}
                        />
                        <label>
                          {L(
                            "নতুন লেখা (আগের লেখা ইতিহাসে থেকে যাবে)",
                            "New text (the earlier text stays in the history)",
                          )}
                          <input
                            name="body"
                            maxLength={4000}
                            defaultValue={latest?.body ?? ""}
                          />
                        </label>
                        <button type="submit" name="intent" value="edit">
                          {L("সম্পাদনা সংরক্ষণ", "Save the edit")}
                        </button>
                        <button type="submit" name="intent" value="delete">
                          {L("মুছুন", "Delete")}
                        </button>
                      </form>
                    )}
                    <form action={reportSecretAction}>
                      {hidden}
                      <input
                        type="hidden"
                        name="messageId"
                        value={message.messageId}
                      />
                      <p>
                        {L(
                          "এতে পাসওয়ার্ড, কোড বা পিন থাকলে জানান। লেখাটি সব সংস্করণ থেকে সরানো হবে। তবে যিনি আগেই পড়েছেন তিনি পড়েছেন: যাঁর গোপন তথ্য, তাঁকে সেটি সেবাদাতার সাইটে গিয়ে বদলাতে হবে।",
                          "Tell us if this holds a password, code or PIN. The text will be removed from every version. Anyone who already read it has read it, though: whoever owns the secret must change it on the service's own site.",
                        )}
                      </p>
                      <button type="submit">
                        {L("এতে গোপন তথ্য আছে", "This contains a secret")}
                      </button>
                    </form>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {!readOnly &&
        (conversation.iConsented ? (
          <>
            <form action={postMessageAction}>
              {hidden}
              <label>
                {L("বার্তা", "Message")}
                <input
                  name="body"
                  required
                  maxLength={4000}
                  autoComplete="off"
                />
              </label>
              <button type="submit">{L("পাঠান", "Send")}</button>
            </form>
            <details>
              <summary>
                {L(
                  "এআই প্রক্রিয়ায় সম্মতি তুলে নিন",
                  "Withdraw agreement to AI processing",
                )}
              </summary>
              <p>
                {L(
                  "তুলে নিলে ভবিষ্যতে এআই এই কথোপকথন পড়বে না এবং আপনি নতুন বার্তা লিখতে পারবেন না, তবে পড়তে, ডিসপিউট খুলতে ও প্রমাণ দেখতে পারবেন। আগে পাঠানো বার্তা থেকে যাবে। এতে কাউকে অসৎ ধরা হয় না।",
                  "If you withdraw, AI will not read this conversation from now on and you cannot write new messages, but you can still read, open a dispute and see the evidence. Messages already sent stay. Nobody is treated as dishonest for doing this.",
                )}
              </p>
              <form action={withdrawMonitoringAction}>
                {hidden}
                <button type="submit">
                  {L("সম্মতি তুলে নিচ্ছি", "I withdraw my agreement")}
                </button>
              </form>
            </details>
          </>
        ) : (
          <form action={acceptMonitoringAction}>
            {hidden}
            <p>
              {L(
                `লিখতে হলে আগে সম্মতি দিন। আপনি যাতে সম্মতি দিচ্ছেন (সংস্করণ ${MONITORING_POLICY.version}): আপনার বার্তা সার্ভারে পড়া যাবে এবং ডেলিভারিতে সহায়তা, সমস্যা নির্ণয় ও ডিসপিউট মীমাংসার জন্য এআই দিয়ে প্রক্রিয়া করা হতে পারে। মডেলের গন্তব্য: এখনো কোনো এআই যুক্ত নেই। সংযুক্তি: এখনো নেওয়া হয় না। সম্মতি যেকোনো সময় তুলে নেওয়া যায়।`,
                `To write, agree first. What you are agreeing to (version ${MONITORING_POLICY.version}): your messages can be read on the server and may be processed by AI to help with delivery, diagnose problems and settle disputes. Model destination: no AI is connected yet. Attachments: not accepted yet. You can withdraw this agreement at any time.`,
              )}
            </p>
            <button type="submit">{L("সম্মতি দিচ্ছি", "I agree")}</button>
          </form>
        ))}
    </div>
  );
}
