import { formatBdt } from "@lp/contracts";
import { getReceipt } from "@lp/db/receipt";
import { notFound } from "next/navigation";
import {
  AUTHORIZATION_TEXT,
  CLAIM_TEXT,
  INSPECTION_TEXT,
  MODE_TEXT,
  OPERATION_TEXT,
  PATH_TEXT,
  PROOF_TEXT,
  ROLE_TEXT,
  STATE_TEXT,
} from "../../../../lib/copy";
import { pool } from "../../../../lib/pool";
import { requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "রসিদ · বিনিময়" };

const when = (iso: string) =>
  `${new Date(iso).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" })} (Asia/Dhaka)`;

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const receipt = await getReceipt(pool(), { userId: user.id, dealId: id });
  if (!receipt) notFound();
  const { agreement, balances } = receipt;

  return (
    <main data-testid="receipt">
      <p>
        <a href={`/deals/${receipt.dealId}`}>← ডিলে ফিরে যান</a>
      </p>
      <h1>রসিদ: {receipt.title}</h1>
      <p>
        <strong>টেস্ট রেকর্ড।</strong> এখানে কোনো আসল টাকা নড়েনি, এবং “স্বাধীন ভেরিফাই”
        লেখা ফলগুলো টেস্ট প্রোভাইডার থেকে এসেছে। এটি শুধু দুই পক্ষের জন্য ব্যক্তিগত রেকর্ড;
        এটি কারও সুনাম বা নির্ভরযোগ্যতার প্রমাণ নয়, এবং এটি প্রকাশ করা হয় না।
      </p>
      <p>
        <small>তৈরির সময়: {when(receipt.generatedAt)}</small>
      </p>
      {receipt.pending && (
        <p role="status" data-testid="receipt-pending">
          <strong>এখনো চূড়ান্ত নয়:</strong> কোনো টাকা পাঠানো বাকি বা অজানা অবস্থায় আছে, অথবা
          কোনো আবশ্যক চেক পাস হয়নি।
        </p>
      )}

      <section aria-labelledby="r-agreement">
        <h2 id="r-agreement">ডিল</h2>
        <dl>
          <dt>পক্ষ</dt>
          <dd>
            {receipt.parties
              .map((p) => `${ROLE_TEXT[p.role]}: ${p.name}`)
              .join(" · ")}
          </dd>
          <dt>সংস্করণ ও ছাপ</dt>
          <dd>
            সংস্করণ {agreement.versionNo} · <code>{agreement.termsHash}</code> ·{" "}
            {STATE_TEXT[agreement.state] ?? agreement.state}
          </dd>
          <dt>ধরন ও নীতি</dt>
          <dd>
            {agreement.categoryId} · {agreement.templateId} v
            {agreement.templateVersion} · নীতি {agreement.policyVersion} · সক্ষমতা{" "}
            {agreement.capabilityVersion}
          </dd>
          <dt>সেবার ধরন</dt>
          <dd>{MODE_TEXT[agreement.mode]?.name ?? agreement.mode}</dd>
          <dt>মূল্য</dt>
          <dd>
            {formatBdt(agreement.amountMinor)} ({agreement.currency}) · ফি{" "}
            {formatBdt(agreement.feeMinor)}
          </dd>
          {agreement.milestones.map((m) => (
            <div key={`${m.title}-${m.amountMinor}`}>
              <dt>মাইলস্টোন</dt>
              <dd>
                {m.title} · {formatBdt(m.amountMinor)}
              </dd>
            </div>
          ))}
          <dt>টাকা জমা</dt>
          <dd>
            {receipt.funding
              ? `${formatBdt(receipt.funding.amountMinor)} · ${receipt.funding.state}`
              : "জমা হয়নি"}
          </dd>
        </dl>
      </section>

      <section aria-labelledby="r-delivery">
        <h2 id="r-delivery">ডেলিভারি ও চেক</h2>
        {receipt.packages.length === 0 ? (
          <p>কিছু জমা পড়েনি।</p>
        ) : (
          receipt.packages.map((p) => (
            <div key={p.packageId}>
              <h3>
                সংস্করণ {p.versionNo}
                {p.milestoneNo ? ` · মাইলস্টোন ${p.milestoneNo}` : ""} ·{" "}
                {p.state === "SUPERSEDED"
                  ? "প্রতিস্থাপিত, আর গণ্য নয়"
                  : p.accepted
                    ? "বায়ার গ্রহণ করেছেন"
                    : "গৃহীত হয়নি"}
              </h3>
              <p>
                <small>জমা: {when(p.submittedAt)}</small>
              </p>
              <ul>
                {p.inspections.map((i) => (
                  <li key={i.itemId}>
                    {i.title} · {i.mandatory ? "আবশ্যক" : "ঐচ্ছিক"} ·{" "}
                    <strong>{INSPECTION_TEXT[i.state] ?? i.state}</strong>
                    {i.proofType
                      ? ` · প্রমাণ: ${PROOF_TEXT[i.proofType] ?? i.proofType}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section aria-labelledby="r-money">
        <h2 id="r-money">টাকার হিসাব</h2>
        <dl>
          <dt>আটকে আছে</dt>
          <dd>{formatBdt(balances.heldMinor)}</dd>
          <dt>অনুমোদিত, পাঠানো বাকি</dt>
          <dd>{formatBdt(balances.reservedMinor)}</dd>
          <dt>সেলারকে পেইড</dt>
          <dd data-testid="receipt-seller-paid">
            {formatBdt(balances.sellerPaidMinor)}
          </dd>
          <dt>বায়ারকে ফেরত</dt>
          <dd>{formatBdt(balances.buyerRefundedMinor)}</dd>
        </dl>
        {receipt.allocations.length === 0 ? (
          <p>এখনো কোনো সেটেলমেন্টের অ্যাপ্রুভাল হয়নি।</p>
        ) : (
          <ol>
            {receipt.allocations.map((a) => (
              <li key={a.createdAt}>
                {when(a.createdAt)} · {PATH_TEXT[a.path] ?? a.path} ·{" "}
                {AUTHORIZATION_TEXT[a.state] ?? a.state} · সেলার{" "}
                {formatBdt(a.toSellerMinor)}, বায়ার {formatBdt(a.toBuyerMinor)}
                <ul>
                  {a.operations.map((o) => (
                    <li key={o.kind}>
                      {o.kind === "payout" ? "সেলারকে পেমেন্ট" : "বায়ারকে ফেরত"}:{" "}
                      {formatBdt(o.amountMinor)} ·{" "}
                      {a.state === "INVALIDATED"
                        ? "বাতিল, পাঠানো হয়নি"
                        : (OPERATION_TEXT[o.state] ?? o.state)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

      {receipt.disputes.length > 0 && (
        <section aria-labelledby="r-disputes">
          <h2 id="r-disputes">ডিসপিউট</h2>
          <ul>
            {receipt.disputes.map((d) => (
              <li key={d.openedAt}>
                {when(d.openedAt)} · {CLAIM_TEXT[d.claim] ?? d.claim} ·{" "}
                {d.state}
              </li>
            ))}
          </ul>
          <p>ডিসপিউটের রেকর্ড কোনো পক্ষকে দোষী বলে না।</p>
        </section>
      )}
      <p>
        <small>
          এই রসিদে গোপন ভল্টের কিছু, কথোপকথনের কোনো লেখা বা কারও পাসওয়ার্ড নেই। ছাপাতে
          ব্রাউজারের প্রিন্ট ব্যবহার করুন।
        </small>
      </p>
    </main>
  );
}
