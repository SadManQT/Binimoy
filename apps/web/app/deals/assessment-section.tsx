import type { AssessmentView } from "@lp/adapters";
import { requestAssessmentAction } from "./actions";

const NEXT_STEP_TEXT: Record<string, string> = {
  CORRECT_AND_RETEST: "সেলার সংশোধন করুন, তারপর আবার চেক",
  BUYER_RETEST: "বায়ার আবার চেক করুন",
  PROVIDER_CHECK: "সেবাদাতার কাছ থেকে স্বাধীন ভেরিফাই",
  REQUEST_HUMAN_REVIEW: "হিউম্যান রিভিউ চাওয়া",
  MUTUAL_RESOLUTION: "দুই পক্ষের সম্মত বণ্টন",
  NONE: "এখন কিছু করার দরকার নেই",
};

const FAILURE_TEXT: Record<string, string> = {
  MODEL_UNAVAILABLE:
    "এআই এখন পাওয়া যাচ্ছে না। ডিলের বাকি সব কাজ (বার্তা, চেক, ডিসপিউট, মীমাংসা) এআই ছাড়াই চলে।",
  INVALID_OUTPUT:
    "এআই যা লিখেছিল তা ভেরিফাইয়ে টেকেনি (যেমন এমন প্রমাণের উল্লেখ যা রেকর্ডে নেই), তাই দেখানো হয়নি।",
  CONSENT_WITHDRAWN_DURING_RUN:
    "কাজ চলার সময় একজন কনসেন্ট তুলে নিয়েছেন, তাই ফলাফল ফেলে দেওয়া হয়েছে।",
  CONSENT_NOT_ACTIVE: "দুই পক্ষের কনসেন্ট সক্রিয় ছিল না, তাই চালানো হয়নি।",
  INTERNAL_ERROR: "একটি অভ্যন্তরীণ ত্রুটিতে কাজটি শেষ হয়নি।",
};

// B12, D.11: what the model wrote, kept visibly apart from recorded facts.
// The dashed border marks everything inside as a suggestion.
export function AssessmentSection({
  dealId,
  view,
  readOnly = false,
}: {
  dealId: string;
  view: AssessmentView;
  readOnly?: boolean;
}) {
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
      <h3>এআই-এর সারসংক্ষেপ (প্রস্তাব, সিদ্ধান্ত নয়)</h3>
      <p>
        এটি রেকর্ড পড়ে লেখা একটি সহায়ক সারসংক্ষেপ। এআই টাকা ছাড়তে, ফেরত দিতে বা কোনো
        সিদ্ধান্ত নিতে পারে না, এবং গোপন ভল্টের কিছু দেখতে পায় না। এতে ভুল থাকতে পারে।
      </p>

      {working && (
        <p data-testid="assessment-status">
          এআই রেকর্ড পড়ছে… একটু পরে পাতা রিফ্রেশ করুন।
        </p>
      )}
      {job?.status === "FAILED" ||
      job?.status === "DISCARDED" ||
      job?.status === "CANCELLED" ? (
        <p data-testid="assessment-status">
          {FAILURE_TEXT[job.failure ?? ""] ?? "শেষ অনুরোধটি সম্পন্ন হয়নি।"}
        </p>
      ) : null}

      {assessment && (
        <div>
          <p>
            <small>
              মডেল: {assessment.modelId}
              {assessment.modelId === "fixture" &&
                " (টেস্ট মডেল: এটি শুধু রেকর্ডের কথাগুলো সাজিয়ে দেখায়, বিচার-বিবেচনা করে না)"}{" "}
              ·{" "}
              {assessment.createdAt.toLocaleString("bn-BD", {
                timeZone: "Asia/Dhaka",
              })}
            </small>
          </p>
          {assessment.stale && (
            <p data-testid="assessment-stale">
              <strong>
                এটি লেখার পর কথোপকথন, ডেলিভারি বা ডিল বদলেছে। তাই এই সারসংক্ষেপ পুরোনো।
              </strong>
            </p>
          )}
          <h4>রেকর্ডে যা প্রতিষ্ঠিত</h4>
          {assessment.output.establishedFacts.length === 0 ? (
            <p>কিছু নেই।</p>
          ) : (
            <ul>
              {assessment.output.establishedFacts.map((fact) => (
                <li key={fact.text}>{fact.text}</li>
              ))}
            </ul>
          )}
          <h4>পক্ষদের বক্তব্য (দাবি, প্রমাণিত তথ্য নয়)</h4>
          <ul>
            {assessment.output.partyClaims.map((claim) => (
              <li key={`${claim.party}-${claim.text}`}>
                {claim.party === "buyer" ? "বায়ার" : "সেলার"}: {claim.text}
              </li>
            ))}
          </ul>
          {assessment.output.contradictions.length > 0 && (
            <>
              <h4>রেকর্ডে অমিল</h4>
              <ul>
                {assessment.output.contradictions.map((c) => (
                  <li key={c.text}>{c.text}</li>
                ))}
              </ul>
            </>
          )}
          {assessment.output.missingEvidence.length > 0 && (
            <>
              <h4>যে প্রমাণ নেই</h4>
              <ul>
                {assessment.output.missingEvidence.map((m) => (
                  <li key={m.text}>{m.text}</li>
                ))}
              </ul>
            </>
          )}
          {assessment.output.coverageGaps.length > 0 && (
            <p>
              যা এআই-কে দেখানো হয়নি: {assessment.output.coverageGaps.join(" ")}
            </p>
          )}
          <p data-testid="assessment-next-step">
            প্রস্তাবিত পরের ধাপ:{" "}
            <strong>
              {NEXT_STEP_TEXT[assessment.output.proposedNextStep] ??
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
                {assessment ? "নতুন সারসংক্ষেপ চান" : "এআই-এর সারসংক্ষেপ চান"}
              </button>
              <small> বাকি অনুরোধ: {view.budgetLeft}</small>
            </form>
          ) : (
            <p>এই ডিলে এআই ব্যবহারের সীমা শেষ হয়েছে।</p>
          )
        ) : (
          <p>
            দুই পক্ষ কথোপকথনে কনসেন্ট না দিলে এআই কিছু পড়ে না, তাই সারসংক্ষেপ চাওয়া যাবে না।
          </p>
        ))}
    </div>
  );
}
