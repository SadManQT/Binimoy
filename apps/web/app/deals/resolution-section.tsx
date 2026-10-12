import { formatBdt } from "@lp/contracts";
import type { Balances } from "@lp/db/ledger";
import type { Decision, DisputeView } from "@lp/db/review";
import { DISPUTE_TEXT } from "../../lib/copy";
import {
  acceptProposalAction,
  appealAction,
  proposeResolutionAction,
  reopenDisputeAction,
  requestReviewAction,
  waiveAppealAction,
} from "./actions";

const when = (date: Date | null) =>
  date
    ? `${date.toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" })} (Asia/Dhaka)`
    : "";

export function DecisionText({ decision }: { decision: Decision }) {
  return (
    <div data-testid="decision">
      <p>
        <strong>
          {decision.kind === "appeal" ? "আপিলের সিদ্ধান্ত" : "রিভিউয়ারের সিদ্ধান্ত"}:
        </strong>{" "}
        {decision.outcome === "UNRESOLVED"
          ? "তথ্য দিয়ে বিষয়টি সেটেলমেন্ট করা যায়নি; অমীমাংসিত।"
          : `সেলার ${formatBdt(decision.toSellerMinor)}, বায়ার ${formatBdt(decision.toBuyerMinor)}`}
      </p>
      <dl>
        <dt>যে নিয়ম প্রয়োগ হয়েছে</dt>
        <dd>{decision.rule}</dd>
        <dt>যে তথ্য প্রতিষ্ঠিত</dt>
        <dd>{decision.facts}</dd>
        <dt>যে অনুমান গ্রহণ করা হয়নি</dt>
        <dd>{decision.rejectedInferences || "উল্লেখ নেই"}</dd>
        <dt>যুক্তি</dt>
        <dd>{decision.reasoning}</dd>
      </dl>
    </div>
  );
}

// B9, B10, D.6: the ways a held amount can be resolved, and where each stands.
export function ResolutionSection({
  dealId,
  mode,
  balances,
  dispute,
  proposal,
}: {
  dealId: string;
  mode: string;
  balances: Balances;
  dispute: DisputeView | null;
  proposal: DisputeView["proposal"];
}) {
  const decided =
    dispute && ["DECIDED_AWAITING_APPEAL", "APPEALED"].includes(dispute.state);
  const latest = dispute?.decisions.at(-1);
  const hidden = <input type="hidden" name="dealId" value={dealId} />;

  return (
    <div data-testid="resolution-section">
      <h3>মীমাংসা</h3>
      {dispute && (
        <p>
          ডিসপিউটের অবস্থা:{" "}
          <strong data-testid="dispute-state">
            {DISPUTE_TEXT[dispute.state] ?? dispute.state}
          </strong>
        </p>
      )}

      {dispute?.decisions.map((decision) => (
        <DecisionText
          key={decision.createdAt.toISOString()}
          decision={decision}
        />
      ))}

      {dispute?.state === "DECIDED_AWAITING_APPEAL" && (
        <div>
          <p>
            আপিলের শেষ সময়: {when(latest?.appealDeadline ?? null)}. এই সময়ের
            মধ্যে কেউ আপিল না করলে সিদ্ধান্ত কার্যকর হবে এবং টাকা পাঠানো হবে।
          </p>
          {dispute.appealable && (
            <form action={appealAction}>
              {hidden}
              <p>আপিল করলে টাকা আটকে থাকবে এবং ভিন্ন একজন রিভিউয়ার বিষয়টি দেখবেন।</p>
              <button type="submit">আপিল করুন</button>
            </form>
          )}
          {dispute.iWaived ? (
            <p>
              আপনি এই সিদ্ধান্ত মেনে নিয়েছেন। অন্য পক্ষের অপেক্ষা বা সময় শেষ হওয়ার অপেক্ষা।
            </p>
          ) : (
            <form action={waiveAppealAction}>
              {hidden}
              <p>
                দুই পক্ষই সিদ্ধান্ত মেনে নিলে অপেক্ষা না করে এখনই কার্যকর হবে। মেনে নিলে
                আপনি আপনার আপিলের বাকি সময় ছেড়ে দিচ্ছেন।
              </p>
              <button type="submit">সিদ্ধান্ত মেনে নিচ্ছি</button>
            </form>
          )}
        </div>
      )}

      {dispute?.state === "OPEN" &&
        (mode === "ai_only" ? (
          <p>
            এই ডিল শুধু-এআই ধরনে, তাই হিউম্যান রিভিউ নেই। দুই পক্ষ নিচে সম্মত বণ্টন করতে
            পারেন। তা না হলে ডিসপিউটটি ৭ দিন পর অমীমাংসিত হিসেবে বন্ধ হবে এবং টাকা আটকে
            থাকবে।
          </p>
        ) : (
          <form action={requestReviewAction}>
            {hidden}
            <p>
              রিভিউয়ার চাইলে বিষয়টি সারিতে যাবে। কখন কেউ দায়িত্ব নেবেন তার নিশ্চয়তা দেওয়া
              হচ্ছে না; সারিতে থাকা মানে কাউকে দেওয়া হয়ে যাওয়া নয়।
            </p>
            <button type="submit">হিউম্যান রিভিউ চাই</button>
          </form>
        ))}

      {dispute?.state === "UNRESOLVED_CLOSED" && (
        <form action={reopenDisputeAction}>
          {hidden}
          <p>নতুন গুরুত্বপূর্ণ প্রমাণ থাকলে ডিসপিউটটি আবার খোলা যায়।</p>
          <button type="submit">ডিসপিউট আবার খুলুন</button>
        </form>
      )}

      {balances.held > 0n && !decided && (
        <div>
          <h4>দুই পক্ষের সম্মত বণ্টন</h4>
          <p>
            আটকে আছে {formatBdt(balances.held.toString())}. এক পক্ষ প্রস্তাব দেন,
            অন্য পক্ষ ঠিক সেই প্রস্তাব গ্রহণ করলে তবেই টাকা সেভাবে ভাগ হয়।
          </p>
          {proposal && (
            <div data-testid="proposal">
              <p>
                খোলা প্রস্তাব: সেলার {formatBdt(proposal.toSellerMinor)}, বায়ার{" "}
                {formatBdt(proposal.toBuyerMinor)}
              </p>
              {proposal.proposedByMe ? (
                <p>এটি আপনার প্রস্তাব। অন্য পক্ষের উত্তরের অপেক্ষা।</p>
              ) : (
                <form action={acceptProposalAction}>
                  {hidden}
                  <input
                    type="hidden"
                    name="proposalId"
                    value={proposal.proposalId}
                  />
                  <button type="submit">ঠিক এই বণ্টনে সম্মত</button>
                </form>
              )}
            </div>
          )}
          <form action={proposeResolutionAction}>
            {hidden}
            <label>
              সেলার পাবেন (টাকা; বাকিটা বায়ার ফেরত পাবেন)
              <input
                name="toSellerTaka"
                required
                inputMode="decimal"
                pattern="[0-9]+(\.[0-9]{1,2})?"
              />
            </label>
            <button type="submit">
              {proposal ? "নতুন প্রস্তাব দিন (আগেরটি বাতিল হবে)" : "প্রস্তাব দিন"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
