import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Gavel, ScrollText, Scale } from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loading, EmptyState, IdChip, Money, PermissionDenied } from "@/components/StatusBits";
import { toast } from "sonner";

export default function Moderation() {
  const { t, L } = useLang();
  const { user } = useAuth();
  const [reports, setReports] = useState(null);
  const [disputes, setDisputes] = useState(null);
  const [notes, setNotes] = useState({});
  const [alloc, setAlloc] = useState({});

  const isReviewer = user && (user.role === "reviewer" || user.role === "admin");

  const load = useCallback(async () => {
    try {
      const [rq, dq] = await Promise.all([api.get("/moderation/queue"), api.get("/disputes/queue")]);
      setReports(rq.data); setDisputes(dq.data);
    } catch (e) { toast.error(apiErr(e)); setReports([]); setDisputes([]); }
  }, []);

  useEffect(() => { if (isReviewer) load(); }, [isReviewer, load]);

  if (!isReviewer) return <div className="max-w-3xl mx-auto px-4 py-10"><PermissionDenied requiredRole="reviewer / admin" /></div>;

  const moderate = async (id, action) => {
    try { await api.post(`/reports/${id}/moderate`, { action, note: notes[id] || "" }); toast.success(action); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const review = async (deal, unresolved) => {
    const a = alloc[deal.deal_id] || { to_seller: 0, to_buyer: 0, reasons: "" };
    try {
      await api.post(`/deals/${deal.deal_id}/review`, {
        to_seller: Number(a.to_seller || 0), to_buyer: Number(a.to_buyer || 0), reasons: a.reasons || "", unresolved,
      });
      toast.success(unresolved ? L("Marked unresolved", "অমীমাংসিত চিহ্নিত") : L("Resolved", "সমাধান"));
      load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-heading font-extrabold text-2xl sm:text-3xl tracking-tight flex items-center gap-2 mb-5"><Gavel className="w-7 h-7 text-brand" />{t("moderation")}</h1>

      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports" data-testid="tab-mod-reports"><ScrollText className="w-4 h-4 mr-1" />{L("Reports", "রিপোর্ট")} {reports ? `(${reports.length})` : ""}</TabsTrigger>
          <TabsTrigger value="disputes" data-testid="tab-mod-disputes"><Scale className="w-4 h-4 mr-1" />{L("Disputes", "বিরোধ")} {disputes ? `(${disputes.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-4">
          {reports === null ? <Loading /> : reports.length === 0 ? <EmptyState title={L("No reports awaiting moderation.", "মডারেশনের অপেক্ষায় কোনো রিপোর্ট নেই।")} /> : (
            <div className="space-y-3" data-testid="moderation-report-queue">
              {reports.map((r) => (
                <div key={r.report_id} className="bg-surface-card rounded-xl border border-border p-4" data-testid={`mod-report-${r.report_id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-elev border border-border">{t(r.kind)}</span>
                    <IdChip value={r.report_id} />
                  </div>
                  <h3 className="font-bold mt-2">{r.title}</h3>
                  <p className="text-sm text-ink-soft mt-1">{r.summary}</p>
                  <p className="text-[11px] text-ink-muted mt-1 font-mono">{r.source_platform} · {r.access_status}</p>
                  <Input value={notes[r.report_id] || ""} onChange={(e) => setNotes({ ...notes, [r.report_id]: e.target.value })} placeholder={L("Moderation note (optional)", "মডারেশন নোট (ঐচ্ছিক)")} className="mt-3" data-testid={`mod-note-${r.report_id}`} />
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button size="sm" onClick={() => moderate(r.report_id, "publish")} data-testid={`mod-publish-${r.report_id}`} className="bg-state-pass-bd hover:opacity-90">{L("Publish", "প্রকাশ")}</Button>
                    <Button size="sm" variant="outline" onClick={() => moderate(r.report_id, "needs_info")} data-testid={`mod-needinfo-${r.report_id}`}>{L("Needs info", "তথ্য প্রয়োজন")}</Button>
                    <Button size="sm" variant="outline" onClick={() => moderate(r.report_id, "reject")} data-testid={`mod-reject-${r.report_id}`} className="text-state-fail-tx border-state-fail-bd">{L("Reject", "প্রত্যাখ্যান")}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="disputes" className="mt-4">
          {disputes === null ? <Loading /> : disputes.length === 0 ? <EmptyState title={L("No open disputes.", "কোনো খোলা বিরোধ নেই।")} /> : (
            <div className="space-y-3" data-testid="moderation-dispute-queue">
              {disputes.map((d) => {
                const a = alloc[d.deal_id] || { to_seller: d.held, to_buyer: 0, reasons: "" };
                const sum = Number(a.to_seller || 0) + Number(a.to_buyer || 0);
                return (
                  <div key={d.deal_id} className="bg-surface-card rounded-xl border border-border p-4" data-testid={`mod-dispute-${d.deal_id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/deals/${d.deal_id}`} className="font-bold hover:text-brand-tealdark">{d.title}</Link>
                      <IdChip value={d.deal_id} />
                    </div>
                    <p className="text-sm mt-2"><span className="font-semibold">{L("Claim", "দাবি")}:</span> {d.dispute?.claim}</p>
                    {d.dispute?.evidence && <p className="text-sm text-ink-soft mt-1"><span className="font-semibold">{L("Evidence", "প্রমাণ")}:</span> {d.dispute.evidence}</p>}
                    <p className="text-sm mt-2">{t("held")}: <Money amount={d.held} className="font-bold" /></p>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div><label className="text-xs font-semibold">{L("To seller", "বিক্রেতাকে")}</label><Input type="number" value={a.to_seller} onChange={(e) => setAlloc({ ...alloc, [d.deal_id]: { ...a, to_seller: e.target.value } })} className="mt-1 font-mono" data-testid={`review-toseller-${d.deal_id}`} /></div>
                      <div><label className="text-xs font-semibold">{L("To buyer", "ক্রেতাকে")}</label><Input type="number" value={a.to_buyer} onChange={(e) => setAlloc({ ...alloc, [d.deal_id]: { ...a, to_buyer: e.target.value } })} className="mt-1 font-mono" data-testid={`review-tobuyer-${d.deal_id}`} /></div>
                    </div>
                    <p className={`text-[11px] mt-1 font-mono ${sum === d.held ? "text-state-pass-tx" : "text-state-fail-tx"}`}>{L("Must sum to", "যোগফল হতে হবে")} ৳{d.held} · {L("now", "এখন")} ৳{sum}</p>
                    <Textarea value={a.reasons} onChange={(e) => setAlloc({ ...alloc, [d.deal_id]: { ...a, reasons: e.target.value } })} placeholder={L("Reasons for the decision…", "সিদ্ধান্তের কারণ…")} className="mt-2" data-testid={`review-reasons-${d.deal_id}`} />
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button size="sm" onClick={() => review(d, false)} disabled={sum !== d.held} data-testid={`review-resolve-${d.deal_id}`} className="bg-brand hover:bg-brand-hover">{L("Record resolution", "সমাধান লিপিবদ্ধ")}</Button>
                      <Button size="sm" variant="outline" onClick={() => review(d, true)} data-testid={`review-unresolved-${d.deal_id}`} className="text-state-unk-tx border-state-unk-bd">{L("Leave unresolved", "অমীমাংসিত রাখুন")}</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
