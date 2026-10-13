import { randomUUID } from "node:crypto";
import { getAssessment, getVaultRoom, matrixUserId } from "@lp/adapters";
import { formatBdt, loadConfig } from "@lp/contracts";
import { getDealView } from "@lp/db/agreements";
import { getConversation } from "@lp/db/conversation";
import { getDeliveryView } from "@lp/db/delivery";
import { dealBalances, getFunding } from "@lp/db/ledger";
import { renderNotices } from "@lp/db/notices";
import { getDisputeView } from "@lp/db/review";
import { getMockFacts } from "@lp/db/verification";
import { getTemplate } from "@lp/templates";
import { notFound } from "next/navigation";
import { copyFor } from "../../../lib/copy";
import { getI18n } from "../../../lib/i18n";
import { nextStep } from "../../../lib/next-step";
import { pool } from "../../../lib/pool";
import { requireUser } from "../../../lib/session";
import { agreementAction, createInviteAction } from "../actions";
import { AssessmentSection } from "../assessment-section";
import { ConversationSection } from "../conversation-section";
import {
  DeliverySection,
  PlainDeliveryForm,
  ProviderLab,
} from "../delivery-section";
import { FundingSection } from "../funding-section";
import { ResolutionSection } from "../resolution-section";
import { TermsFields } from "../terms-fields";
import { VaultPanel } from "../vault-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "ডিল · বিনিময়" };

