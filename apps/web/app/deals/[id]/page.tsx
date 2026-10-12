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
import {
  ERROR_TEXT,
  MODE_TEXT,
  PROOF_TEXT,
  ROLE_TEXT,
  STATE_TEXT,
} from "../../../lib/copy";
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
    .map((item) => ({ itemId: item.itemId, title: item.title.bn }));
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
      title: item.title.bn,
      mandatory: item.mandatory,
    }));

  const current = delivery?.package ?? null;
  const settled =
    delivery?.settlement && delivery.settlement.state !== "INVALIDATED"
      ? delivery.settlement
      : null;
  const step = nextStep({
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
  });

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
        <a href="/deals">← আমার ডিল</a>
      </p>
      <h1>{deal.title}</h1>
      <p>
        <a href={`/deals/${deal.dealId}/receipt`}>রসিদ ও পূর্ণ রেকর্ড</a>
      </p>
      {error && <p role="alert">{ERROR_TEXT[error] ?? error}</p>}
      <dl>
        <dt>অবস্থা</dt>
        <dd>{STATE_TEXT[agreement.state] ?? agreement.state}</dd>
        <dt>আপনার ভূমিকা</dt>
        <dd>{ROLE_TEXT[deal.myRole]}</dd>
        <dt>পক্ষ</dt>
        <dd>
          {deal.parties
            .map((p) => `${ROLE_TEXT[p.role]}: ${p.name}`)
            .join(" · ")}
          {deal.parties.length === 1 && " · অন্য পক্ষ এখনো যোগ দেননি"}
        </dd>
      </dl>

      <div className="deal">
        <aside className="next-step" aria-labelledby="next-step-title">
          <h2 id="next-step-title">এখন যা করার</h2>
          <p data-testid="next-step">{step.text}</p>
          <ol className="steps">
            {step.steps.map((item) => (
              <li key={item.key} data-step={item.state}>
                {item.label}
                {item.state === "done" && (
                  <span className="sr-only"> (সম্পন্ন)</span>
                )}
              </li>
            ))}
          </ol>
        </aside>
        <div className="deal-main">
          {deal.parties.length === 1 && open && (
            <section aria-labelledby="invite">
              <h2 id="invite">অন্য পক্ষকে ইনভাইট</h2>
              {invite ? (
                <p>
                  এই লিংকটি শুধু অন্য পক্ষকে পাঠান। এটি ৭২ ঘণ্টা চলবে, একবারই ব্যবহার করা
                  যাবে, এবং আর দেখানো হবে না:
                  <br />
                  <code style={{ wordBreak: "break-all" }}>
                    {loadConfig(process.env).APP_URL}/invite/{invite}
                  </code>
                </p>
              ) : (
                <form action={createInviteAction}>
                  <input type="hidden" name="dealId" value={deal.dealId} />
                  <button type="submit">ইনভাইট লিংক তৈরি করুন</button>
                  <p>নতুন লিংক তৈরি করলে আগের লিংক বাতিল হয়ে যায়।</p>
                </form>
              )}
            </section>
          )}

          <section aria-labelledby="terms">
            <h2 id="terms">ডিলের শর্ত (সংস্করণ {agreement.versionNo})</h2>
            <dl>
              <dt>প্রোডাক্টের ধরন</dt>
              <dd>{template.name.bn}</dd>
              <dt>মূল্য</dt>
              <dd>
                {formatBdt(terms.amountMinor)} ({terms.currency}) · ফি{" "}
                {formatBdt(terms.feeMinor)} · টেস্ট, কোনো আসল টাকা নয়
              </dd>
              <dt>সেবার ধরন</dt>
              <dd>
                {MODE_TEXT[terms.mode]?.name ?? terms.mode}
                <br />
                <small>{MODE_TEXT[terms.mode]?.note}</small>
              </dd>
              {template.fields.map((field) => (
                <div key={field.key}>
                  <dt>{field.label.bn}</dt>
                  <dd>{terms.product[field.key] || "দেওয়া হয়নি"}</dd>
                </div>
              ))}
              {milestones.map((milestone) => (
                <div key={milestone.no}>
                  <dt>মাইলস্টোন {milestone.no}</dt>
                  <dd>
                    {milestone.title} · {formatBdt(milestone.amountMinor)}
                  </dd>
                </div>
              ))}
              <dt>সময়সীমা</dt>
              <dd>
                ডেলিভারি: টাকা জমার পর {terms.timing.deliveryHours} ঘণ্টা · চেক:
                ডেলিভারির পর {terms.timing.inspectionHours} ঘণ্টা · সংশোধনের সুযোগ:{" "}
                {terms.timing.correctionAttempts} বার · আপিল:{" "}
                {terms.timing.appealHours} ঘণ্টা
              </dd>
              <dt>বায়ারের চূড়ান্ত সম্মতি ছাড়া স্বয়ংক্রিয় ছাড়</dt>
              <dd>
                {terms.objectiveRelease
                  ? `চালু: প্রতিটি আবশ্যক শর্ত স্বাধীনভাবে প্রমাণিত হলে বায়ারকে জানানো হয়, এবং ${terms.timing.objectiveChallengeHours} ঘণ্টার মধ্যে বায়ার আপত্তি না করলে সেলারকে পেমেন্ট হয়। আপত্তি করলে টাকা আটকে থাকে।`
                  : "চালু নয়: এই ধরনের প্রোডাক্টে প্রতিটি শর্ত স্বাধীনভাবে ভেরিফাই করার ব্যবস্থা এখনো পরীক্ষিত নয়।"}
              </dd>
              <dt>ডেলিভারি না হলে</dt>
              <dd>
                সময়সীমার মধ্যে কিছু না দিলে পুরো টাকা ফেরত; অন্য ক্ষেত্রে রিভিউ বা দুই পক্ষের
                সম্মতি।
              </dd>
            </dl>

            <h3>যা যা দিতে ও চেক করতে হবে</h3>
            <ol>
              {terms.items.map((item) => (
                <li key={item.itemId}>
                  {item.title.bn} · {item.mandatory ? "আবশ্যক" : "ঐচ্ছিক"} · প্রমাণ:{" "}
                  {item.proofTypes.map((p) => PROOF_TEXT[p] ?? p).join(", ")}
                  {item.subjective && " · ব্যক্তিগত মত, ভেরিফাইযোগ্য নয়"}
                  {item.dataClass === "vault_secret" && " · গোপন ভল্টে, চ্যাটে নয়"}
                </li>
              ))}
            </ol>

            <h3>যে ঝুঁকি থেকে যায়</h3>
            <ul>
              {terms.residualRisks.map((risk) => (
                <li key={risk.en}>{risk.bn}</li>
              ))}
            </ul>
            <p>
              <small>
                শর্তের ছাপ: <code>{agreement.termsHash.slice(0, 16)}</code>. সম্মতি
                ঠিক এই ছাপের সাথে বাঁধা থাকে।
              </small>
            </p>
          </section>

          <section aria-labelledby="next">
            <h2 id="next">পরের ধাপ</h2>

            {agreement.state === "DRAFT" && (
              <form action={agreementAction}>
                {hidden("ProposeAgreement")}
                <p>ড্রাফট ঠিক থাকলে দুই পক্ষের সম্মতির জন্য পাঠান।</p>
                <button type="submit">সম্মতির জন্য পাঠান</button>
              </form>
            )}

            {agreement.state === "AWAITING_ACCEPTANCE" && (
              <>
                <p>
                  সম্মতি দিয়েছেন:{" "}
                  {agreement.acceptedBy.length === 0
                    ? "এখনো কেউ না"
                    : agreement.acceptedBy.map((r) => ROLE_TEXT[r]).join(", ")}
                </p>
                {agreement.acceptedBy.includes(deal.myRole) ? (
                  <p>আপনি সম্মতি দিয়েছেন। অন্য পক্ষের অপেক্ষা।</p>
                ) : (
                  <form action={agreementAction}>
                    {hidden("AcceptAgreement")}
                    <input
                      type="hidden"
                      name="termsHash"
                      value={agreement.termsHash}
                    />
                    <p>
                      আপনি সম্মত হচ্ছেন: {formatBdt(terms.amountMinor)} (
                      {terms.currency}), প্রাপক{" "}
                      {seller ? `সেলার ${seller.name}` : "সেলার"}, ডিলের সংস্করণ{" "}
                      {agreement.versionNo}. দুই পক্ষ সম্মত হলে শর্ত আর বদলানো যাবে না।
                    </p>
                    <button type="submit">আমি ঠিক এই শর্তে সম্মত</button>
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
                <p>এই পরিবেশে গোপন ভল্ট চালু নেই, তাই ডেলিভারি এখন সম্ভব নয়।</p>
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
              <p>এই ডিল আর সক্রিয় নয়।</p>
            )}

            {editable && (
              <details>
                <summary>শর্ত বদলান</summary>
                <p>
                  বদলালে নতুন সংস্করণ তৈরি হয় এবং ডিল ড্রাফটয় ফিরে যায়। আগের সংস্করণে
                  দেওয়া কোনো সম্মতি নতুন সংস্করণে গণ্য হয় না।
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
                  <button type="submit">নতুন সংস্করণ সংরক্ষণ করুন</button>
                </form>
              </details>
            )}

            {(open ||
              (agreement.state === "ACCEPTED" &&
                (!funding || funding.state === "CREATED"))) && (
              <details>
                <summary>ডিল বাতিল করুন</summary>
                <p>
                  বাতিল করলে এই ডিল স্থায়ীভাবে বন্ধ হয় এবং খোলা ইনভাইট লিংক অকার্যকর হয়।
                  এটি ফেরানো যায় না; নতুন ডিল শুরু করতে হবে।
                </p>
                <form action={agreementAction}>
                  {hidden("WithdrawAgreement")}
                  <button type="submit">হ্যাঁ, বাতিল করুন</button>
                </form>
              </details>
            )}
          </section>

          {conversation && (
            <section aria-label="কথোপকথন">
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
