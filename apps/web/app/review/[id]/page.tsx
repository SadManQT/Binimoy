import { getAssessment } from "@lp/adapters";
import { formatBdt } from "@lp/contracts";
import { getConversation } from "@lp/db/conversation";
import { getCase } from "@lp/db/review";
import { notFound } from "next/navigation";
import { copyFor } from "../../../lib/copy";
import { getI18n } from "../../../lib/i18n";
import { pool } from "../../../lib/pool";
import { requireUser } from "../../../lib/session";
import { AssessmentSection } from "../../deals/assessment-section";
import { ConversationSection } from "../../deals/conversation-section";
import { DecisionText } from "../../deals/resolution-section";
import { decideAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "কেস · বিনিময়" };

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;
  // Only the reviewer currently assigned to this case gets anything.
  const view = await getCase(pool(), user.id, id);
  if (!view) notFound();
  const { locale, L } = await getI18n();
  const copy = copyFor(locale);
  const conversation = await getConversation(pool(), {
    userId: user.id,
    dealId: view.dealId,
  });
  const assessment = await getAssessment(pool(), {
    userId: user.id,
    dealId: view.dealId,
  });
  const canDecide =
    (view.kind === "review" && view.state === "REVIEWING") ||
    (view.kind === "appeal" && view.state === "APPEALED");
  const item = (itemId: string) =>
    view.terms.items.find((i) => i.itemId === itemId)?.title[locale] ?? itemId;

  return (
    <main>
      <p>
        <a href="/review">← {L("সারি", "Queue")}</a>
      </p>
      <h1>
        {view.kind === "appeal" ? L("আপিল", "Appeal") : L("কেস", "Case")}:{" "}
        {view.title}
      </h1>
      {error && <p role="alert">{copy.error[error] ?? error}</p>}
      <dl>
        <dt>{L("অবস্থা", "Status")}</dt>
        <dd>{copy.dispute[view.state] ?? view.state}</dd>
        <dt>{L("রিপোর্ট", "Report")}</dt>
        <dd>
          {copy.claim[view.claim] ?? view.claim}
          {L(", করেছেন ", ", made by the ")}
          {copy.role[view.openedBy]}
        </dd>
        <dt>
          {L(
            "রিপোর্টকারীর বর্ণনা (দাবি, প্রতিষ্ঠিত তথ্য নয়)",
            "The reporter's account (a claim, not an established fact)",
          )}
        </dt>
        <dd>{view.detail || L("কিছু লেখা হয়নি", "Nothing was written")}</dd>
        <dt>{L("পক্ষ", "Parties")}</dt>
        <dd>
          {view.parties
            .map((p) => `${copy.role[p.role]}: ${p.name}`)
            .join(" · ")}
        </dd>
        <dt>{L("আটকে থাকা টাকা", "Money held")}</dt>
        <dd>{formatBdt(view.balances.held.toString())}</dd>
        <dt>
          {L(
            "টাকা পাঠানোর আগে না পরে ডিসপিউট",
            "Dispute opened before or after the money was sent",
          )}
        </dt>
        <dd>
          {view.afterDispatch
            ? L(
                "পরে: পাঠানো শুরু হয়ে গিয়েছিল। এটি পেমেন্ট-পরবর্তী দাবি।",
                "After: sending had already started. This is a claim made after payment.",
              )
            : L("আগে: টাকা আটকে আছে।", "Before: the money is held.")}
        </dd>
      </dl>

      <h2>{L("ডিল", "Deal")}</h2>
      <p>
        {L(
          `মূল্য ${formatBdt(view.terms.amountMinor)} · সংশোধনের সুযোগ ${view.terms.timing.correctionAttempts} বার`,
          `Price ${formatBdt(view.terms.amountMinor)} · correction attempts: ${view.terms.timing.correctionAttempts}`,
        )}
      </p>
      <ul>
        {Object.entries(view.terms.product).map(([key, value]) => (
          <li key={key}>
            {key}: {value}
          </li>
        ))}
      </ul>

      <h2>{L("ডেলিভারি ও চেকের রেকর্ড", "Delivery and check record")}</h2>
      {view.delivery.package ? (
        <ol>
          {view.delivery.package.inspections.map((inspection) => (
            <li key={inspection.inspectionId}>
              {item(inspection.itemId)} ·{" "}
              {inspection.mandatory
                ? L("আবশ্যক", "required")
                : L("ঐচ্ছিক", "optional")}{" "}
              · {copy.inspection[inspection.state] ?? inspection.state}
            </li>
          ))}
        </ol>
      ) : (
        <p>
          {L(
            "সেলার কোনো ডেলিভারি জমা দেননি।",
            "The seller did not submit any delivery.",
          )}
        </p>
      )}
      <p>
        {L(
          "গোপন ভল্টে যা পাঠানো হয়েছে তা এখানে নেই এবং দেখা সম্ভব নয়: সার্ভার তা কখনো পড়তে পারে না। আপনি শুধু জানতে পারেন কিছু পাঠানো হয়েছিল কি না।",
          "What was sent through the secret vault is not here and cannot be seen: the server can never read it. You can only know whether something was sent.",
        )}
      </p>

      {conversation && (
        <ConversationSection
          dealId={view.dealId}
          conversation={conversation}
          readOnly
        />
      )}

      {assessment?.assessment && (
        <>
          <p>
            {L(
              "নিচেরটি এআই-এর ড্রাফট। আপনার সিদ্ধান্ত আপনার নিজের পর্যবেক্ষণের ভিত্তিতে হবে; এর সাথে একমত হওয়া বাধ্যতামূলক নয়।",
              "What follows is the AI's draft. Your decision rests on your own reading of the record; you do not have to agree with it.",
            )}
          </p>
          <AssessmentSection dealId={view.dealId} view={assessment} readOnly />
        </>
      )}

      {view.decisions.length > 0 && (
        <h2>{L("আগের সিদ্ধান্ত", "Earlier decisions")}</h2>
      )}
      {view.decisions.map((decision) => (
        <DecisionText
          key={decision.createdAt.toISOString()}
          decision={decision}
        />
      ))}

      {canDecide && (
        <>
          <h2>{L("আপনার সিদ্ধান্ত", "Your decision")}</h2>
          <p>
            {L(
              'আপনি শুধু আটকে থাকা টাকা বণ্টন করতে পারেন; পরিমাণ বা গন্তব্য বদলাতে পারেন না, নতুন ফি বসাতে পারেন না। কারও লেখার ভঙ্গি, বানান বা ক্যামেরা চালু না করাকে অসততার প্রমাণ ধরবেন না। তথ্য যথেষ্ট না হলে "অমীমাংসিত" বেছে নিন।',
              "You can only split the money that is held; you cannot change the amount or where it goes, or add a new fee. Do not treat someone's writing style, spelling or not turning on a camera as proof of dishonesty. If the facts are not enough, choose “Unresolved”.",
            )}
            {view.kind === "review" &&
              L(
                " আপনার সিদ্ধান্তের পর আপিলের সময় চলবে; তার আগে টাকা পাঠানো হবে না।",
                " After your decision the appeal period runs; no money is sent before it ends.",
              )}
            {view.kind === "appeal" &&
              L(" আপিলের সিদ্ধান্ত চূড়ান্ত।", " An appeal decision is final.")}
          </p>
          <form action={decideAction}>
            <input type="hidden" name="disputeId" value={view.disputeId} />
            <fieldset>
              <legend>{L("ফলাফল", "Outcome")}</legend>
              <label>
                <input
                  type="radio"
                  name="outcome"
                  value="ALLOCATE"
                  required
                  defaultChecked
                  style={{ display: "inline", width: "auto", minHeight: 0 }}
                />{" "}
                {L("বণ্টন", "Split")}
              </label>
              <label>
                <input
                  type="radio"
                  name="outcome"
                  value="UNRESOLVED"
                  required
                  style={{ display: "inline", width: "auto", minHeight: 0 }}
                />{" "}
                {L(
                  "অমীমাংসিত (টাকা আটকে থাকবে)",
                  "Unresolved (the money stays held)",
                )}
              </label>
            </fieldset>
            <label>
              {L(
                "সেলার পাবেন (টাকা; বাকিটা বায়ার পাবেন)",
                "The seller gets (taka; the buyer gets the rest)",
              )}
              <input
                name="toSellerTaka"
                inputMode="decimal"
                pattern="[0-9]+(\.[0-9]{1,2})?"
                defaultValue="0"
              />
            </label>
            <label>
              {L("কোন নিয়ম প্রয়োগ করছেন", "Which rule you are applying")}
              <input name="rule" required maxLength={2000} />
            </label>
            <label>
              {L("কোন তথ্য প্রতিষ্ঠিত", "Which facts are established")}
              <input name="facts" required maxLength={8000} />
            </label>
            <label>
              {L("কোন অনুমান গ্রহণ করেননি", "Which inferences you did not accept")}
              <input name="rejectedInferences" maxLength={8000} />
            </label>
            <label>
              {L("যুক্তি", "Reasoning")}
              <input name="reasoning" required maxLength={8000} />
            </label>
            <button type="submit">
              {L("সিদ্ধান্ত রেকর্ড করুন", "Record the decision")}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
