import { formatBdt } from "@lp/contracts";
import { getCase } from "@lp/db/review";
import { notFound } from "next/navigation";
import {
  CLAIM_TEXT,
  DISPUTE_TEXT,
  ERROR_TEXT,
  INSPECTION_TEXT,
  ROLE_TEXT,
} from "../../../lib/copy";
import { pool } from "../../../lib/pool";
import { requireUser } from "../../../lib/session";
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
  const canDecide =
    (view.kind === "review" && view.state === "REVIEWING") ||
    (view.kind === "appeal" && view.state === "APPEALED");
  const item = (itemId: string) =>
    view.terms.items.find((i) => i.itemId === itemId)?.title.bn ?? itemId;

  return (
    <main>
      <p>
        <a href="/review">← সারি</a>
      </p>
      <h1>
        {view.kind === "appeal" ? "আপিল" : "কেস"}: {view.title}
      </h1>
      {error && <p role="alert">{ERROR_TEXT[error] ?? error}</p>}
      <dl>
        <dt>অবস্থা</dt>
        <dd>{DISPUTE_TEXT[view.state] ?? view.state}</dd>
        <dt>অভিযোগ</dt>
        <dd>
          {CLAIM_TEXT[view.claim] ?? view.claim}, করেছেন{" "}
          {ROLE_TEXT[view.openedBy]}
        </dd>
        <dt>অভিযোগকারীর বর্ণনা (দাবি, প্রতিষ্ঠিত তথ্য নয়)</dt>
        <dd>{view.detail || "কিছু লেখা হয়নি"}</dd>
        <dt>পক্ষ</dt>
        <dd>
          {view.parties
            .map((p) => `${ROLE_TEXT[p.role]}: ${p.name}`)
            .join(" · ")}
        </dd>
        <dt>আটকে থাকা টাকা</dt>
        <dd>{formatBdt(view.balances.held.toString())}</dd>
        <dt>টাকা পাঠানোর আগে না পরে বিরোধ</dt>
        <dd>
          {view.afterDispatch
            ? "পরে: পাঠানো শুরু হয়ে গিয়েছিল। এটি পরিশোধ-পরবর্তী দাবি।"
            : "আগে: টাকা আটকে আছে।"}
        </dd>
      </dl>

      <h2>চুক্তি</h2>
      <p>
        মূল্য {formatBdt(view.terms.amountMinor)} · সংশোধনের সুযোগ{" "}
        {view.terms.timing.correctionAttempts} বার
      </p>
      <ul>
        {Object.entries(view.terms.product).map(([key, value]) => (
          <li key={key}>
            {key}: {value}
          </li>
        ))}
      </ul>

      <h2>সরবরাহ ও পরীক্ষার রেকর্ড</h2>
      {view.delivery.package ? (
        <ol>
          {view.delivery.package.inspections.map((inspection) => (
            <li key={inspection.inspectionId}>
              {item(inspection.itemId)} ·{" "}
              {inspection.mandatory ? "আবশ্যক" : "ঐচ্ছিক"} ·{" "}
              {INSPECTION_TEXT[inspection.state] ?? inspection.state}
            </li>
          ))}
        </ol>
      ) : (
        <p>বিক্রেতা কোনো সরবরাহ জমা দেননি।</p>
      )}
      <p>
        গোপন ভল্টে যা পাঠানো হয়েছে তা এখানে নেই এবং দেখা সম্ভব নয়: সার্ভার তা কখনো পড়তে পারে
        না। আপনি শুধু জানতে পারেন কিছু পাঠানো হয়েছিল কি না।
      </p>

      {view.decisions.length > 0 && <h2>আগের সিদ্ধান্ত</h2>}
      {view.decisions.map((decision) => (
        <DecisionText
          key={decision.createdAt.toISOString()}
          decision={decision}
        />
      ))}

      {canDecide && (
        <>
          <h2>আপনার সিদ্ধান্ত</h2>
          <p>
            আপনি শুধু আটকে থাকা টাকা বণ্টন করতে পারেন; পরিমাণ বা গন্তব্য বদলাতে পারেন না, নতুন
            ফি বসাতে পারেন না। কারও লেখার ভঙ্গি, বানান বা ক্যামেরা চালু না করাকে অসততার প্রমাণ
            ধরবেন না। তথ্য যথেষ্ট না হলে "অমীমাংসিত" বেছে নিন।
            {view.kind === "review" &&
              " আপনার সিদ্ধান্তের পর আপিলের সময় চলবে; তার আগে টাকা পাঠানো হবে না।"}
            {view.kind === "appeal" && " আপিলের সিদ্ধান্ত চূড়ান্ত।"}
          </p>
          <form action={decideAction}>
            <input type="hidden" name="disputeId" value={view.disputeId} />
            <fieldset>
              <legend>ফলাফল</legend>
              <label>
                <input
                  type="radio"
                  name="outcome"
                  value="ALLOCATE"
                  required
                  defaultChecked
                  style={{ display: "inline", width: "auto", minHeight: 0 }}
                />{" "}
                বণ্টন
              </label>
              <label>
                <input
                  type="radio"
                  name="outcome"
                  value="UNRESOLVED"
                  required
                  style={{ display: "inline", width: "auto", minHeight: 0 }}
                />{" "}
                অমীমাংসিত (টাকা আটকে থাকবে)
              </label>
            </fieldset>
            <label>
              বিক্রেতা পাবেন (টাকা; বাকিটা ক্রেতা পাবেন)
              <input
                name="toSellerTaka"
                inputMode="decimal"
                pattern="[0-9]+(\.[0-9]{1,2})?"
                defaultValue="0"
              />
            </label>
            <label>
              কোন নিয়ম প্রয়োগ করছেন
              <input name="rule" required maxLength={2000} />
            </label>
            <label>
              কোন তথ্য প্রতিষ্ঠিত
              <input name="facts" required maxLength={8000} />
            </label>
            <label>
              কোন অনুমান গ্রহণ করেননি
              <input name="rejectedInferences" maxLength={8000} />
            </label>
            <label>
              যুক্তি
              <input name="reasoning" required maxLength={8000} />
            </label>
            <button type="submit">সিদ্ধান্ত রেকর্ড করুন</button>
          </form>
        </>
      )}
    </main>
  );
}
