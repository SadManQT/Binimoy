import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Handshake, Plus, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { useLang } from "@/i18n";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loading, EmptyState, IdChip, Money } from "@/components/StatusBits";
import { toast } from "sonner";

export const STATUS_LABEL = {
  INVITED: ["Invited", "আমন্ত্রিত", "bg-state-unk-bg text-state-unk-tx border-state-unk-bd"],
  TERMS_ACCEPTED: ["Terms accepted", "শর্ত গৃহীত", "bg-teal-50 text-brand-tealdark border-brand-teal/40"],
  FUNDED: ["Funded", "ফান্ডেড", "bg-teal-50 text-brand-tealdark border-brand-teal/40"],
  DELIVERED: ["Delivered", "সরবরাহকৃত", "bg-teal-50 text-brand-tealdark border-brand-teal/40"],
  INSPECTING: ["Inspecting", "পরিদর্শন", "bg-state-unk-bg text-state-unk-tx border-state-unk-bd"],
  SETTLE_PROPOSED: ["Split proposed", "ভাগাভাগি প্রস্তাবিত", "bg-state-unk-bg text-state-unk-tx border-state-unk-bd"],
  DISPUTED: ["Disputed", "বিরোধপূর্ণ", "bg-state-fail-bg text-state-fail-tx border-state-fail-bd"],
  SETTLED: ["Settled", "নিষ্পন্ন", "bg-state-pass-bg text-state-pass-tx border-state-pass-bd"],
  UNRESOLVED: ["Unresolved", "অমীমাংসিত", "bg-state-fail-bg text-state-fail-tx border-state-fail-bd"],
};

export function StatusTag({ status }) {
  const { L } = useLang();
  const s = STATUS_LABEL[status] || [status, status, "bg-surface-elev border-border text-ink-soft"];
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${s[2]}`}>{L(s[0], s[1])}</span>;
}

export default function Deals() {
  const { t, L } = useLang();
  const [deals, setDeals] = useState(null);
  const [cats, setCats] = useState([]);
  const [modes, setModes] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "CAT-06", title: "", description: "", service_mode: "ai_first", my_role: "buyer", counterparty_email: "", amount: 1000, deadline_days: 7 });

  const load = useCallback(async () => {
    try { const { data } = await api.get("/deals"); setDeals(data); }
    catch (e) { toast.error(apiErr(e)); setDeals([]); }
  }, []);

  useEffect(() => {
    load();
    api.get("/categories").then(({ data }) => setCats(data)).catch(() => {});
    api.get("/service-modes").then(({ data }) => setModes(data)).catch(() => {});
  }, [load]);

  const create = async () => {
    try {
      const { data } = await api.post("/deals", { ...form, amount: Number(form.amount), deadline_days: Number(form.deadline_days) });
      toast.success(L("Deal created", "ডিল তৈরি হয়েছে"));
      setOpen(false);
      setDeals((d) => [data, ...(d || [])]);
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl tracking-tight flex items-center gap-2"><Handshake className="w-7 h-7 text-brand" />{t("myDeals")}</h1>
          <p className="text-sm text-ink-muted mt-1">{L("Escrow deals you are part of. Money is simulated (mock).", "আপনি যুক্ত আছেন এমন এসক্রো ডিল। টাকা সিমুলেটেড (মক)।")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="create-deal-btn" className="bg-brand hover:bg-brand-hover rounded-full"><Plus className="w-4 h-4 mr-1" />{t("createDeal")}</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("createDeal")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{L("Title", "শিরোনাম")}</Label><Input data-testid="deal-title-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1" placeholder={L("e.g. Steam gift card ৳5000", "যেমন স্টিম গিফট কার্ড ৳৫০০০")} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{L("Category", "বিভাগ")}</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger className="mt-1" data-testid="deal-category-select"><SelectValue /></SelectTrigger>
                    <SelectContent>{cats.map((c) => <SelectItem key={c.code} value={c.code}>{L(c.name_en, c.name_bn)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>{L("I am the", "আমি")}</Label>
                  <Select value={form.my_role} onValueChange={(v) => setForm({ ...form, my_role: v })}>
                    <SelectTrigger className="mt-1" data-testid="deal-role-select"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="buyer">{L("Buyer", "ক্রেতা")}</SelectItem><SelectItem value="seller">{L("Seller", "বিক্রেতা")}</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>{L("Counterparty email", "প্রতিপক্ষের ইমেইল")}</Label><Input data-testid="deal-counterparty-input" value={form.counterparty_email} onChange={(e) => setForm({ ...form, counterparty_email: e.target.value })} className="mt-1" placeholder="other@example.com" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{L("Amount (BDT)", "পরিমাণ (BDT)")}</Label><Input type="number" data-testid="deal-amount-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 font-mono" /></div>
                <div><Label>{L("Deadline (days)", "সময়সীমা (দিন)")}</Label><Input type="number" data-testid="deal-deadline-input" value={form.deadline_days} onChange={(e) => setForm({ ...form, deadline_days: e.target.value })} className="mt-1 font-mono" /></div>
              </div>
              <div><Label>{L("Service mode", "সার্ভিস মোড")}</Label>
                <Select value={form.service_mode} onValueChange={(v) => setForm({ ...form, service_mode: v })}>
                  <SelectTrigger className="mt-1" data-testid="deal-mode-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {modes.map((m) => (
                      <SelectItem key={m.code} value={m.code}>
                        {L(m.name_en, m.name_bn)} {m.human_available ? "· 🟢" : "· ⚪"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {modes.length > 0 && (
                  <p className="text-[11px] text-ink-muted mt-1">
                    {(() => { const m = modes.find((x) => x.code === form.service_mode); if (!m) return null;
                      return m.human_available ? L("A human reviewer is available.", "একজন মানব পর্যালোচক উপলব্ধ।") : L("No human available right now — AI-only.", "এই মুহূর্তে কোনো মানুষ নেই — শুধু এআই।"); })()}
                  </p>
                )}
              </div>
              <div><Label>{L("Description", "বিবরণ")}</Label><Textarea data-testid="deal-desc-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" /></div>
            </div>
            <DialogFooter><Button onClick={create} disabled={!form.title || !form.counterparty_email || !form.amount} data-testid="deal-create-submit" className="bg-brand hover:bg-brand-hover">{L("Create & invite", "তৈরি ও আমন্ত্রণ")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {deals === null ? <Loading /> : deals.length === 0 ? (
        <EmptyState title={L("No deals yet. Create your first escrow deal.", "এখনো কোনো ডিল নেই। আপনার প্রথম এসক্রো ডিল তৈরি করুন।")} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4" data-testid="deals-list">
          {deals.map((d) => (
            <Link key={d.deal_id} to={`/deals/${d.deal_id}`} data-testid={`deal-card-${d.deal_id}`} className="bg-surface-card rounded-2xl border border-border p-5 hover:shadow-md hover:border-brand-teal transition-all">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-heading font-bold leading-tight">{d.title}</h3>
                <StatusTag status={d.status} />
              </div>
              <div className="mt-2 flex items-center gap-2"><IdChip value={d.deal_id} /><span className="text-[11px] text-ink-muted font-mono">{d.category}</span></div>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-ink-muted">{t("held")}</div>
                  <Money amount={d.held} className="font-bold text-lg" />
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-bold text-brand-tealdark">{t("openDeal")} <ArrowRight className="w-4 h-4" /></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
