import type { AssessmentView } from "@lp/adapters";
import { getI18n } from "../../lib/i18n";
import { More } from "../components/more";
import { requestAssessmentAction } from "./actions";

const NEXT_STEP_TEXT = {
  bn: {
    CORRECT_AND_RETEST: "সেলার সংশোধন করুন, তারপর আবার চেক",
    BUYER_RETEST: "বায়ার আবার চেক করুন",
    PROVIDER_CHECK: "সেবাদাতার কাছ থেকে স্বাধীন ভেরিফাই",
    REQUEST_HUMAN_REVIEW: "হিউম্যান রিভিউ চাওয়া",
    MUTUAL_RESOLUTION: "দুই পক্ষের সম্মত বণ্টন",
    NONE: "এখন কিছু করার দরকার নেই",
  } as Record<string, string>,
  en: {
    CORRECT_AND_RETEST: "The seller corrects it, then it is checked again",
    BUYER_RETEST: "The buyer checks again",
    PROVIDER_CHECK: "Independent verification from the service provider",
    REQUEST_HUMAN_REVIEW: "Ask for a human review",
    MUTUAL_RESOLUTION: "A split both sides agree to",
    NONE: "Nothing needs doing right now",
  } as Record<string, string>,
};

const FAILURE_TEXT = {
  bn: {
    MODEL_UNAVAILABLE:
      "এআই এখন পাওয়া যাচ্ছে না। ডিলের বাকি সব কাজ (বার্তা, চেক, ডিসপিউট, মীমাংসা) এআই ছাড়াই চলে।",
    INVALID_OUTPUT:
      "এআই যা লিখেছিল তা ভেরিফাইয়ে টেকেনি (যেমন এমন প্রমাণের উল্লেখ যা রেকর্ডে নেই), তাই দেখানো হয়নি।",
    CONSENT_WITHDRAWN_DURING_RUN:
      "কাজ চলার সময় একজন সম্মতি তুলে নিয়েছেন, তাই ফলাফল ফেলে দেওয়া হয়েছে।",
    CONSENT_NOT_ACTIVE: "দুই পক্ষের সম্মতি সক্রিয় ছিল না, তাই চালানো হয়নি।",
    INTERNAL_ERROR: "একটি অভ্যন্তরীণ ত্রুটিতে কাজটি শেষ হয়নি।",
  } as Record<string, string>,
  en: {
    MODEL_UNAVAILABLE:
      "The AI is not available right now. Everything else in the deal (messages, checks, disputes, settling) works without it.",
    INVALID_OUTPUT:
      "What the AI wrote did not pass verification (for example it cited evidence that is not in the record), so it was not shown.",
    CONSENT_WITHDRAWN_DURING_RUN:
      "Someone withdrew agreement while it was running, so the result was thrown away.",
    CONSENT_NOT_ACTIVE:
      "Both sides' agreement was not active, so it was not run.",
    INTERNAL_ERROR: "An internal error stopped it from finishing.",
  } as Record<string, string>,
};

