import { formatBdt } from "@lp/contracts";
import type { Terms } from "@lp/db/agreements";
import type { DeliveryView } from "@lp/db/delivery";
import { PREDICATES } from "@lp/templates";
import { copyFor } from "../../lib/copy";
import { getI18n } from "../../lib/i18n";
import {
  acceptDeliveryAction,
  openDisputeAction,
  recordInspectionAction,
  setMockFactAction,
  submitDeliveryAction,
} from "./actions";

const SOURCE_TEXT = {
  bn: {
    seller_statement: "সেলারের ঘোষণা",
    buyer_observation: "বায়ারের নিজের চেক",
    independent_fact: "স্বাধীন উৎস",
  } as Record<string, string>,
  en: {
    seller_statement: "Seller's declaration",
    buyer_observation: "Buyer's own check",
    independent_fact: "Independent source",
  } as Record<string, string>,
};
const isMock = (predicate: string | undefined) =>
  PREDICATES[predicate ?? ""]?.capability?.startsWith("mock_") ?? false;

// For categories with nothing secret to hand over: the seller's statements
// start the delivery, and the provider's record does the proving.
export async function PlainDeliveryForm({
  dealId,
  declarable,
}: {
  dealId: string;
  declarable: { itemId: string; title: string; mandatory: boolean }[];
}) {
  const { L } = await getI18n();
  return (
    <form action={submitDeliveryAction} data-testid="submit-delivery">
      <h3>{L("ডেলিভারি জমা দিন", "Submit the delivery")}</h3>
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="vaultEvents" value="{}" />
      {declarable.map((item) => (
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
      <p>
        {L(
          "এই ধরনের প্রোডাক্টে গোপন কিছু হস্তান্তর হয় না। জমা দিলে প্রোভাইডারের রেকর্ড মিলিয়ে দেখা শুরু হয়। জমা দেওয়া মানে টাকা পাওয়া নয়।",
          "Nothing secret is handed over for this kind of product. Submitting starts the check against the provider's record. Submitting does not mean being paid.",
        )}
      </p>
      <button type="submit">
        {L("ডেলিভারি জমা দিন", "Submit the delivery")}
      </button>
    </form>
  );
}

// Scenario Lab control. There is no real provider behind any category, so a
// party sets what the fictional one answers. Labelled as such on every line.
export async function ProviderLab({
  dealId,
  terms,
  facts,
}: {
  dealId: string;
  terms: Terms;
  facts: { predicate: string; outcome: string; boundTo: string | null }[];
}) {
  const used = terms.items.filter((item) => isMock(item.predicate));
  if (used.length === 0) return null;
  const { locale, L } = await getI18n();
  return (
    <div data-testid="provider-lab">
      <h3>
        {L(
          "ল্যাব: টেস্ট প্রোভাইডার কী উত্তর দেবে",
          "Lab: what the test provider will answer",
        )}
      </h3>
      <p>
        {L(
          "এই ডিলের কোনো ভেরিফাই আসল প্রোভাইডার থেকে আসে না। চেকের জন্য এখানে ঠিক করা যায় টেস্ট প্রোভাইডার কী বলবে। কিছু ঠিক না করলে উত্তর “রেকর্ড নেই”, অর্থাৎ ভেরিফাই করা যায়নি।",
          "No verification in this deal comes from a real provider. For testing, you set here what the test provider says. If nothing is set the answer is “no record”, meaning it could not be verified.",
        )}
      </p>
      {used.map((item) => {
        const fact = facts.find((f) => f.predicate === item.predicate);
        const field = PREDICATES[item.predicate]?.bindsField;
        return (
          <form key={item.itemId} action={setMockFactAction}>
            <input type="hidden" name="dealId" value={dealId} />
            <input type="hidden" name="predicate" value={item.predicate} />
            <label>
              {item.title[locale]}
              <select
                name="outcome"
                defaultValue={fact?.outcome ?? "PASSED"}
                aria-label={`${L("টেস্ট প্রোভাইডার", "Test provider")}: ${item.title[locale]}`}
                style={{ display: "block", minHeight: 44 }}
              >
                <option value="PASSED">
                  {L("নিশ্চিত করছে", "Confirms it")}
                </option>
                <option value="FAILED">
                  {L("মিলছে না বলছে", "Says it does not match")}
                </option>
                <option value="UNKNOWN">
                  {L("উত্তর দিতে পারছে না", "Cannot answer")}
                </option>
              </select>
            </label>
            {field && (
              <label>
                {L(
                  `প্রোভাইডারের রেকর্ডে গন্তব্য (ডিলে: ${terms.product[field]})`,
                  `Destination in the provider's record (in the deal: ${terms.product[field]})`,
                )}
                <input
                  name="boundTo"
                  maxLength={200}
                  defaultValue={fact?.boundTo ?? terms.product[field]}
                />
              </label>
            )}
            <button type="submit">
              {L("টেস্ট উত্তর ঠিক করুন", "Set the test answer")}: {item.itemId}
            </button>
          </form>
        );
      })}
    </div>
  );
}

// B5 steps 5 to 7. Each line here is a recorded fact; none is inferred from
// another. "Delivered" is not "accepted", and "accepted" is not "paid".
export async function DeliverySection({
  dealId,
  myRole,
  terms,
  delivery,
}: {
  dealId: string;
  myRole: "buyer" | "seller";
  terms: Terms;
  delivery: DeliveryView;
}) {
  const { locale, L, dateTime } = await getI18n();
  const copy = copyFor(locale);
  const when = (date: Date | null) =>
    date ? dateTime(date) : L("নির্ধারিত হয়নি", "not set");
  const { package: pkg, settlement, dispute } = delivery;
  const item = (itemId: string) => terms.items.find((i) => i.itemId === itemId);
  const disputeOpen =
    dispute !== null &&
    !["RESOLVED", "UNRESOLVED_CLOSED"].includes(dispute.state);

  return (
    <div data-testid="delivery-section">
      <h3>{L("ডেলিভারি ও চেক", "Delivery and checks")}</h3>
      <dl>
        <dt>{L("ডেলিভারির শেষ সময়", "Delivery deadline")}</dt>
        <dd>{when(delivery.deliveryDueAt)}</dd>
        {pkg && (
          <>
            <dt>{L("ডেলিভারি", "Delivery")}</dt>
            <dd>
              {pkg.milestoneNo
                ? `${L("মাইলস্টোন", "Milestone")} ${pkg.milestoneNo} (${terms.milestones?.[pkg.milestoneNo - 1]?.title ?? ""}): `
                : ""}
              {L(
                `সংস্করণ ${pkg.versionNo} জমা পড়েছে`,
                `version ${pkg.versionNo} was submitted`,
              )}
              {pkg.accepted
                ? L(" এবং বায়ার গ্রহণ করেছেন", " and the buyer accepted it")
                : L(", এখনো গৃহীত হয়নি", ", not accepted yet")}
            </dd>
            <dt>{L("চেকের শেষ সময়", "Checking deadline")}</dt>
            <dd>{when(delivery.inspectionDueAt)}</dd>
          </>
        )}
      </dl>

      {!pkg && !settlement && (
        <p>
          {L(
            "সেলার এখনো কিছু জমা দেননি। শেষ সময়ের মধ্যে কিছু জমা না পড়লে বায়ার পুরো টাকা ফেরত পাবেন।",
            "The seller has not submitted anything yet. If nothing is submitted by the deadline, the buyer gets a full refund.",
          )}
        </p>
      )}

      {pkg && (
        <ol className="rows">
          {pkg.inspections.map((inspection) => {
            const definition = item(inspection.itemId);
            const name = definition?.title[locale];
            const buyerCheck =
              myRole === "buyer" &&
              definition?.predicate === "buyer_confirms" &&
              pkg.state === "SUBMITTED" &&
              !pkg.accepted;
            return (
              <li key={inspection.inspectionId}>
                {name ?? inspection.itemId} ·{" "}
                {inspection.mandatory
                  ? L("আবশ্যক", "required")
                  : L("ঐচ্ছিক", "optional")}{" "}
                ·{" "}
                <strong
                  className="chip"
                  data-tone={
                    inspection.state === "PASSED"
                      ? "ok"
                      : inspection.state === "FAILED"
                        ? "bad"
                        : inspection.state === "STALE"
                          ? undefined
                          : "wait"
                  }
                  data-testid={`inspection-${inspection.itemId}`}
                >
                  {copy.inspection[inspection.state] ?? inspection.state}
                </strong>
                {inspection.proofType && (
                  <small>
                    {" "}
                    · {L("উৎস", "source")}:{" "}
                    {isMock(definition?.predicate)
                      ? L("টেস্ট প্রোভাইডার (টেস্ট)", "test provider (test)")
                      : SOURCE_TEXT[locale][inspection.proofType]}
                    {isMock(definition?.predicate) &&
                    inspection.note === "NO_RECORD"
                      ? L(
                          " · প্রোভাইডারের কাছে কোনো রেকর্ড নেই",
                          " · the provider has no record",
                        )
                      : ""}
                    {inspection.note.startsWith("OTHER_DESTINATION ")
                      ? `${L(
                          " · প্রোভাইডারের রেকর্ড অন্য গন্তব্যের জন্য",
                          " · the provider's record is for another destination",
                        )}: ${inspection.note.slice(18)}`
                      : ""}
                  </small>
                )}
                {buyerCheck && (
                  <form action={recordInspectionAction}>
                    <input type="hidden" name="dealId" value={dealId} />
                    <input
                      type="hidden"
                      name="inspectionId"
                      value={inspection.inspectionId}
                    />
                    <button
                      type="submit"
                      name="outcome"
                      value="PASSED"
                      aria-label={`${name}: ${L("পাস", "Passed")}`}
                    >
                      {L("পাস", "Passed")}
                    </button>
                    <button
                      type="submit"
                      name="outcome"
                      value="FAILED"
                      aria-label={`${name}: ${L("ব্যর্থ", "Failed")}`}
                    >
                      {L("ব্যর্থ", "Failed")}
                    </button>
                    <button
                      type="submit"
                      name="outcome"
                      value="UNKNOWN"
                      aria-label={`${name}: ${L("চেক করা যাচ্ছে না", "Cannot check")}`}
                    >
                      {L("চেক করা যাচ্ছে না", "Cannot check")}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {pkg?.objectiveNoticePending && !settlement && (
        <p data-testid="objective-pending" role="status">
          {L(
            "প্রতিটি আবশ্যক শর্ত স্বাধীন উৎস থেকে প্রমাণিত হয়েছে। বায়ারকে নোটিফিকেশন দেওয়া হয়েছে, কিন্তু বায়ার এখনো সেটি দেখেননি। বায়ার না দেখা পর্যন্ত আপত্তির সময় শুরু হয় না, এবং শুধু সময় পার হওয়ার কারণে টাকা ছাড়া হবে না।",
            "Every required condition was proven from an independent source. The buyer was notified but has not seen the notice yet. The objection period does not start until the buyer has seen it, and money is not released just because time passed.",
          )}
        </p>
      )}

      {pkg?.objectiveDueAt && !settlement && (
        <p data-testid="objective-window" role="status">
          {L(
            `প্রতিটি আবশ্যক শর্ত স্বাধীন উৎস থেকে প্রমাণিত হয়েছে। বায়ার ${when(pkg.objectiveDueAt)} এর মধ্যে আপত্তি (ডিসপিউট) না করলে সেলারকে পেমেন্ট হবে। আপত্তি করলে টাকা আটকে থাকবে। চুপ থাকা মানে প্রোডাক্ট পেয়েছেন বলে স্বীকার করা নয়; এটি শুধু এই ডিলের নিয়ম।`,
            `Every required condition was proven from an independent source. The seller will be paid unless the buyer objects (opens a dispute) by ${when(pkg.objectiveDueAt)}. If the buyer objects, the money stays held. Staying silent is not an admission that the product was received; it is only this deal's rule.`,
          )}
        </p>
      )}

      {pkg &&
        myRole === "buyer" &&
        pkg.state === "SUBMITTED" &&
        !pkg.accepted &&
        (() => {
          const sum = formatBdt(
            pkg.milestoneNo
              ? (terms.milestones?.[pkg.milestoneNo - 1]?.amountMinor ??
                  terms.amountMinor)
              : terms.amountMinor,
          );
          return (
            <form action={acceptDeliveryAction}>
              <input type="hidden" name="dealId" value={dealId} />
              <input type="hidden" name="packageId" value={pkg.packageId} />
              <p>
                {L(
                  `গ্রহণ করলে ${sum} (${terms.currency}) সেলারকে পেমেন্টের অ্যাপ্রুভাল হবে, ডেলিভারির সংস্করণ ${pkg.versionNo} এর জন্য। সব আবশ্যক অংশ পাস না হলে গ্রহণ করা যাবে না।`,
                  `Accepting approves paying ${sum} (${terms.currency}) to the seller, for delivery version ${pkg.versionNo}. You cannot accept until every required part has passed.`,
                )}
              </p>
              <button type="submit">
                {L("এই ডেলিভারি গ্রহণ করুন", "Accept this delivery")}
              </button>
            </form>
          );
        })()}

      {settlement && (
        <div data-testid="settlement">
          <h3>{L("টাকার সেটেলমেন্ট", "Money settlement")}</h3>
          <p>
            {copy.path[settlement.path] ?? settlement.path} ·{" "}
            {copy.authorization[settlement.state] ?? settlement.state}
          </p>
          <ul>
            {settlement.operations.map((operation) => (
              <li key={operation.kind}>
                {operation.kind === "payout"
                  ? L("সেলারকে পেমেন্ট", "Payment to the seller")
                  : L("বায়ারকে ফেরত", "Refund to the buyer")}
                : {formatBdt(operation.amountMinor)} ·{" "}
                <strong data-testid={`operation-${operation.kind}`}>
                  {settlement.state === "INVALIDATED"
                    ? L("বাতিল, পাঠানো হয়নি", "Cancelled, not sent")
                    : (copy.operation[operation.state] ?? operation.state)}
                </strong>
              </li>
            ))}
          </ul>
          <p>
            {L(
              "সব লেনদেন টেস্ট; কোনো আসল টাকা নড়ে না।",
              "Every transfer is a test; no real money moves.",
            )}
          </p>
        </div>
      )}

      {dispute ? (
        <div data-testid="dispute">
          <h3>{L("ডিসপিউট", "Dispute")}</h3>
          <p>
            {L("রিপোর্ট", "Report")}:{" "}
            {copy.claim[dispute.claim] ?? dispute.claim} ·{" "}
            {disputeOpen ? L("খোলা", "open") : L("বন্ধ", "closed")}
          </p>
          <p>
            {dispute.afterDispatch
              ? L(
                  "এই ডিসপিউট খোলার আগেই টাকা পাঠানোর প্রক্রিয়া শুরু হয়ে গিয়েছিল। তাই পাঠানো থামানো যায়নি; এটি পেমেন্ট-পরবর্তী দাবি হিসেবে রেকর্ড হয়েছে। স্বয়ংক্রিয় ফেরতের প্রতিশ্রুতি দেওয়া হচ্ছে না।",
                  "Sending the money had already started before this dispute was opened. So it could not be stopped; this is recorded as a claim made after payment. No automatic refund is promised.",
                )
              : L(
                  "ডিসপিউট খোলা থাকা পর্যন্ত টাকা আটকে থাকবে। মীমাংসার উপায়গুলো নিচে আছে।",
                  "The money stays held while the dispute is open. The ways to settle it are below.",
                )}
          </p>
        </div>
      ) : (
        <details>
          <summary>
            {L("সমস্যা জানান (ডিসপিউট খুলুন)", "Report a problem (open a dispute)")}
          </summary>
          <p>
            {L(
              "ডিসপিউট খুললে এখনো পাঠানো হয়নি এমন টাকা আটকে যায়। রিপোর্ট মানেই কেউ দোষী নয়; এটি শুধু বিষয়টি রেকর্ড করে।",
              "Opening a dispute holds any money that has not been sent yet. A report does not mean anyone is at fault; it only records the matter.",
            )}
          </p>
          <form action={openDisputeAction}>
            <input type="hidden" name="dealId" value={dealId} />
            <label>
              {L("কী সমস্যা?", "What is the problem?")}
              <select
                name="claim"
                required
                style={{ display: "block", minHeight: 44 }}
              >
                {Object.entries(copy.claim).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {L(
                "বিস্তারিত (পাসওয়ার্ড, OTP বা পিন লিখবেন না)",
                "Details (do not write a password, OTP or PIN)",
              )}
              <input name="detail" maxLength={2000} />
            </label>
            <button type="submit">
              {L("ডিসপিউট খুলুন", "Open the dispute")}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
