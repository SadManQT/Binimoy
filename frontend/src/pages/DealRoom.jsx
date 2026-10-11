import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Send, Pencil, Wallet, ClipboardCheck, Scale, AlertTriangle, Receipt as ReceiptIcon,
  Sparkles, Eye, Truck, CheckCheck, Lock, Undo2, Star,
} from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Loading, ErrorState, IdChip, Money, StatusBadge, AiCard } from "@/components/StatusBits";
import { EvidenceButton } from "@/components/EvidenceDrawer";
import { DeadlinePanel } from "@/components/deal/DeadlinePanel";
import { VaultPanel } from "@/components/deal/VaultPanel";
import { StatusTag } from "@/pages/Deals";
import { toast } from "sonner";

function roleOf(deal, user) {
  if (!user) return null;
  if (user.user_id === deal.buyer_id || user.email === deal.buyer_email) return "buyer";
  if (user.user_id === deal.seller_id || user.email === deal.seller_email) return "seller";
  return ["reviewer", "admin"].includes(user.role) ? "reviewer" : "observer";
}

const snapEvidence = (s) => ({ source_url: s.url, source_platform: s.host, access_status: s.auto_access_status, snapshot: s });

export default function DealRoom() {
  const { id } = useParams();
  const { t, L } = useLang();
  const { user } = useAuth();
  const [deal, setDeal] = useState(null);
  const [error, setError] = useState("");
  const [guidance, setGuidance] = useState([]);
  const [explain, setExplain] = useState(null);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const [deliverNote, setDeliverNote] = useState("");
  const [split, setSplit] = useState({ to_seller: 0, to_buyer: 0 });
  const [dispute, setDispute] = useState({ claim: "", evidence: "" });
  const [receipt, setReceipt] = useState(null);
  const [confirmRelease, setConfirmRelease] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get(`/deals/${id}`);
      setDeal(data);
      setSplit({ to_seller: data.held, to_buyer: 0 });
      const [g, e] = await Promise.all([
        api.get(`/deals/${id}/assistant/guidance`), api.get(`/deals/${id}/assistant/explain`),
      ]);
      setGuidance(g.data.steps); setExplain(e.data);
    } catch (e) { setError(apiErr(e)); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn, successMsg) => {
    try { await fn(); if (successMsg) toast.success(successMsg); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  if (error) return <div className="max-w-5xl mx-auto px-4 py-10"><ErrorState message={error} onRetry={load} /></div>;
  if (!deal) return <div className="max-w-5xl mx-auto px-4 py-10"><Loading /></div>;

  const myRole = roleOf(deal, user);
  const amIBuyer = myRole === "buyer", amISeller = myRole === "seller";
  const isParty = amIBuyer || amISeller;
  const myAccepted = amIBuyer ? deal.buyer_accepted_version : amISeller ? deal.seller_accepted_version : null;
  const myConsent = amIBuyer ? deal.monitoring_consent?.buyer : deal.monitoring_consent?.seller;
  const needAccept = isParty && myAccepted !== deal.terms_version;
  const canInspect = amIBuyer && ["DELIVERED", "INSPECTING"].includes(deal.status);
  const terminal = ["SETTLED", "UNRESOLVED"].includes(deal.status);
  const proposal = deal.settlement_proposal;
  const refundPending = proposal?.path === "NO_DELIVERY_REFUND";
  const sum = Number(split.to_seller || 0) + Number(split.to_buyer || 0);
  const cs = deal.completion_summary || {};
  const mandatoryIssues = (cs.mandatory_fail || 0) + (cs.mandatory_unknown || 0);
  const settleable = ["FUNDED", "DELIVERED", "INSPECTING"].includes(deal.status) && deal.held > 0;

  const openReceipt = async () => { try { const { data } = await api.get(`/deals/${id}/receipt`); setReceipt(data); } catch (e) { toast.error(apiErr(e)); } };
  const release = () => act(() => api.post(`/deals/${id}/settle`, { path: "ACCEPTED_RELEASE" }), L("Released to seller", "বিক্রেতাকে ছাড়া হয়েছে"));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to="/deals" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand mb-3"><ArrowLeft className="w-4 h-4" />{t("myDeals")}</Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl tracking-tight">{deal.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <IdChip value={deal.deal_id} />
            <span className="text-[11px] font-mono text-ink-muted">{deal.category}</span>
            <StatusTag status={deal.status} />
            {isParty && <span className="text-[11px] font-bold uppercase bg-brand/10 text-brand px-2 py-0.5 rounded-full">{L("you are the", "আপনি")} {myRole}</span>}
          </div>
        </div>
        <Dialog onOpenChange={(o) => o && openReceipt()}>
          <DialogTrigger asChild><Button variant="outline" data-testid="receipt-btn" className="rounded-full"><ReceiptIcon className="w-4 h-4 mr-1" />{t("receipt")}</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{L("Receipt & replay", "রসিদ ও রিপ্লে")}</DialogTitle></DialogHeader>
            {!receipt ? <Loading /> : (
              <div className="space-y-3 text-sm font-mono" data-testid="receipt-body">
                <div className="flex justify-between"><span>Deal</span><span>{receipt.deal_id}</span></div>
                <div className="flex justify-between"><span>Terms v</span><span>{receipt.terms_version}</span></div>
                <div className="flex justify-between"><span>Amount</span><Money amount={receipt.terms.amount} /></div>
                <div className="flex justify-between"><span>Held</span><Money amount={receipt.held} /></div>
                {receipt.deadlines?.delivery_due && <div className="flex justify-between text-xs"><span>Delivery due</span><span>{receipt.deadlines.delivery_due.slice(0, 16).replace("T", " ")}</span></div>}
                {receipt.deadlines?.inspection_due && <div className="flex justify-between text-xs"><span>Inspection due</span><span>{receipt.deadlines.inspection_due.slice(0, 16).replace("T", " ")}</span></div>}
                <div className="h-px bg-border" />
                <div className="font-sans font-semibold">{L("Ledger", "লেজার")}</div>
                {receipt.ledger.map((e, i) => (
                  <div key={i} className="flex justify-between"><span>{e.type} {e.from}→{e.to}</span><Money amount={e.amount} /></div>
                ))}
                {receipt.settlement && <div className="pt-2 font-sans text-xs text-ink-soft">{receipt.settlement.path}: seller ৳{receipt.settlement.to_seller} / buyer ৳{receipt.settlement.to_buyer}</div>}
                {receipt.vault?.items?.length > 0 && <div className="font-sans text-xs text-ink-soft">{L("Vault items", "ভল্ট আইটেম")}: {receipt.vault.items.length} · {L("openings", "খোলা")}: {receipt.vault.items.reduce((a, i) => a + i.reveal_count, 0)}</div>}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2 text-sm bg-brand text-white rounded-xl px-4 py-2.5 mb-5" data-testid="monitoring-notice">
        <Eye className="w-4 h-4 shrink-0" />
        <span>{L("This room is AI-monitored for contractual fulfillment.", "এই রুমটি চুক্তি পূরণের জন্য এআই-পর্যবেক্ষিত।")} {deal.service_mode === "ai_only" ? L("AI-only mode.", "শুধু এআই মোড।") : L("Human fallback available.", "মানব সহায়তা উপলব্ধ।")}</span>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* LEFT */}
        <div className="lg:col-span-3 space-y-5">
          <section className="bg-surface-card rounded-2xl border border-border p-5" data-testid="terms-panel">
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-bold flex items-center gap-2"><Lock className="w-4 h-4 text-brand" />{L("Agreed terms (immutable)", "সম্মত শর্ত (অপরিবর্তনীয়)")}</h2>
              <span className="text-[11px] font-mono text-ink-muted">v{deal.terms_version}</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm"><span>{L("Amount", "পরিমাণ")}</span><Money amount={deal.terms.amount} className="font-bold" /></div>
            <div className="flex items-center justify-between text-sm mt-1"><span>{L("Delivery window", "সরবরাহ সময়")}</span><span className="font-mono">{deal.terms.deadline_days} {L("days", "দিন")}</span></div>
            <div className="flex items-center justify-between text-sm mt-1"><span>{L("Inspection window", "পরিদর্শন সময়")}</span><span className="font-mono">{deal.terms.inspection_days ?? 3} {L("days", "দিন")}</span></div>
            <ul className="mt-3 space-y-1.5">
              {deal.terms.items.map((it, i) => (
                <li key={i} className="text-sm flex items-start gap-2"><CheckCheck className="w-4 h-4 text-brand-teal mt-0.5 shrink-0" />{it}</li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
              <span className={`px-2 py-1 rounded-full border ${deal.buyer_accepted_version === deal.terms_version ? "bg-state-pass-bg border-state-pass-bd text-state-pass-tx" : "bg-surface-elev border-border text-ink-muted"}`}>{L("Buyer", "ক্রেতা")}: {deal.buyer_accepted_version === deal.terms_version ? "✓" : "…"}</span>
              <span className={`px-2 py-1 rounded-full border ${deal.seller_accepted_version === deal.terms_version ? "bg-state-pass-bg border-state-pass-bd text-state-pass-tx" : "bg-surface-elev border-border text-ink-muted"}`}>{L("Seller", "বিক্রেতা")}: {deal.seller_accepted_version === deal.terms_version ? "✓" : "…"}</span>
            </div>
            {needAccept && (
              <Button onClick={() => act(() => api.post(`/deals/${id}/accept-terms`), L("Terms accepted", "শর্ত গৃহীত"))} data-testid="accept-terms-btn" className="mt-3 bg-brand hover:bg-brand-hover w-full">{L("Accept these exact terms", "এই শর্ত হুবহু গ্রহণ করুন")}</Button>
            )}
          </section>

          {isParty && !myConsent && (
            <section className="bg-state-unk-bg border border-state-unk-bd rounded-2xl p-4" data-testid="consent-panel">
              <p className="text-sm text-state-unk-tx">{L("Give consent for the AI to read this room. Required before the assistant can process messages.", "এআই-কে এই রুম পড়ার সম্মতি দিন। সহকারী বার্তা প্রক্রিয়া করার আগে প্রয়োজন।")}</p>
              <Button onClick={() => act(() => api.post(`/deals/${id}/consent-monitoring`), L("Consent recorded", "সম্মতি লিপিবদ্ধ"))} data-testid="consent-btn" size="sm" className="mt-2 bg-brand hover:bg-brand-hover">{L("I consent to monitoring", "আমি পর্যবেক্ষণে সম্মতি দিই")}</Button>
            </section>
          )}

          <DeadlinePanel deal={deal} myRole={myRole} onChanged={load} />

          <section className="bg-surface-card rounded-2xl border border-border p-5" data-testid="deal-room">
            <h2 className="font-heading font-bold mb-3">{L("Deal room", "ডিল রুম")}</h2>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1" data-testid="messages-list">
              {(deal.messages || []).length === 0 && <p className="text-sm text-ink-muted">{L("No messages yet.", "এখনো কোনো বার্তা নেই।")}</p>}
              {(deal.messages || []).map((m) => (
                <div key={m.msg_id} className="text-sm" data-testid={`message-${m.msg_id}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{m.sender_name}</span>
                    {m.versions?.length > 1 && <span className="text-[10px] text-ink-muted font-mono">{L("edited", "সম্পাদিত")} · {m.versions.length} {L("versions", "সংস্করণ")}</span>}
                    {m.sender_id === user?.user_id && !terminal && (
                      <button onClick={() => { setEditing(m.msg_id); setEditText(m.current_text); }} data-testid={`edit-msg-${m.msg_id}`} className="text-ink-muted hover:text-brand"><Pencil className="w-3 h-3" /></button>
                    )}
                  </div>
                  {editing === m.msg_id ? (
                    <div className="mt-1 flex gap-2">
                      <Input value={editText} onChange={(e) => setEditText(e.target.value)} data-testid={`edit-input-${m.msg_id}`} />
                      <Button size="sm" onClick={() => act(async () => { await api.put(`/deals/${id}/messages/${m.msg_id}`, { text: editText }); setEditing(null); })} className="bg-brand hover:bg-brand-hover">{L("Save", "সংরক্ষণ")}</Button>
                    </div>
                  ) : <p className="text-ink-soft">{m.current_text}</p>}
                </div>
              ))}
            </div>
            {isParty && !terminal && (
              <div className="mt-3 flex gap-2">
                <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={L("Message (AI-monitored)…", "বার্তা (এআই-পর্যবেক্ষিত)…")} data-testid="message-input" onKeyDown={(e) => { if (e.key === "Enter" && msg) act(async () => { await api.post(`/deals/${id}/messages`, { text: msg }); setMsg(""); }); }} />
                <Button onClick={() => act(async () => { await api.post(`/deals/${id}/messages`, { text: msg }); setMsg(""); })} disabled={!msg} data-testid="send-message-btn" className="bg-brand hover:bg-brand-hover"><Send className="w-4 h-4" /></Button>
              </div>
            )}
          </section>

          <section data-testid="assistant-panel">
            <h2 className="font-heading font-bold mb-2 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-brand-teal" />{L("Assistant guidance", "সহকারীর নির্দেশনা")}</h2>
            <div className="space-y-2">
              {guidance.map((g, i) => (
                <AiCard key={i}>
                  <div className="font-semibold text-sm">{L(g.title_en, g.title_bn)}</div>
                  <p className="text-sm text-ink-soft mt-0.5">{L(g.body_en, g.body_bn)}</p>
                </AiCard>
              ))}
              {explain && (
                <AiCard>
                  <div className="font-semibold text-sm">{L("Outcome explanation", "ফলাফলের ব্যাখ্যা")}</div>
                  <p className="text-sm text-ink-soft mt-0.5">{L(explain.explanation_en, explain.explanation_bn)}</p>
                </AiCard>
              )}
            </div>
          </section>
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-2 space-y-5">
          <section className="bg-surface-card rounded-2xl border border-border p-5" data-testid="ledger-panel">
            <h2 className="font-heading font-bold flex items-center gap-2 mb-3"><Wallet className="w-4 h-4 text-brand" />{L("Integer ledger (BDT)", "ইন্টিজার লেজার (BDT)")}</h2>
            <div className="bg-brand text-white rounded-xl p-4 text-center">
              <div className="text-[11px] opacity-80">{t("held")}</div>
              <Money amount={deal.held} className="text-2xl font-bold" />
            </div>
            <div className="mt-3 space-y-1.5">
              {(deal.ledger || []).length === 0 && <p className="text-sm text-ink-muted">{L("No entries yet.", "এখনো কোনো এন্ট্রি নেই।")}</p>}
              {(deal.ledger || []).map((e, i) => (
                <div key={i} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-ink-soft">{e.type} · {e.from}→{e.to}</span><Money amount={e.amount} />
                </div>
              ))}
            </div>
          </section>

          {deal.delivery && (
            <section className="bg-surface-card rounded-2xl border border-border p-5" data-testid="delivery-panel">
              <h2 className="font-heading font-bold flex items-center gap-2 mb-2"><Truck className="w-4 h-4 text-brand" />{L("Delivery", "সরবরাহ")}
                {deal.delivery.late && <span className="text-[10px] font-bold uppercase bg-state-unk-bg border border-state-unk-bd text-state-unk-tx px-2 py-0.5 rounded-full">{L("late", "বিলম্বিত")}</span>}
              </h2>
              <p className="text-sm text-ink-soft">{deal.delivery.note}</p>
              <p className="text-[10px] font-mono text-ink-muted mt-1">{deal.delivery.at?.slice(0, 16).replace("T", " ")} UTC</p>
              {deal.delivery.snapshots?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="delivery-evidence">
                  {deal.delivery.snapshots.map((s, i) => <EvidenceButton key={i} evidence={snapEvidence(s)} label={s.host || "source"} testid={`delivery-evidence-${i}`} />)}
                </div>
              )}
            </section>
          )}

          <section className="bg-surface-card rounded-2xl border border-border p-5" data-testid="completion-map">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-heading font-bold flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-brand" />{L("Completion map", "সম্পন্ন-ম্যাপ")}</h2>
              <span className="text-[11px] font-mono text-ink-muted">{cs.cosmetic_percent}%</span>
            </div>
            <p className="text-[11px] text-ink-muted mb-1">{L(cs.note_en, cs.note_bn)}</p>
            <p className="text-[11px] font-mono text-ink-soft mb-3" data-testid="mandatory-summary">{L("Mandatory", "আবশ্যক")}: {cs.mandatory_total - mandatoryIssues}/{cs.mandatory_total} PASS · {cs.mandatory_fail} FAIL · {cs.mandatory_unknown} UNKNOWN</p>
            <div className="space-y-2">
              {deal.completion_items.map((it) => (
                <div key={it.id} className="border border-border rounded-lg p-2.5" data-testid={`completion-item-${it.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm flex items-start gap-1">{it.mandatory !== false && <Star className="w-3 h-3 text-brand mt-1 shrink-0" title={L("Mandatory", "আবশ্যক")} />}{L(it.label_en, it.label_bn)}</span>
                    <StatusBadge status={it.status} />
                  </div>
                  {canInspect && (
                    <div className="mt-2 flex gap-1">
                      {["PASS", "FAIL", "UNKNOWN"].map((st) => (
                        <button key={st} onClick={() => act(() => api.post(`/deals/${id}/inspect`, { item_id: it.id, status: st }))} data-testid={`inspect-${it.id}-${st}`}
                          className={`text-[10px] font-bold font-mono px-2 py-1 rounded border ${it.status === st ? "bg-brand text-white border-brand" : "bg-white border-border text-ink-soft hover:border-brand"}`}>{st}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {!terminal && isParty && (
            <section className="bg-surface-card rounded-2xl border border-border p-5 space-y-3" data-testid="actions-panel">
              <h2 className="font-heading font-bold flex items-center gap-2"><Scale className="w-4 h-4 text-brand" />{L("Actions", "পদক্ষেপ")}</h2>

              {amIBuyer && deal.status === "TERMS_ACCEPTED" && (
                <Button onClick={() => act(() => api.post(`/deals/${id}/fund`), L("Funded (mock)", "ফান্ডেড (মক)"))} data-testid="fund-btn" className="w-full bg-brand hover:bg-brand-hover"><Wallet className="w-4 h-4 mr-1" />{L("Fund the hold (simulated)", "হোল্ডে ফান্ড দিন (সিমুলেটেড)")}</Button>
              )}

              {amISeller && deal.status === "FUNDED" && (
                <div className="space-y-2">
                  <Textarea value={deliverNote} onChange={(e) => setDeliverNote(e.target.value)} placeholder={L("Delivery note / evidence links… (URLs are snapshotted)", "সরবরাহ নোট / প্রমাণ লিংক… (ইউআরএল স্ন্যাপশট হয়)")} data-testid="deliver-note" />
                  <Button onClick={() => act(async () => { await api.post(`/deals/${id}/deliver`, { text: deliverNote }); setDeliverNote(""); }, L("Delivered", "সরবরাহকৃত"))} disabled={!deliverNote} data-testid="deliver-btn" className="w-full bg-brand hover:bg-brand-hover"><Truck className="w-4 h-4 mr-1" />{L("Mark delivered", "সরবরাহ চিহ্নিত")}</Button>
                </div>
              )}

              {/* no-delivery refund (4th authorization path) */}
              {amIBuyer && deal.can_request_refund && !refundPending && (
                <Button onClick={() => act(() => api.post(`/deals/${id}/settle`, { path: "NO_DELIVERY_REFUND" }), L("Refund requested", "রিফান্ড অনুরোধ পাঠানো হয়েছে"))} data-testid="refund-request-btn" variant="outline" className="w-full border-state-fail-bd text-state-fail-tx"><Undo2 className="w-4 h-4 mr-1" />{L("Request no-delivery refund", "নো-ডেলিভারি রিফান্ড চান")}</Button>
              )}
              {refundPending && amIBuyer && <p className="text-xs text-ink-muted" data-testid="refund-waiting">{L("Refund requested — waiting for the seller to confirm, or send to a reviewer below.", "রিফান্ড চাওয়া হয়েছে — বিক্রেতার নিশ্চিতকরণের অপেক্ষায়, বা নিচে পর্যালোচকের কাছে পাঠান।")}</p>}
              {refundPending && amISeller && (
                <Button onClick={() => act(() => api.post(`/deals/${id}/settle`, { path: "NO_DELIVERY_REFUND" }), L("Refund confirmed", "রিফান্ড নিশ্চিত"))} data-testid="refund-confirm-btn" className="w-full bg-state-fail-bd hover:opacity-90 text-white"><Undo2 className="w-4 h-4 mr-1" />{L("Confirm: nothing delivered — refund ৳", "নিশ্চিত: কিছু সরবরাহ হয়নি — ফেরত ৳")}{deal.held}</Button>
              )}

              {amIBuyer && settleable && (
                <>
                  <Button onClick={() => (mandatoryIssues > 0 ? setConfirmRelease(true) : release())} data-testid="release-btn" className="w-full bg-state-pass-bd hover:opacity-90 text-white">{t("release")}</Button>
                  <AlertDialog open={confirmRelease} onOpenChange={setConfirmRelease}>
                    <AlertDialogContent data-testid="release-confirm-dialog">
                      <AlertDialogHeader>
                        <AlertDialogTitle>{L("Release with unresolved mandatory checks?", "অসমাধিত আবশ্যক চেক সহ ছাড়বেন?")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {cs.mandatory_fail} {L("mandatory item(s) FAIL and", "আবশ্যক আইটেম FAIL এবং")} {cs.mandatory_unknown} {L("UNKNOWN. Releasing is your own consent — the percentage never decides. Money moves to the seller and cannot be recalled.", "UNKNOWN। ছাড়া আপনার নিজস্ব সম্মতি — শতাংশ কখনো সিদ্ধান্ত নেয় না। টাকা বিক্রেতার কাছে যাবে এবং ফেরত আসবে না।")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="release-cancel">{L("Keep inspecting", "পরিদর্শন চালিয়ে যান")}</AlertDialogCancel>
                        <AlertDialogAction onClick={release} data-testid="release-confirm" className="bg-state-pass-bd hover:opacity-90">{L("Release anyway", "তবুও ছাড়ুন")}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}

              {["FUNDED", "DELIVERED", "INSPECTING", "SETTLE_PROPOSED"].includes(deal.status) && deal.held > 0 && (
                <div className="border border-dashed border-border rounded-lg p-3">
                  <div className="text-xs font-semibold mb-2">{t("split")}</div>
                  {proposal && !refundPending && (
                    <p className="text-[11px] text-ink-muted mb-2">{L("Proposed by", "প্রস্তাব করেছেন")} {proposal.by_role}: seller ৳{proposal.to_seller} / buyer ৳{proposal.to_buyer}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" value={split.to_seller} onChange={(e) => setSplit({ ...split, to_seller: e.target.value })} placeholder="seller" data-testid="split-seller" className="font-mono" />
                    <Input type="number" value={split.to_buyer} onChange={(e) => setSplit({ ...split, to_buyer: e.target.value })} placeholder="buyer" data-testid="split-buyer" className="font-mono" />
                  </div>
                  <p className={`text-[11px] mt-1 font-mono ${sum === deal.held ? "text-state-pass-tx" : "text-state-fail-tx"}`}>Σ ৳{sum} / ৳{deal.held}</p>
                  <Button onClick={() => act(() => api.post(`/deals/${id}/settle`, { path: "MUTUAL_RESOLUTION", to_seller: Number(split.to_seller), to_buyer: Number(split.to_buyer) }))} disabled={sum !== deal.held} data-testid="propose-split-btn" size="sm" className="w-full mt-2 bg-brand hover:bg-brand-hover">{proposal && !refundPending ? L("Approve / update split", "অনুমোদন / হালনাগাদ") : L("Propose split", "ভাগাভাগি প্রস্তাব")}</Button>
                </div>
              )}

              {["FUNDED", "DELIVERED", "INSPECTING", "SETTLE_PROPOSED", "REFUND_REQUESTED"].includes(deal.status) && (
                <Dialog>
                  <DialogTrigger asChild><Button variant="outline" data-testid="dispute-btn" className="w-full text-state-fail-tx border-state-fail-bd"><AlertTriangle className="w-4 h-4 mr-1" />{t("dispute")}</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{t("dispute")}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <Textarea value={dispute.claim} onChange={(e) => setDispute({ ...dispute, claim: e.target.value })} placeholder={L("Your claim…", "আপনার দাবি…")} data-testid="dispute-claim" />
                      <Textarea value={dispute.evidence} onChange={(e) => setDispute({ ...dispute, evidence: e.target.value })} placeholder={L("Evidence (links are snapshotted, notes)…", "প্রমাণ (লিংক স্ন্যাপশট হয়, নোট)…")} data-testid="dispute-evidence" />
                    </div>
                    <DialogFooter><Button onClick={() => act(() => api.post(`/deals/${id}/dispute`, dispute), L("Dispute opened", "বিরোধ খোলা হয়েছে"))} disabled={!dispute.claim} data-testid="dispute-submit" className="bg-brand hover:bg-brand-hover">{L("Send to reviewer", "পর্যালোচকের কাছে পাঠান")}</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </section>
          )}

          {deal.status === "DISPUTED" && (
            <section className="bg-state-fail-bg border border-state-fail-bd rounded-2xl p-4" data-testid="dispute-status">
              <p className="text-sm text-state-fail-tx font-semibold">{L("Under human review.", "মানব পর্যালোচনাধীন।")}</p>
              <p className="text-xs text-state-fail-tx mt-1">{deal.dispute?.claim}</p>
              {deal.dispute?.evidence && <p className="text-xs text-state-fail-tx/80 mt-1">{deal.dispute.evidence}</p>}
              {deal.dispute?.snapshots?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="dispute-evidence-chips">
                  {deal.dispute.snapshots.map((s, i) => <EvidenceButton key={i} evidence={snapEvidence(s)} label={s.host || "source"} testid={`dispute-evidence-${i}`} />)}
                </div>
              )}
            </section>
          )}

          {terminal && (
            <section className="bg-surface-elev border border-border rounded-2xl p-4 text-center" data-testid="terminal-status">
              <StatusTag status={deal.status} />
              {deal.settlement && <p className="text-sm mt-2 font-mono">{deal.settlement.path} · seller ৳{deal.settlement.to_seller} · buyer ৳{deal.settlement.to_buyer}</p>}
              {deal.settlement?.reasons && <p className="text-xs text-ink-muted mt-1">{deal.settlement.reasons}</p>}
            </section>
          )}

          {(isParty || myRole === "reviewer") && user && (
            <VaultPanel deal={deal} user={user} myRole={myRole} onChanged={load} />
          )}
        </div>
      </div>
    </div>
  );
}
