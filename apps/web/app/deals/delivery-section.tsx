import { formatBdt } from "@lp/contracts";
import type { Terms } from "@lp/db/agreements";
import type { DeliveryView } from "@lp/db/delivery";
import { PREDICATES } from "@lp/templates";
import {
  AUTHORIZATION_TEXT,
  CLAIM_TEXT,
  INSPECTION_TEXT,
  OPERATION_TEXT,
  PATH_TEXT,
} from "../../lib/copy";
import {
  acceptDeliveryAction,
  openDisputeAction,
  recordInspectionAction,
  setMockFactAction,
  submitDeliveryAction,
} from "./actions";

const SOURCE_TEXT: Record<string, string> = {
  seller_statement: "বিক্রেতার ঘোষণা",
  buyer_observation: "ক্রেতার নিজের পরীক্ষা",
  independent_fact: "স্বাধীন উৎস",
};
const isMock = (predicate: string | undefined) =>
  PREDICATES[predicate ?? ""]?.capability?.startsWith("mock_") ?? false;

// For categories with nothing secret to hand over: the seller's statements
// start the delivery, and the provider's record does the proving.
export function PlainDeliveryForm({
  dealId,
  declarable,
}: {
  dealId: string;
  declarable: { itemId: string; title: string; mandatory: boolean }[];
}) {
  return (
    <form action={submitDeliveryAction} data-testid="submit-delivery">
      <h3>সরবরাহ জমা দিন</h3>
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
          আমি ঘোষণা করছি: {item.title}
          {item.mandatory ? "" : " (ঐচ্ছিক)"}
        </label>
      ))}
      <p>
        এই ধরনের পণ্যে গোপন কিছু হস্তান্তর হয় না। জমা দিলে প্রোভাইডারের রেকর্ড মিলিয়ে দেখা
        শুরু হয়। জমা দেওয়া মানে টাকা পাওয়া নয়।
      </p>
      <button type="submit">সরবরাহ জমা দিন</button>
    </form>
  );
}

