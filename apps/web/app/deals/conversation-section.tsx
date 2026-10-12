import type { Conversation } from "@lp/db/conversation";
import { MONITORING_POLICY } from "@lp/db/conversation";
import { ROLE_TEXT } from "../../lib/copy";
import {
  acceptMonitoringAction,
  postMessageAction,
  reportSecretAction,
  reviseMessageAction,
  withdrawMonitoringAction,
} from "./actions";

const when = (date: Date) =>
  date.toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" });

const KIND_TEXT: Record<string, string> = {
  original: "মূল",
  edit: "সম্পাদিত",
  deleted: "মুছে ফেলা হয়েছে",
  redacted: "গোপন তথ্য থাকায় লেখা সরানো হয়েছে",
};

// B3: the monitored room. `readOnly` is for the assigned reviewer, who reads
// and never speaks here.
export function ConversationSection({
  dealId,
  conversation,
  readOnly = false,
}: {
  dealId: string;
  conversation: Conversation;
  readOnly?: boolean;
}) {
  const hidden = <input type="hidden" name="dealId" value={dealId} />;
  return (
    <div data-testid="conversation">
      <h3>ডিলের কথোপকথন (পর্যবেক্ষিত)</h3>
      <p data-testid="monitoring-label">
        <strong>এই কথোপকথন গোপন নয়।</strong> এখানকার বার্তা বিনিময়ের সার্ভারে পড়া যায়,
        ডিসপিউট হলে নিযুক্ত রিভিউয়ার দেখতে পারেন, এবং দুই পক্ষ সম্মতি দিলে ডেলিভারিতে
        সহায়তা ও সমস্যা মীমাংসার জন্য এআই দিয়ে প্রক্রিয়া করা হতে পারে। পাসওয়ার্ড, OTP, পিন বা
        লাইসেন্স কি এখানে নয়, গোপন ভল্টে দিন। বাইরের (যেমন WhatsApp) কথা এখানে ধরা পড়ে
        না।
      </p>
      <p>
        এআই পড়তে পারে:{" "}
        <strong data-testid="ai-may-read">
          {conversation.aiMayRead
            ? "হ্যাঁ, দুই পক্ষ সম্মতি দিয়েছেন (তবে এই সংস্করণে কোনো এআই যুক্ত নেই)"
            : "না, দুই পক্ষের সম্মতি এখনো সম্পূর্ণ নয়"}
        </strong>
      </p>

      {conversation.messages.length === 0 ? (
        <p>এখনো কোনো বার্তা নেই।</p>
      ) : (
        <ol>
          {conversation.messages.map((message) => {
            const latest = message.versions.at(-1);
            const gone = latest?.body === null;
            return (
              <li key={message.messageId} data-testid="message">
                <strong>{ROLE_TEXT[message.authorRole]}</strong>
                {message.mine ? " (আপনি)" : ""} ·{" "}
                {latest ? when(latest.createdAt) : ""}
                <br />
                {gone ? (
                  <em>{KIND_TEXT[latest?.kind ?? "deleted"]}</em>
                ) : (
                  <span data-testid="message-body">{latest?.body}</span>
                )}
                {message.versions.length > 1 && (
                  <details>
                    <summary>
                      আগের সংস্করণ ({message.versions.length - 1})
                    </summary>
                    <ol>
                      {message.versions.slice(0, -1).map((version) => (
                        <li key={version.seq}>
                          {KIND_TEXT[version.kind]} · {when(version.createdAt)}:{" "}
                          {version.body ?? <em>লেখা নেই</em>}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                {!readOnly && !gone && (
                  <details>
                    <summary>এই বার্তা নিয়ে কিছু করুন</summary>
                    {message.mine && conversation.iConsented && (
                      <form action={reviseMessageAction}>
                        {hidden}
                        <input
                          type="hidden"
                          name="messageId"
                          value={message.messageId}
                        />
                        <label>
                          নতুন লেখা (আগের লেখা ইতিহাসে থেকে যাবে)
                          <input
                            name="body"
                            maxLength={4000}
                            defaultValue={latest?.body ?? ""}
                          />
                        </label>
                        <button type="submit" name="intent" value="edit">
                          সম্পাদনা সংরক্ষণ
                        </button>
                        <button type="submit" name="intent" value="delete">
                          মুছুন
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
                        এতে পাসওয়ার্ড, কোড বা পিন থাকলে জানান। লেখাটি সব সংস্করণ থেকে
                        সরানো হবে। তবে যিনি আগেই পড়েছেন তিনি পড়েছেন: যাঁর গোপন তথ্য,
                        তাঁকে সেটি সেবাদাতার সাইটে গিয়ে বদলাতে হবে।
                      </p>
                      <button type="submit">এতে গোপন তথ্য আছে</button>
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
                বার্তা
                <input
                  name="body"
                  required
                  maxLength={4000}
                  autoComplete="off"
                />
              </label>
              <button type="submit">পাঠান</button>
            </form>
            <details>
              <summary>এআই প্রক্রিয়ায় সম্মতি তুলে নিন</summary>
              <p>
                তুলে নিলে ভবিষ্যতে এআই এই কথোপকথন পড়বে না এবং আপনি নতুন বার্তা লিখতে
                পারবেন না, তবে পড়তে, ডিসপিউট খুলতে ও প্রমাণ দেখতে পারবেন। আগে পাঠানো বার্তা
                থেকে যাবে। এতে কাউকে অসৎ ধরা হয় না।
              </p>
              <form action={withdrawMonitoringAction}>
                {hidden}
                <button type="submit">সম্মতি তুলে নিচ্ছি</button>
              </form>
            </details>
          </>
        ) : (
          <form action={acceptMonitoringAction}>
            {hidden}
            <p>
              লিখতে হলে আগে সম্মতি দিন। আপনি যাতে সম্মতি দিচ্ছেন (সংস্করণ{" "}
              {MONITORING_POLICY.version}): আপনার বার্তা সার্ভারে পড়া যাবে এবং ডেলিভারিতে
              সহায়তা, সমস্যা নির্ণয় ও ডিসপিউট মীমাংসার জন্য এআই দিয়ে প্রক্রিয়া করা হতে পারে।
              মডেলের গন্তব্য: এখনো কোনো এআই যুক্ত নেই। সংযুক্তি: এখনো নেওয়া হয় না। সম্মতি
              যেকোনো সময় তুলে নেওয়া যায়।
            </p>
            <button type="submit">সম্মতি দিচ্ছি</button>
          </form>
        ))}
    </div>
  );
}