export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; invite?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error, invite } = await searchParams;
  // Not a party and not found look the same on purpose.
  const deal = await getDealView(pool(), user.id, id);
  if (!deal) notFound();
  const { locale, L } = await getI18n();
  const copy = copyFor(locale);

  const funding = await getFunding(pool(), deal.dealId);
  const balances = await dealBalances(pool(), deal.dealId);
  const { agreement } = deal;
  const { terms } = agreement;
  const template = getTemplate(terms.templateId, terms.templateVersion);
  const open = ["DRAFT", "AWAITING_ACCEPTANCE"].includes(agreement.state);
  const editable = open;
  const amount = BigInt(terms.amountMinor);
  const amountTaka = `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
  const seller = deal.parties.find((p) => p.role === "seller");
  const counterparty = deal.parties.find((p) => p.role !== deal.myRole);
  const vault = loadConfig(process.env).vault;
  const vaultItems = terms.items
    .filter((item) => item.dataClass === "vault_secret")
    .map((item) => ({ itemId: item.itemId, title: item.title[locale] }));
  const vaultRoomId = await getVaultRoom(pool(), deal.dealId);
  // D.6: this signed-in page is where a party is shown the notices of this
  // deal, including the one that starts an objective-release challenge period.
  await renderNotices(pool(), user.id, deal.dealId);
  const delivery =
    funding?.state === "CONFIRMED"
      ? await getDeliveryView(pool(), deal.dealId)
      : null;
  const mockFacts = delivery ? await getMockFacts(pool(), deal.dealId) : [];
  const resolution = delivery
    ? await getDisputeView(pool(), user.id, deal.dealId)
    : null;
  // The room opens once both parties are in the deal.
  const conversation =
    deal.parties.length === 2
      ? await getConversation(pool(), { userId: user.id, dealId: deal.dealId })
      : null;
  const assessment = conversation
    ? await getAssessment(pool(), { userId: user.id, dealId: deal.dealId })
    : null;
  const milestones = (terms.milestones ?? []).map((m, n) => ({
    ...m,
    no: n + 1,
  }));
  const declarable = terms.items
    .filter((item) => item.predicate === "seller_declares")
    .map((item) => ({
      itemId: item.itemId,
      title: item.title[locale],
      mandatory: item.mandatory,
    }));

  const current = delivery?.package ?? null;
  const settled =
    delivery?.settlement && delivery.settlement.state !== "INVALIDATED"
      ? delivery.settlement
      : null;
  const step = nextStep(
    {
      myRole: deal.myRole,
      parties: deal.parties.length,
      agreementState: agreement.state,
      acceptedByMe: agreement.acceptedBy.includes(deal.myRole),
      funded: funding?.state === "CONFIRMED",
      package:
        current && current.state === "SUBMITTED"
          ? {
              accepted: current.accepted,
              mandatory: current.inspections
                .filter((i) => i.mandatory)
                .map((i) => i.state),
            }
          : null,
      settlement: settled
        ? { operations: settled.operations.map((o) => o.state) }
        : null,
      disputeOpen:
        delivery?.dispute != null &&
        !["RESOLVED", "UNRESOLVED_CLOSED"].includes(delivery.dispute.state),
    },
    locale,
  );

  // One fresh key per rendered form: a double click replays, a new page load
  // is a new action.
  const hidden = (command: string) => (
    <>
      <input type="hidden" name="dealId" value={deal.dealId} />
      <input type="hidden" name="agreementId" value={agreement.id} />
      <input
        type="hidden"
        name="expectedVersion"
        value={agreement.aggregateVersion}
      />
      <input type="hidden" name="idempotencyKey" value={`ui-${randomUUID()}`} />
      <input type="hidden" name="command" value={command} />
    </>
  );

  return (
    <main className="wide">
      <p>
        <a href="/deals">← {L("আমার ডিল", "My deals")}</a>
      </p>
      <h1>{deal.title}</h1>
      <p>
        <a href={`/deals/${deal.dealId}/receipt`}>
          {L("রসিদ ও পূর্ণ রেকর্ড", "Receipt and full record")}
        </a>
      </p>
      {error && <p role="alert">{copy.error[error] ?? error}</p>}
      <dl>
        <dt>{L("অবস্থা", "Status")}</dt>
        <dd>{copy.state[agreement.state] ?? agreement.state}</dd>
        <dt>{L("আপনার ভূমিকা", "Your role")}</dt>
        <dd>{copy.role[deal.myRole]}</dd>
        <dt>{L("পক্ষ", "Parties")}</dt>
        <dd>
          {deal.parties
            .map((p) => `${copy.role[p.role]}: ${p.name}`)
            .join(" · ")}
          {deal.parties.length === 1 &&
            L(
              " · অন্য পক্ষ এখনো যোগ দেননি",
              " · the other side has not joined yet",
            )}
        </dd>
      </dl>

      <div className="deal">
        <aside className="next-step" aria-labelledby="next-step-title">
          <h2 id="next-step-title">{L("এখন যা করার", "What to do now")}</h2>
          <p data-testid="next-step">{step.text}</p>
          <ol className="steps">
            {step.steps.map((item) => (
              <li key={item.key} data-step={item.state}>
                {item.label}
                {item.state === "done" && (
                  <span className="sr-only">{L(" (সম্পন্ন)", " (done)")}</span>
                )}
              </li>
            ))}
          </ol>
        </aside>
        <div className="deal-main">
          {deal.parties.length === 1 && open && (
            <section aria-labelledby="invite">
              <h2 id="invite">
                {L("অন্য পক্ষকে ইনভাইট", "Invite the other side")}
              </h2>
              {invite ? (
                <p>
                  {L(
                    "এই লিংকটি শুধু অন্য পক্ষকে পাঠান। এটি ৭২ ঘণ্টা চলবে, একবারই ব্যবহার করা যাবে, এবং আর দেখানো হবে না:",
                    "Send this link only to the other side. It works for 72 hours, can be used once, and will not be shown again:",
                  )}
                  <br />
                  <code style={{ wordBreak: "break-all" }}>
                    {loadConfig(process.env).APP_URL}/invite/{invite}
                  </code>
                </p>
              ) : (
                <form action={createInviteAction}>
                  <input type="hidden" name="dealId" value={deal.dealId} />
                  <button type="submit">
                    {L("ইনভাইট লিংক তৈরি করুন", "Create an invite link")}
                  </button>
                  <p>
                    {L(
                      "নতুন লিংক তৈরি করলে আগের লিংক বাতিল হয়ে যায়।",
                      "Creating a new link cancels the earlier one.",
                    )}
                  </p>
                </form>
              )}
            </section>
          )}

          <section aria-labelledby="terms">
            <h2 id="terms">
              {L(
                `ডিলের শর্ত (সংস্করণ ${agreement.versionNo})`,
                `Deal terms (version ${agreement.versionNo})`,
              )}
            </h2>
            <dl>
              <dt>{L("প্রোডাক্টের ধরন", "Product type")}</dt>
              <dd>{template.name[locale]}</dd>
              <dt>{L("মূল্য", "Price")}</dt>
              <dd>
                {formatBdt(terms.amountMinor)} ({terms.currency}) ·{" "}
                {L("ফি", "fee")} {formatBdt(terms.feeMinor)} ·{" "}
                {L("টেস্ট, কোনো আসল টাকা নয়", "test, no real money")}
              </dd>
              <dt>{L("সেবার ধরন", "Service mode")}</dt>
              <dd>
                {copy.mode[terms.mode]?.name ?? terms.mode}
                <br />
                <small>{copy.mode[terms.mode]?.note}</small>
              </dd>
              {template.fields.map((field) => (
                <div key={field.key}>
                  <dt>{field.label[locale]}</dt>
                  <dd>
                    {terms.product[field.key] || L("দেওয়া হয়নি", "Not given")}
                  </dd>
                </div>
              ))}
              {milestones.map((milestone) => (
                <div key={milestone.no}>
                  <dt>
                    {L("মাইলস্টোন", "Milestone")} {milestone.no}
                  </dt>
                  <dd>
                    {milestone.title} · {formatBdt(milestone.amountMinor)}
                  </dd>
                </div>
              ))}
              <dt>{L("সময়সীমা", "Time limits")}</dt>
              <dd>
                {L(
                  `ডেলিভারি: টাকা জমার পর ${terms.timing.deliveryHours} ঘণ্টা · চেক: ডেলিভারির পর ${terms.timing.inspectionHours} ঘণ্টা · সংশোধনের সুযোগ: ${terms.timing.correctionAttempts} বার · আপিল: ${terms.timing.appealHours} ঘণ্টা`,
                  `Delivery: ${terms.timing.deliveryHours} hours after funding · Checking: ${terms.timing.inspectionHours} hours after delivery · Correction attempts: ${terms.timing.correctionAttempts} · Appeal: ${terms.timing.appealHours} hours`,
                )}
              </dd>
              <dt>
                {L(
                  "বায়ারের চূড়ান্ত সম্মতি ছাড়া স্বয়ংক্রিয় ছাড়",
                  "Automatic release without the buyer's final acceptance",
                )}
              </dt>
              <dd>
                {terms.objectiveRelease
                  ? L(
                      `চালু: প্রতিটি আবশ্যক শর্ত স্বাধীনভাবে প্রমাণিত হলে বায়ারকে জানানো হয়, এবং ${terms.timing.objectiveChallengeHours} ঘণ্টার মধ্যে বায়ার আপত্তি না করলে সেলারকে পেমেন্ট হয়। আপত্তি করলে টাকা আটকে থাকে।`,
                      `On: when every required condition is independently proven the buyer is told, and the seller is paid unless the buyer objects within ${terms.timing.objectiveChallengeHours} hours. If the buyer objects, the money stays held.`,
                    )
                  : L(
                      "চালু নয়: এই ধরনের প্রোডাক্টে প্রতিটি শর্ত স্বাধীনভাবে ভেরিফাই করার ব্যবস্থা এখনো পরীক্ষিত নয়।",
                      "Off: for this kind of product, independently verifying every condition has not been tested yet.",
                    )}
              </dd>
              <dt>{L("ডেলিভারি না হলে", "If nothing is delivered")}</dt>
              <dd>
                {L(
                  "সময়সীমার মধ্যে কিছু না দিলে পুরো টাকা ফেরত; অন্য ক্ষেত্রে রিভিউ বা দুই পক্ষের সম্মতি।",
                  "A full refund if nothing is delivered in time; otherwise a review or an agreement between both sides.",
                )}
              </dd>
            </dl>

            <h3>
              {L(
                "যা যা দিতে ও চেক করতে হবে",
                "What must be delivered and checked",
              )}
            </h3>
            <ol>
              {terms.items.map((item) => (
                <li key={item.itemId}>
                  {item.title[locale]} ·{" "}
                  {item.mandatory
                    ? L("আবশ্যক", "required")
                    : L("ঐচ্ছিক", "optional")}{" "}
                  · {L("প্রমাণ", "proof")}:{" "}
                  {item.proofTypes.map((p) => copy.proof[p] ?? p).join(", ")}
                  {item.subjective &&
                    L(
                      " · ব্যক্তিগত মত, ভেরিফাইযোগ্য নয়",
                      " · a personal opinion, cannot be verified",
                    )}
                  {item.dataClass === "vault_secret" &&
                    L(
                      " · গোপন ভল্টে, চ্যাটে নয়",
                      " · in the secret vault, not in chat",
                    )}
                </li>
              ))}
            </ol>

            <h3>{L("যে ঝুঁকি থেকে যায়", "Risks that remain")}</h3>
            <ul>
              {terms.residualRisks.map((risk) => (
                <li key={risk.en}>{risk[locale]}</li>
              ))}
            </ul>
            <p>
              <small>
                {L("শর্তের ছাপ", "Terms fingerprint")}:{" "}
                <code>{agreement.termsHash.slice(0, 16)}</code>.{" "}
                {L(
                  "সম্মতি ঠিক এই ছাপের সাথে বাঁধা থাকে।",
                  "Agreement is tied to exactly this fingerprint.",
                )}
              </small>
            </p>
          </section>

          <section aria-labelledby="next">
            <h2 id="next">{L("পরের ধাপ", "Next step")}</h2>

            {agreement.state === "DRAFT" && (
              <form action={agreementAction}>
                {hidden("ProposeAgreement")}
                <p>
                  {L(
                    "ড্রাফট ঠিক থাকলে দুই পক্ষের সম্মতির জন্য পাঠান।",
                    "If the draft is right, send it for both sides to agree.",
                  )}
                </p>
                <button type="submit">
                  {L("সম্মতির জন্য পাঠান", "Send for agreement")}
                </button>
              </form>
            )}

            {agreement.state === "AWAITING_ACCEPTANCE" && (
              <>
                <p>
                  {L("সম্মতি দিয়েছেন", "Agreed so far")}:{" "}
                  {agreement.acceptedBy.length === 0
                    ? L("এখনো কেউ না", "nobody yet")
                    : agreement.acceptedBy.map((r) => copy.role[r]).join(", ")}
                </p>
                {agreement.acceptedBy.includes(deal.myRole) ? (
                  <p>
                    {L(
                      "আপনি সম্মতি দিয়েছেন। অন্য পক্ষের অপেক্ষা।",
                      "You have agreed. Waiting for the other side.",
                    )}
                  </p>
                ) : (
                  <form action={agreementAction}>
                    {hidden("AcceptAgreement")}
                    <input
                      type="hidden"
                      name="termsHash"
                      value={agreement.termsHash}
                    />
                    <p>
                      {L(
                        `আপনি সম্মত হচ্ছেন: ${formatBdt(terms.amountMinor)} (${terms.currency}), প্রাপক ${seller ? `সেলার ${seller.name}` : "সেলার"}, ডিলের সংস্করণ ${agreement.versionNo}. দুই পক্ষ সম্মত হলে শর্ত আর বদলানো যাবে না।`,
                        `You are agreeing to: ${formatBdt(terms.amountMinor)} (${terms.currency}), paid to ${seller ? `the seller ${seller.name}` : "the seller"}, deal version ${agreement.versionNo}. Once both sides agree, the terms can no longer be changed.`,
                      )}
                    </p>
                    <button type="submit">
                      {L(
                        "আমি ঠিক এই শর্তে সম্মত",
                        "I agree to exactly these terms",
                      )}
                    </button>
                  </form>
                )}
              </>
            )}

            {agreement.state === "ACCEPTED" && (
              <FundingSection
                dealId={deal.dealId}
                isBuyer={deal.myRole === "buyer"}
                funding={funding}
                balances={balances}
                idempotencyKey={`ui-${randomUUID()}`}
              />
            )}

            {agreement.state === "ACCEPTED" &&
              funding?.state === "CONFIRMED" &&
              counterparty &&
              (vaultItems.length === 0 ? (
                deal.myRole === "seller" && (
                  <PlainDeliveryForm
                    dealId={deal.dealId}
                    declarable={declarable}
                  />
                )
              ) : vault ? (
                <VaultPanel
                  locale={locale}
                  dealId={deal.dealId}
                  myRole={deal.myRole}
                  myMxid={matrixUserId(user.id, vault.serverName)}
                  declarable={declarable}
                  counterpartyMxid={matrixUserId(
                    counterparty.userId,
                    vault.serverName,
                  )}
                  roomId={vaultRoomId}
                  termsHash={agreement.termsHash}
                  agreementVersion={agreement.versionNo}
                  items={vaultItems}
                />
              ) : (
                <p>
                  {L(
                    "এই পরিবেশে গোপন ভল্ট চালু নেই, তাই ডেলিভারি এখন সম্ভব নয়।",
                    "The secret vault is not running in this environment, so delivery is not possible right now.",
                  )}
                </p>
              ))}

            {delivery && (
              <DeliverySection
                dealId={deal.dealId}
                myRole={deal.myRole}
                terms={terms}
                delivery={delivery}
              />
            )}

            {delivery && (
              <ProviderLab
                dealId={deal.dealId}
                terms={terms}
                facts={mockFacts}
              />
            )}

            {resolution && (
              <ResolutionSection
                dealId={deal.dealId}
                mode={terms.mode}
                balances={balances}
                dispute={resolution.dispute}
                proposal={resolution.proposal}
              />
            )}

            {!open && agreement.state !== "ACCEPTED" && (
              <p>
                {L("এই ডিল আর সক্রিয় নয়।", "This deal is no longer active.")}
              </p>
            )}

            {editable && (
              <details>
                <summary>{L("শর্ত বদলান", "Change the terms")}</summary>
                <p>
                  {L(
                    "বদলালে নতুন সংস্করণ তৈরি হয় এবং ডিল ড্রাফটে ফিরে যায়। আগের সংস্করণে দেওয়া কোনো সম্মতি নতুন সংস্করণে গণ্য হয় না।",
                    "A change creates a new version and the deal goes back to draft. Agreement given to an earlier version does not count for the new one.",
                  )}
                </p>
                <form action={agreementAction}>
                  {hidden("ReviseAgreement")}
                  <input type="hidden" name="role" value={deal.myRole} />
                  <TermsFields
                    template={template}
                    values={{
                      title: terms.title,
                      mode: terms.mode,
                      amountTaka,
                      product: terms.product,
                      milestones: (terms.milestones ?? []).map((m) => ({
                        title: m.title,
                        amountTaka: String(Number(m.amountMinor) / 100),
                      })),
                    }}
                  />
                  <button type="submit">
                    {L("নতুন সংস্করণ সংরক্ষণ করুন", "Save the new version")}
                  </button>
                </form>
              </details>
            )}

            {(open ||
              (agreement.state === "ACCEPTED" &&
                (!funding || funding.state === "CREATED"))) && (
              <details>
                <summary>{L("ডিল বাতিল করুন", "Cancel the deal")}</summary>
                <p>
                  {L(
                    "বাতিল করলে এই ডিল স্থায়ীভাবে বন্ধ হয় এবং খোলা ইনভাইট লিংক অকার্যকর হয়। এটি ফেরানো যায় না; নতুন ডিল শুরু করতে হবে।",
                    "Cancelling closes this deal for good and any open invite link stops working. It cannot be undone; you would have to start a new deal.",
                  )}
                </p>
                <form action={agreementAction}>
                  {hidden("WithdrawAgreement")}
                  <button type="submit">
                    {L("হ্যাঁ, বাতিল করুন", "Yes, cancel it")}
                  </button>
                </form>
              </details>
            )}
          </section>

          {conversation && (
            <section aria-label={L("কথোপকথন", "Conversation")}>
              <ConversationSection
                dealId={deal.dealId}
                conversation={conversation}
              />
              {assessment && (
                <AssessmentSection dealId={deal.dealId} view={assessment} />
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