// Scenario Lab control. There is no real provider behind any category, so a
// party sets what the fictional one answers. Labelled as such on every line.
export function ProviderLab({
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
  return (
    <div data-testid="provider-lab">
      <h3>পরীক্ষাগার: নকল প্রোভাইডার কী উত্তর দেবে</h3>
      <p>
        এই ডিলের কোনো যাচাই আসল প্রোভাইডার থেকে আসে না। পরীক্ষার জন্য এখানে ঠিক করা যায় নকল
        প্রোভাইডার কী বলবে। কিছু ঠিক না করলে উত্তর “রেকর্ড নেই”, অর্থাৎ যাচাই করা যায়নি।
      </p>
      {used.map((item) => {
        const fact = facts.find((f) => f.predicate === item.predicate);
        const field = PREDICATES[item.predicate]?.bindsField;
        return (
          <form key={item.itemId} action={setMockFactAction}>
            <input type="hidden" name="dealId" value={dealId} />
            <input type="hidden" name="predicate" value={item.predicate} />
            <label>
              {item.title.bn}
              <select
                name="outcome"
                defaultValue={fact?.outcome ?? "PASSED"}
                aria-label={`নকল প্রোভাইডার: ${item.title.bn}`}
                style={{ display: "block", minHeight: 44 }}
              >
                <option value="PASSED">নিশ্চিত করছে</option>
                <option value="FAILED">মিলছে না বলছে</option>
                <option value="UNKNOWN">উত্তর দিতে পারছে না</option>
              </select>
            </label>
            {field && (
              <label>
                প্রোভাইডারের রেকর্ডে গন্তব্য (চুক্তিতে: {terms.product[field]})
                <input
                  name="boundTo"
                  maxLength={200}
                  defaultValue={fact?.boundTo ?? terms.product[field]}
                />
              </label>
            )}
            <button type="submit">নকল উত্তর ঠিক করুন: {item.itemId}</button>
          </form>
        );
      })}
    </div>
  );
}

const when = (date: Date | null) =>
  date
    ? `${date.toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" })} (Asia/Dhaka)`
    : "নির্ধারিত হয়নি";

// B5 steps 5 to 7. Each line here is a recorded fact; none is inferred from
// another. "Delivered" is not "accepted", and "accepted" is not "paid".
export function DeliverySection({
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
  const { package: pkg, settlement, dispute } = delivery;
  const item = (itemId: string) => terms.items.find((i) => i.itemId === itemId);
  const disputeOpen =
    dispute !== null &&
    !["RESOLVED", "UNRESOLVED_CLOSED"].includes(dispute.state);

  return (
    <div data-testid="delivery-section">
      <h3>সরবরাহ ও পরীক্ষা</h3>
      <dl>
        <dt>সরবরাহের শেষ সময়</dt>
        <dd>{when(delivery.deliveryDueAt)}</dd>
        {pkg && (
          <>
            <dt>সরবরাহ</dt>
            <dd>
              {pkg.milestoneNo
                ? `মাইলস্টোন ${pkg.milestoneNo} (${terms.milestones?.[pkg.milestoneNo - 1]?.title ?? ""}): `
                : ""}
              সংস্করণ {pkg.versionNo} জমা পড়েছে
              {pkg.accepted ? " এবং ক্রেতা গ্রহণ করেছেন" : ", এখনো গৃহীত হয়নি"}
            </dd>
            <dt>পরীক্ষার শেষ সময়</dt>
            <dd>{when(delivery.inspectionDueAt)}</dd>
          </>
        )}
      </dl>

      {!pkg && !settlement && (
        <p>
          বিক্রেতা এখনো কিছু জমা দেননি। শেষ সময়ের মধ্যে কিছু জমা না পড়লে ক্রেতা পুরো টাকা
          ফেরত পাবেন।
        </p>
      )}

      {pkg && (
        <ol className="rows">
          {pkg.inspections.map((inspection) => {
            const definition = item(inspection.itemId);
            const buyerCheck =
              myRole === "buyer" &&
              definition?.predicate === "buyer_confirms" &&
              pkg.state === "SUBMITTED" &&
              !pkg.accepted;
            return (
              <li key={inspection.inspectionId}>
                {definition?.title.bn ?? inspection.itemId} ·{" "}
                {inspection.mandatory ? "আবশ্যক" : "ঐচ্ছিক"} ·{" "}
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
                  {INSPECTION_TEXT[inspection.state] ?? inspection.state}
                </strong>
                {inspection.proofType && (
                  <small>
                    {" "}
                    · উৎস:{" "}
                    {isMock(definition?.predicate)
                      ? "নকল প্রোভাইডার (পরীক্ষামূলক)"
                      : SOURCE_TEXT[inspection.proofType]}
                    {isMock(definition?.predicate) &&
                    inspection.note === "NO_RECORD"
                      ? " · প্রোভাইডারের কাছে কোনো রেকর্ড নেই"
                      : ""}
                    {inspection.note.startsWith("OTHER_DESTINATION ")
                      ? ` · প্রোভাইডারের রেকর্ড অন্য গন্তব্যের জন্য: ${inspection.note.slice(18)}`
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
                      aria-label={`${definition?.title.bn}: পাস`}
                    >
                      পাস
                    </button>
                    <button
                      type="submit"
                      name="outcome"
                      value="FAILED"
                      aria-label={`${definition?.title.bn}: ব্যর্থ`}
                    >
                      ব্যর্থ
                    </button>
                    <button
                      type="submit"
                      name="outcome"
                      value="UNKNOWN"
                      aria-label={`${definition?.title.bn}: পরীক্ষা করা যাচ্ছে না`}
                    >
                      পরীক্ষা করা যাচ্ছে না
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
          প্রতিটি আবশ্যক শর্ত স্বাধীন উৎস থেকে প্রমাণিত হয়েছে। ক্রেতাকে নোটিশ দেওয়া হয়েছে,
          কিন্তু ক্রেতা এখনো সেটি দেখেননি। ক্রেতা না দেখা পর্যন্ত আপত্তির সময় শুরু হয় না, এবং
          শুধু সময় পার হওয়ার কারণে টাকা ছাড়া হবে না।
        </p>
      )}

      {pkg?.objectiveDueAt && !settlement && (
        <p data-testid="objective-window" role="status">
          প্রতিটি আবশ্যক শর্ত স্বাধীন উৎস থেকে প্রমাণিত হয়েছে। ক্রেতা{" "}
          {when(pkg.objectiveDueAt)} এর মধ্যে আপত্তি (বিরোধ) না করলে বিক্রেতাকে
          পরিশোধ হবে। আপত্তি করলে টাকা আটকে থাকবে। চুপ থাকা মানে পণ্য পেয়েছেন বলে স্বীকার
          করা নয়; এটি শুধু এই চুক্তির নিয়ম।
        </p>
      )}

      {pkg &&
        myRole === "buyer" &&
        pkg.state === "SUBMITTED" &&
        !pkg.accepted && (
          <form action={acceptDeliveryAction}>
            <input type="hidden" name="dealId" value={dealId} />
            <input type="hidden" name="packageId" value={pkg.packageId} />
            <p>
              গ্রহণ করলে{" "}
              {formatBdt(
                pkg.milestoneNo
                  ? (terms.milestones?.[pkg.milestoneNo - 1]?.amountMinor ??
                      terms.amountMinor)
                  : terms.amountMinor,
              )}{" "}
              ({terms.currency}) বিক্রেতাকে পরিশোধের অনুমোদন হবে, সরবরাহের সংস্করণ{" "}
              {pkg.versionNo} এর জন্য। সব আবশ্যক অংশ পাস না হলে গ্রহণ করা যাবে না।
            </p>
            <button type="submit">এই সরবরাহ গ্রহণ করুন</button>
          </form>
        )}

      {settlement && (
        <div data-testid="settlement">
          <h3>টাকার নিষ্পত্তি</h3>
          <p>
            {PATH_TEXT[settlement.path] ?? settlement.path} ·{" "}
            {AUTHORIZATION_TEXT[settlement.state] ?? settlement.state}
          </p>
          <ul>
            {settlement.operations.map((operation) => (
              <li key={operation.kind}>
                {operation.kind === "payout"
                  ? "বিক্রেতাকে পরিশোধ"
                  : "ক্রেতাকে ফেরত"}
                : {formatBdt(operation.amountMinor)} ·{" "}
                <strong data-testid={`operation-${operation.kind}`}>
                  {settlement.state === "INVALIDATED"
                    ? "বাতিল, পাঠানো হয়নি"
                    : (OPERATION_TEXT[operation.state] ?? operation.state)}
                </strong>
              </li>
            ))}
          </ul>
          <p>সব লেনদেন পরীক্ষামূলক (নকল); কোনো আসল টাকা নড়ে না।</p>
        </div>
      )}

      {dispute ? (
        <div data-testid="dispute">
          <h3>বিরোধ</h3>
          <p>
            অভিযোগ: {CLAIM_TEXT[dispute.claim] ?? dispute.claim} ·{" "}
            {disputeOpen ? "খোলা" : "বন্ধ"}
          </p>
          <p>
            {dispute.afterDispatch
              ? "এই বিরোধ খোলার আগেই টাকা পাঠানোর প্রক্রিয়া শুরু হয়ে গিয়েছিল। তাই পাঠানো থামানো যায়নি; এটি পরিশোধ-পরবর্তী দাবি হিসেবে রেকর্ড হয়েছে। স্বয়ংক্রিয় ফেরতের প্রতিশ্রুতি দেওয়া হচ্ছে না।"
              : "বিরোধ খোলা থাকা পর্যন্ত টাকা আটকে থাকবে। মীমাংসার উপায়গুলো নিচে আছে।"}
          </p>
        </div>
      ) : (
        <details>
          <summary>সমস্যা জানান (বিরোধ খুলুন)</summary>
          <p>
            বিরোধ খুললে এখনো পাঠানো হয়নি এমন টাকা আটকে যায়। অভিযোগ মানেই কেউ দোষী নয়;
            এটি শুধু বিষয়টি রেকর্ড করে।
          </p>
          <form action={openDisputeAction}>
            <input type="hidden" name="dealId" value={dealId} />
            <label>
              কী সমস্যা?
              <select
                name="claim"
                required
                style={{ display: "block", minHeight: 44 }}
              >
                {Object.entries(CLAIM_TEXT).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              বিস্তারিত (পাসওয়ার্ড, OTP বা পিন লিখবেন না)
              <input name="detail" maxLength={2000} />
            </label>
            <button type="submit">বিরোধ খুলুন</button>
          </form>
        </details>
      )}
    </div>
  );
}