// B12, D.11: what the model wrote, kept visibly apart from recorded facts.
// The dashed border marks everything inside as a suggestion.
export async function AssessmentSection({
  dealId,
  view,
  readOnly = false,
}: {
  dealId: string;
  view: AssessmentView;
  readOnly?: boolean;
}) {
  const { locale, L } = await getI18n();
  const { assessment, job } = view;
  const working = job && ["QUEUED", "RUNNING"].includes(job.status);
  return (
    <div
      data-testid="assessment"
      style={{
        border: "2px dashed #8888",
        padding: "0.75rem",
        margin: "1rem 0",
      }}
    >
      <h3>
        {L(
          "এআই-এর সারসংক্ষেপ (প্রস্তাব, সিদ্ধান্ত নয়)",
          "AI summary (a suggestion, not a decision)",
        )}
      </h3>
      <More>
        {L(
          "এটি রেকর্ড পড়ে লেখা একটি সহায়ক সারসংক্ষেপ। এআই টাকা ছাড়তে, ফেরত দিতে বা কোনো সিদ্ধান্ত নিতে পারে না, এবং গোপন ভল্টের কিছু দেখতে পায় না। এতে ভুল থাকতে পারে।",
          "This is a helper summary written from the record. The AI cannot release money, refund it or decide anything, and it sees nothing in the secret vault. It may contain mistakes.",
        )}
      </More>

      {working && (
        <p data-testid="assessment-status">
          {L(
            "এআই রেকর্ড পড়ছে… একটু পরে পাতা রিফ্রেশ করুন।",
            "The AI is reading the record… refresh the page in a moment.",
          )}
        </p>
      )}
      {job?.status === "FAILED" ||
      job?.status === "DISCARDED" ||
      job?.status === "CANCELLED" ? (
        <p data-testid="assessment-status">
          {FAILURE_TEXT[locale][job.failure ?? ""] ??
            L("শেষ অনুরোধটি সম্পন্ন হয়নি।", "The last request did not finish.")}
        </p>
      ) : null}

      {assessment && (
        <div>
          <p>
            <small>
              {L("মডেল", "Model")}: {assessment.modelId}
              {assessment.modelId === "fixture" &&
                L(
                  " (টেস্ট মডেল: এটি শুধু রেকর্ডের কথাগুলো সাজিয়ে দেখায়, বিচার-বিবেচনা করে না)",
                  " (test model: it only arranges what is in the record, it does not judge)",
                )}{" "}
              ·{" "}
              {assessment.createdAt.toLocaleString(
                locale === "en" ? "en-GB" : "bn-BD",
                { timeZone: "Asia/Dhaka" },
              )}
            </small>
          </p>
          {assessment.stale && (
            <p data-testid="assessment-stale">
              <strong>
                {L(
                  "এটি লেখার পর কথোপকথন, ডেলিভারি বা ডিল বদলেছে। তাই এই সারসংক্ষেপ পুরোনো।",
                  "The conversation, delivery or deal changed after this was written. So this summary is out of date.",
                )}
              </strong>
            </p>
          )}
          <h4>{L("রেকর্ডে যা প্রতিষ্ঠিত", "What the record establishes")}</h4>
          {assessment.output.establishedFacts.length === 0 ? (
            <p>{L("কিছু নেই।", "Nothing.")}</p>
          ) : (
            <ul>
              {assessment.output.establishedFacts.map((fact) => (
                <li key={fact.text}>{fact.text}</li>
              ))}
            </ul>
          )}
          <h4>
            {L(
              "পক্ষদের বক্তব্য (দাবি, প্রমাণিত তথ্য নয়)",
              "What each side says (claims, not proven facts)",
            )}
          </h4>
          <ul>
            {assessment.output.partyClaims.map((claim) => (
              <li key={`${claim.party}-${claim.text}`}>
                {claim.party === "buyer"
                  ? L("বায়ার", "Buyer")
                  : L("সেলার", "Seller")}
                : {claim.text}
              </li>
            ))}
          </ul>
          {assessment.output.contradictions.length > 0 && (
            <>
              <h4>{L("রেকর্ডে অমিল", "Contradictions in the record")}</h4>
              <ul>
                {assessment.output.contradictions.map((c) => (
                  <li key={c.text}>{c.text}</li>
                ))}
              </ul>
            </>
          )}
          {assessment.output.missingEvidence.length > 0 && (
            <>
              <h4>{L("যে প্রমাণ নেই", "Evidence that is missing")}</h4>
              <ul>
                {assessment.output.missingEvidence.map((m) => (
                  <li key={m.text}>{m.text}</li>
                ))}
              </ul>
            </>
          )}
          {assessment.output.coverageGaps.length > 0 && (
            <p>
              {L("যা এআই-কে দেখানো হয়নি", "What the AI was not shown")}:{" "}
              {assessment.output.coverageGaps.join(" ")}
            </p>
          )}
          <p data-testid="assessment-next-step">
            {L("প্রস্তাবিত পরের ধাপ", "Suggested next step")}:{" "}
            <strong>
              {NEXT_STEP_TEXT[locale][assessment.output.proposedNextStep] ??
                assessment.output.proposedNextStep}
            </strong>
            . {assessment.output.nextStepReason}
          </p>
        </div>
      )}

      {!readOnly &&
        !working &&
        (view.aiMayRead ? (
          view.budgetLeft > 0 ? (
            <form action={requestAssessmentAction}>
              <input type="hidden" name="dealId" value={dealId} />
              <button type="submit">
                {assessment
                  ? L("নতুন সারসংক্ষেপ চান", "Ask for a new summary")
                  : L("এআই-এর সারসংক্ষেপ চান", "Ask for an AI summary")}
              </button>
              <small>
                {" "}
                {L("বাকি অনুরোধ", "Requests left")}: {view.budgetLeft}
              </small>
            </form>
          ) : (
            <p>
              {L(
                "এই ডিলে এআই ব্যবহারের সীমা শেষ হয়েছে।",
                "The AI limit for this deal has been used up.",
              )}
            </p>
          )
        ) : (
          <p>
            {L(
              "দুই পক্ষ কথোপকথনে সম্মতি না দিলে এআই কিছু পড়ে না, তাই সারসংক্ষেপ চাওয়া যাবে না।",
              "Unless both sides agree in the conversation the AI reads nothing, so a summary cannot be requested.",
            )}
          </p>
        ))}
    </div>
  );
}
