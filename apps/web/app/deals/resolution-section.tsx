import { formatBdt } from "@lp/contracts";
import type { Balances } from "@lp/db/ledger";
import type { Decision, DisputeView } from "@lp/db/review";
import { copyFor } from "../../lib/copy";
import { getI18n } from "../../lib/i18n";
import { More } from "../components/more";
import {
  acceptProposalAction,
  appealAction,
  proposeResolutionAction,
  reopenDisputeAction,
  requestReviewAction,
  waiveAppealAction,
} from "./actions";

export async function DecisionText({ decision }: { decision: Decision }) {
  const { L } = await getI18n();
  return (
    <div data-testid="decision">
      <p>
        <strong>
          {decision.kind === "appeal"
            ? L("আপিলের সিদ্ধান্ত", "Appeal decision")
            : L("রিভিউয়ারের সিদ্ধান্ত", "Reviewer's decision")}
          :
        </strong>{" "}
        {decision.outcome === "UNRESOLVED"
          ? L(
              "তথ্য দিয়ে বিষয়টি সেটেলমেন্ট করা যায়নি; অমীমাংসিত।",
              "The facts were not enough to settle this; unresolved.",
            )
          : L(
              `সেলার ${formatBdt(decision.toSellerMinor)}, বায়ার ${formatBdt(decision.toBuyerMinor)}`,
              `Seller ${formatBdt(decision.toSellerMinor)}, buyer ${formatBdt(decision.toBuyerMinor)}`,
            )}
      </p>
      <dl>
        <dt>{L("যে নিয়ম প্রয়োগ হয়েছে", "Rule applied")}</dt>
        <dd>{decision.rule}</dd>
        <dt>{L("যে তথ্য প্রতিষ্ঠিত", "Facts established")}</dt>
        <dd>{decision.facts}</dd>
        <dt>{L("যে অনুমান গ্রহণ করা হয়নি", "Inferences not accepted")}</dt>
        <dd>{decision.rejectedInferences || L("উল্লেখ নেই", "None stated")}</dd>
        <dt>{L("যুক্তি", "Reasoning")}</dt>
        <dd>{decision.reasoning}</dd>
      </dl>
    </div>
  );
}

