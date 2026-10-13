import { formatBdt } from "@lp/contracts";
import { getReceipt } from "@lp/db/receipt";
import { notFound } from "next/navigation";
import { copyFor } from "../../../../lib/copy";
import { getI18n } from "../../../../lib/i18n";
import { pool } from "../../../../lib/pool";
import { requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "রসিদ · বিনিময়" };

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { locale, L, dateTime: when } = await getI18n();
  const receipt = await getReceipt(pool(), {
    userId: user.id,
    dealId: id,
    locale,
  });
  if (!receipt) notFound();
  const { agreement, balances } = receipt;
  const copy = copyFor(locale);

  return (
    <main data-testid="receipt">
      <p>
        <a href={`/deals/${receipt.dealId}`}>
          ← {L("ডিলে ফিরে যান", "Back to the deal")}
        </a>
      </p>
      <h1>
        {L("রসিদ", "Receipt")}: {receipt.title}
      </h1>
      <p>
        <strong>{L("টেস্ট রেকর্ড।", "Test record.")}</strong>{" "}
        {L(
          "এখানে কোনো আসল টাকা নড়েনি, এবং “স্বাধীন ভেরিফাই” লেখা ফলগুলো টেস্ট প্রোভাইডার থেকে এসেছে। এটি শুধু দুই পক্ষের জন্য ব্যক্তিগত রেকর্ড; এটি কারও সুনাম বা নির্ভরযোগ্যতার প্রমাণ নয়, এবং এটি প্রকাশ করা হয় না।",
          "No real money moved here, and results marked “independent verification” came from a test provider. This is a private record for the two sides only; it is not proof of anyone's reputation or reliability, and it is not published.",
        )}
      </p>
      <p>
        <small>
          {L("তৈরির সময়", "Generated")}: {when(receipt.generatedAt)}
        </small>
      </p>
      {receipt.pending && (
        <p role="status" data-testid="receipt-pending">
          <strong>{L("এখনো চূড়ান্ত নয়:", "Not final yet:")}</strong>{" "}
          {L(
            "কোনো টাকা পাঠানো বাকি বা অজানা অবস্থায় আছে, অথবা কোনো আবশ্যক চেক পাস হয়নি।",
            "a transfer is still outstanding or in an unknown state, or a required check has not passed.",
          )}
        </p>
      )}

      <section aria-labelledby="r-agreement">
        <h2 id="r-agreement">{L("ডিল", "Deal")}</h2>
        <dl>
          <dt>{L("পক্ষ", "Parties")}</dt>
          <dd>
            {receipt.parties
              .map((p) => `${copy.role[p.role]}: ${p.name}`)
              .join(" · ")}
          </dd>
          <dt>{L("সংস্করণ ও ছাপ", "Version and fingerprint")}</dt>
          <dd>
            {L("সংস্করণ", "Version")} {agreement.versionNo} ·{" "}
            <code>{agreement.termsHash}</code> ·{" "}
            {copy.state[agreement.state] ?? agreement.state}
          </dd>
          <dt>{L("ধরন ও নীতি", "Type and policy")}</dt>
          <dd>
            {agreement.categoryId} · {agreement.templateId} v
            {agreement.templateVersion} · {L("নীতি", "policy")}{" "}
            {agreement.policyVersion} · {L("সক্ষমতা", "capability")}{" "}
            {agreement.capabilityVersion}
          </dd>
          <dt>{L("সেবার ধরন", "Service mode")}</dt>
          <dd>{copy.mode[agreement.mode]?.name ?? agreement.mode}</dd>
          <dt>{L("মূল্য", "Price")}</dt>
          <dd>
            {formatBdt(agreement.amountMinor)} ({agreement.currency}) ·{" "}
            {L("ফি", "fee")} {formatBdt(agreement.feeMinor)}
          </dd>
          {agreement.milestones.map((m) => (
            <div key={`${m.title}-${m.amountMinor}`}>
              <dt>{L("মাইলস্টোন", "Milestone")}</dt>
              <dd>
                {m.title} · {formatBdt(m.amountMinor)}
              </dd>
            </div>
          ))}
          <dt>{L("টাকা জমা", "Funding")}</dt>
          <dd>
            {receipt.funding
              ? `${formatBdt(receipt.funding.amountMinor)} · ${copy.funding[receipt.funding.state] ?? receipt.funding.state}`
              : L("জমা হয়নি", "Not paid in")}
          </dd>
        </dl>
      </section>

      <section aria-labelledby="r-delivery">
        <h2 id="r-delivery">{L("ডেলিভারি ও চেক", "Delivery and checks")}</h2>
        {receipt.packages.length === 0 ? (
          <p>{L("কিছু জমা পড়েনি।", "Nothing was submitted.")}</p>
        ) : (
          receipt.packages.map((p) => (
            <div key={p.packageId}>
              <h3>
                {L("সংস্করণ", "Version")} {p.versionNo}
                {p.milestoneNo
                  ? ` · ${L("মাইলস্টোন", "milestone")} ${p.milestoneNo}`
                  : ""}{" "}
                ·{" "}
                {p.state === "SUPERSEDED"
                  ? L("প্রতিস্থাপিত, আর গণ্য নয়", "replaced, no longer counted")
                  : p.accepted
                    ? L("বায়ার গ্রহণ করেছেন", "accepted by the buyer")
                    : L("গৃহীত হয়নি", "not accepted")}
              </h3>
              <p>
                <small>
                  {L("জমা", "Submitted")}: {when(p.submittedAt)}
                </small>
              </p>
              <ul>
                {p.inspections.map((i) => (
                  <li key={i.itemId}>
                    {i.title} ·{" "}
                    {i.mandatory
                      ? L("আবশ্যক", "required")
                      : L("ঐচ্ছিক", "optional")}{" "}
                    · <strong>{copy.inspection[i.state] ?? i.state}</strong>
                    {i.proofType
                      ? ` · ${L("প্রমাণ", "proof")}: ${copy.proof[i.proofType] ?? i.proofType}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section aria-labelledby="r-money">
        <h2 id="r-money">{L("টাকার হিসাব", "Money")}</h2>
        <dl>
          <dt>{L("আটকে আছে", "Held")}</dt>
          <dd>{formatBdt(balances.heldMinor)}</dd>
          <dt>{L("অনুমোদিত, পাঠানো বাকি", "Approved, not yet sent")}</dt>
          <dd>{formatBdt(balances.reservedMinor)}</dd>
          <dt>{L("সেলারকে পেইড", "Paid to the seller")}</dt>
          <dd data-testid="receipt-seller-paid">
            {formatBdt(balances.sellerPaidMinor)}
          </dd>
          <dt>{L("বায়ারকে ফেরত", "Refunded to the buyer")}</dt>
          <dd>{formatBdt(balances.buyerRefundedMinor)}</dd>
        </dl>
        {receipt.allocations.length === 0 ? (
          <p>
            {L(
              "এখনো কোনো সেটেলমেন্টের অ্যাপ্রুভাল হয়নি।",
              "No settlement has been approved yet.",
            )}
          </p>
        ) : (
          <ol>
            {receipt.allocations.map((a) => (
              <li key={a.createdAt}>
                {when(a.createdAt)} · {copy.path[a.path] ?? a.path} ·{" "}
                {copy.authorization[a.state] ?? a.state} · {L("সেলার", "seller")}{" "}
                {formatBdt(a.toSellerMinor)}, {L("বায়ার", "buyer")}{" "}
                {formatBdt(a.toBuyerMinor)}
                <ul>
                  {a.operations.map((o) => (
                    <li key={o.kind}>
                      {o.kind === "payout"
                        ? L("সেলারকে পেমেন্ট", "Payment to the seller")
                        : L("বায়ারকে ফেরত", "Refund to the buyer")}
                      : {formatBdt(o.amountMinor)} ·{" "}
                      {a.state === "INVALIDATED"
                        ? L("বাতিল, পাঠানো হয়নি", "Cancelled, not sent")
                        : (copy.operation[o.state] ?? o.state)}
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
          <h2 id="r-disputes">{L("ডিসপিউট", "Disputes")}</h2>
          <ul>
            {receipt.disputes.map((d) => (
              <li key={d.openedAt}>
                {when(d.openedAt)} · {copy.claim[d.claim] ?? d.claim} ·{" "}
                {copy.dispute[d.state] ?? d.state}
              </li>
            ))}
          </ul>
          <p>
            {L(
              "ডিসপিউটের রেকর্ড কোনো পক্ষকে দোষী বলে না।",
              "A dispute record does not say either side is at fault.",
            )}
          </p>
        </section>
      )}
      <p>
        <small>
          {L(
            "এই রসিদে গোপন ভল্টের কিছু, কথোপকথনের কোনো লেখা বা কারও পাসওয়ার্ড নেই। ছাপাতে ব্রাউজারের প্রিন্ট ব্যবহার করুন।",
            "This receipt holds nothing from the secret vault, no conversation text and nobody's password. To print it, use your browser's print.",
          )}
        </small>
      </p>
    </main>
  );
}