// B9, B10, D.6: the ways a held amount can be resolved, and where each stands.
export async function ResolutionSection({
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
  const { locale, L, dateTime } = await getI18n();
  const copy = copyFor(locale);
  const decided =
    dispute && ["DECIDED_AWAITING_APPEAL", "APPEALED"].includes(dispute.state);
  const latest = dispute?.decisions.at(-1);
  const deadline = latest?.appealDeadline
    ? dateTime(latest.appealDeadline)
    : "";
  const hidden = <input type="hidden" name="dealId" value={dealId} />;

  return (
    <div data-testid="resolution-section">
      <h3>{L("মীমাংসা", "Settling it")}</h3>
      {dispute && (
        <p>
          {L("ডিসপিউটের অবস্থা", "Dispute status")}:{" "}
          <strong data-testid="dispute-state">
            {copy.dispute[dispute.state] ?? dispute.state}
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
            {L(
              `আপিলের শেষ সময়: ${deadline}. এই সময়ের মধ্যে কেউ আপিল না করলে সিদ্ধান্ত কার্যকর হবে এবং টাকা পাঠানো হবে।`,
              `Appeal deadline: ${deadline}. If nobody appeals by then, the decision takes effect and the money is sent.`,
            )}
          </p>
          {dispute.appealable && (
            <form action={appealAction}>
              {hidden}
              <p>
                {L(
                  "আপিল করলে টাকা আটকে থাকবে এবং ভিন্ন একজন রিভিউয়ার বিষয়টি দেখবেন।",
                  "If you appeal, the money stays held and a different reviewer looks at the matter.",
                )}
              </p>
              <button type="submit">{L("আপিল করুন", "Appeal")}</button>
            </form>
          )}
          {dispute.iWaived ? (
            <p>
              {L(
                "আপনি এই সিদ্ধান্ত মেনে নিয়েছেন। অন্য পক্ষের অপেক্ষা বা সময় শেষ হওয়ার অপেক্ষা।",
                "You accepted this decision. Waiting for the other side, or for the time to run out.",
              )}
            </p>
          ) : (
            <form action={waiveAppealAction}>
              {hidden}
              <More>
                {L(
                  "দুই পক্ষই সিদ্ধান্ত মেনে নিলে অপেক্ষা না করে এখনই কার্যকর হবে। মেনে নিলে আপনি আপনার আপিলের বাকি সময় ছেড়ে দিচ্ছেন।",
                  "If both sides accept the decision it takes effect now, without waiting. By accepting, you give up the rest of your time to appeal.",
                )}
              </More>
              <button type="submit">
                {L("সিদ্ধান্ত মেনে নিচ্ছি", "I accept the decision")}
              </button>
            </form>
          )}
        </div>
      )}

      {dispute?.state === "OPEN" &&
        (mode === "ai_only" ? (
          <p>
            {L(
              "এই ডিল শুধু-এআই ধরনে, তাই হিউম্যান রিভিউ নেই। দুই পক্ষ নিচে সম্মত বণ্টন করতে পারেন। তা না হলে ডিসপিউটটি ৭ দিন পর অমীমাংসিত হিসেবে বন্ধ হবে এবং টাকা আটকে থাকবে।",
              "This deal is in AI-only mode, so there is no human review. The two sides can agree on a split below. Otherwise the dispute closes as unresolved after 7 days and the money stays held.",
            )}
          </p>
        ) : (
          <form action={requestReviewAction}>
            {hidden}
            <More>
              {L(
                "রিভিউয়ার চাইলে বিষয়টি সারিতে যাবে। কখন কেউ দায়িত্ব নেবেন তার নিশ্চয়তা দেওয়া হচ্ছে না; সারিতে থাকা মানে কাউকে দেওয়া হয়ে যাওয়া নয়।",
                "Asking for a reviewer puts the matter in the queue. There is no promise of when someone will take it; being in the queue does not mean it has been given to anyone.",
              )}
            </More>
            <button type="submit">
              {L("হিউম্যান রিভিউ চাই", "Ask for a human review")}
            </button>
          </form>
        ))}

      {dispute?.state === "UNRESOLVED_CLOSED" && (
        <form action={reopenDisputeAction}>
          {hidden}
          <p>
            {L(
              "নতুন গুরুত্বপূর্ণ প্রমাণ থাকলে ডিসপিউটটি আবার খোলা যায়।",
              "The dispute can be reopened if there is important new evidence.",
            )}
          </p>
          <button type="submit">
            {L("ডিসপিউট আবার খুলুন", "Reopen the dispute")}
          </button>
        </form>
      )}

      {balances.held > 0n && !decided && (
        // Folded away until there is a dispute or a proposal to answer.
        <details className="fold" open={Boolean(dispute || proposal)}>
          <summary>
            <h4>{L("দুই পক্ষের সম্মত বণ্টন", "A split both sides agree to")}</h4>
          </summary>
          <p>
            {L(
              `আটকে আছে ${formatBdt(balances.held.toString())}. এক পক্ষ প্রস্তাব দেন, অন্য পক্ষ ঠিক সেই প্রস্তাব গ্রহণ করলে তবেই টাকা সেভাবে ভাগ হয়।`,
              `${formatBdt(balances.held.toString())} is held. One side proposes; the money is split that way only if the other side accepts exactly that proposal.`,
            )}
          </p>
          {proposal && (
            <div data-testid="proposal">
              <p>
                {L(
                  `খোলা প্রস্তাব: সেলার ${formatBdt(proposal.toSellerMinor)}, বায়ার ${formatBdt(proposal.toBuyerMinor)}`,
                  `Open proposal: seller ${formatBdt(proposal.toSellerMinor)}, buyer ${formatBdt(proposal.toBuyerMinor)}`,
                )}
              </p>
              {proposal.proposedByMe ? (
                <p>
                  {L(
                    "এটি আপনার প্রস্তাব। অন্য পক্ষের উত্তরের অপেক্ষা।",
                    "This is your proposal. Waiting for the other side's answer.",
                  )}
                </p>
              ) : (
                <form action={acceptProposalAction}>
                  {hidden}
                  <input
                    type="hidden"
                    name="proposalId"
                    value={proposal.proposalId}
                  />
                  <button type="submit">
                    {L("ঠিক এই বণ্টনে সম্মত", "I agree to exactly this split")}
                  </button>
                </form>
              )}
            </div>
          )}
          <form action={proposeResolutionAction}>
            {hidden}
            <label>
              {L(
                "সেলার পাবেন (টাকা; বাকিটা বায়ার ফেরত পাবেন)",
                "The seller gets (taka; the buyer is refunded the rest)",
              )}
              <input
                name="toSellerTaka"
                required
                inputMode="decimal"
                pattern="[0-9]+(\.[0-9]{1,2})?"
              />
            </label>
            <button type="submit">
              {proposal
                ? L(
                    "নতুন প্রস্তাব দিন (আগেরটি বাতিল হবে)",
                    "Make a new proposal (the earlier one is cancelled)",
                  )
                : L("প্রস্তাব দিন", "Make a proposal")}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
