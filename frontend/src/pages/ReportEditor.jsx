import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { FilePlus2, Send, Save, Eye, CheckCircle2 } from "lucide-react";
import { useLang } from "@/i18n";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loading, EmptyState, IdChip } from "@/components/StatusBits";
import { EvidenceButton, AccessPill } from "@/components/EvidenceDrawer";
import { toast } from "sonner";

const STATUS_STYLE = {
  DRAFT: "bg-surface-elev text-ink-soft border-border",
  SUBMITTED: "bg-state-unk-bg text-state-unk-tx border-state-unk-bd",
  NEEDS_INFORMATION: "bg-state-unk-bg text-state-unk-tx border-state-unk-bd",
  PUBLISHED: "bg-state-pass-bg text-state-pass-tx border-state-pass-bd",
  REJECTED: "bg-state-fail-bg text-state-fail-tx border-state-fail-bd",
};
const BLANK = { subject_id: "", kind: "negative", title: "", summary: "", source_platform: "", source_url: "", language: "bn", access_status: "open", author_excerpt: "" };

export default function ReportEditor() {
  const [sp] = useSearchParams();
  const { t, L } = useLang();
  const [subjects, setSubjects] = useState([]);
  const [mine, setMine] = useState(null);
  const [form, setForm] = useState({ ...BLANK, subject_id: sp.get("subject") || "" });
  const [editingId, setEditingId] = useState(null);
  const [approved, setApproved] = useState(false);
  const [saved, setSaved] = useState(null);   // last saved report (carries the live snapshot result)
  const [saving, setSaving] = useState(false);

  const loadMine = useCallback(async () => {
    try { const { data } = await api.get("/reports/mine"); setMine(data); }
    catch (e) { toast.error(apiErr(e)); setMine([]); }
  }, []);

  useEffect(() => {
    api.get("/subjects").then(({ data }) => setSubjects(data)).catch(() => {});
    loadMine();
  }, [loadMine]);

  const upd = (k) => (e) => setForm({ ...form, [k]: e?.target ? e.target.value : e });
  const payload = () => Object.fromEntries([...Object.keys(BLANK), "resolution_of"].map((k) => [k, form[k] ?? (k === "resolution_of" ? null : "")]));

  const saveDraft = async () => {
    setSaving(true);
    try {
      if (editingId) { const { data } = await api.put(`/reports/${editingId}`, payload()); setSaved(data); toast.success(L("Draft updated", "খসড়া হালনাগাদ")); }
      else { const { data } = await api.post("/reports", payload()); setEditingId(data.report_id); setSaved(data); toast.success(L("Draft saved", "খসড়া সংরক্ষিত")); }
      loadMine();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setSaving(false); }
  };

  const refetch = async () => {
    if (!editingId) return;
    try { const { data } = await api.post(`/reports/${editingId}/refetch`); setSaved(data); toast.success(L("Snapshot refreshed", "স্ন্যাপশট হালনাগাদ")); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const submitReport = async () => {
    setSaving(true);
    try {
      let id = editingId;
      if (!id) { const { data } = await api.post("/reports", payload()); id = data.report_id; setEditingId(id); }
      else { await api.put(`/reports/${id}`, payload()); }
      await api.post(`/reports/${id}/submit`);
      toast.success(L("Submitted for moderation", "মডারেশনের জন্য জমা"));
      setForm({ ...BLANK }); setEditingId(null); setApproved(false); setSaved(null); loadMine();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setSaving(false); }
  };

  const editDraft = (r) => { setForm({ ...BLANK, ...r }); setEditingId(r.report_id); setSaved(r); setApproved(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3">
        <h1 className="font-heading font-extrabold text-2xl tracking-tight flex items-center gap-2"><FilePlus2 className="w-6 h-6 text-brand" />{L("Community report editor", "কমিউনিটি রিপোর্ট এডিটর")}</h1>
        <p className="text-sm text-ink-muted mt-1 mb-5">{L("Drafts stay private until you approve the preview and submit for moderation.", "আপনি প্রিভিউ অনুমোদন করে জমা না দেওয়া পর্যন্ত খসড়া ব্যক্তিগত থাকে।")}</p>

        <div className="bg-surface-card rounded-2xl border border-border p-5 space-y-4">
          <div>
            <Label>{L("Subject", "বিষয়")}</Label>
            <Select value={form.subject_id} onValueChange={upd("subject_id")}>
              <SelectTrigger className="mt-1" data-testid="report-subject-select"><SelectValue placeholder={L("Choose a subject", "একটি বিষয় বাছুন")} /></SelectTrigger>
              <SelectContent>{subjects.map((s) => <SelectItem key={s.subject_id} value={s.subject_id}>{s.name} ({s.subject_id})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{L("Report type", "রিপোর্টের ধরন")}</Label>
              <Select value={form.kind} onValueChange={upd("kind")}>
                <SelectTrigger className="mt-1" data-testid="report-kind-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["positive", "negative", "neutral", "resolution"].map((k) => <SelectItem key={k} value={k}>{t(k)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{L("Source access", "সোর্স অ্যাক্সেস")}</Label>
              <Select value={form.access_status} onValueChange={upd("access_status")}>
                <SelectTrigger className="mt-1" data-testid="report-access-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{L("Open source", "ওপেন সোর্স")}</SelectItem>
                  <SelectItem value="snippet_only">{L("Snippet only", "শুধু স্নিপেট")}</SelectItem>
                  <SelectItem value="link_only">{L("Link only", "শুধু লিংক")}</SelectItem>
                  <SelectItem value="unavailable">{L("Unavailable", "অনুপলব্ধ")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>{L("Title", "শিরোনাম")}</Label><Input data-testid="report-title-input" value={form.title} onChange={upd("title")} className="mt-1" /></div>
          <div><Label>{L("What happened (attributed)", "কী ঘটেছে (সূত্রসহ)")}</Label><Textarea data-testid="report-summary-input" value={form.summary} onChange={upd("summary")} className="mt-1" rows={4} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{L("Source platform", "সোর্স প্ল্যাটফর্ম")}</Label><Input data-testid="report-platform-input" value={form.source_platform} onChange={upd("source_platform")} className="mt-1" placeholder="Facebook / Reddit / Web" /></div>
            <div><Label>{L("Source URL", "সোর্স ইউআরএল")}</Label><Input data-testid="report-url-input" value={form.source_url} onChange={upd("source_url")} className="mt-1 font-mono" placeholder="https://…" /></div>
          </div>
          <div>
            <Label>{L("Pasted excerpt / quote (fallback evidence)", "উদ্ধৃতি (বিকল্প প্রমাণ)")}</Label>
            <Textarea data-testid="report-excerpt-input" value={form.author_excerpt} onChange={upd("author_excerpt")} className="mt-1" rows={3} placeholder={L("Paste the exact words from the source. Shown in the evidence drawer if the live snapshot fails.", "সোর্সের হুবহু কথা পেস্ট করুন। লাইভ স্ন্যাপশট ব্যর্থ হলে প্রমাণ ড্রয়ারে দেখানো হবে।")} />
            <p className="text-[11px] text-ink-muted mt-1">{L("On save, the source URL is fetched once and a snapshot (title, excerpt, hash, HTTP result) is stored. The access status you declared is kept, but the fetched result decides the label.", "সংরক্ষণে সোর্স ইউআরএল একবার সংগ্রহ করে স্ন্যাপশট (শিরোনাম, উদ্ধৃতি, হ্যাশ, HTTP ফল) রাখা হয়। আপনার ঘোষিত স্ট্যাটাস থাকে, কিন্তু সংগ্রহের ফল লেবেল নির্ধারণ করে।")}</p>
          </div>

          {saved && (saved.snapshot || saved.author_excerpt) && (
            <div className="rounded-xl border border-border bg-surface-elev p-3 flex flex-wrap items-center gap-2 text-xs" data-testid="snapshot-result">
              <span className="font-semibold">{L("Snapshot", "স্ন্যাপশট")}:</span>
              <AccessPill status={saved.access_status} testid="snapshot-access-status" />
              {saved.snapshot?.http_status != null && <span className="font-mono text-ink-muted">HTTP {saved.snapshot.http_status}</span>}
              {saved.snapshot?.error && <span className="font-mono text-state-fail-tx">{saved.snapshot.error}</span>}
              <EvidenceButton evidence={saved} label={L("open drawer", "ড্রয়ার খুলুন")} testid="snapshot-open-drawer" onRefetch={refetch} />
            </div>
          )}

          {/* publication preview — author must approve */}
          {form.title && form.subject_id && (
            <div className="rounded-xl border border-dashed border-brand-teal bg-teal-50/30 p-4" data-testid="publication-preview">
              <div className="flex items-center gap-1 text-xs font-bold text-brand-tealdark mb-2"><Eye className="w-4 h-4" />{L("Publication preview", "প্রকাশের প্রিভিউ")}</div>
              <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-white border border-border mr-2">{t(form.kind)}</span>
              <span className="font-bold">{form.title}</span>
              <p className="text-sm text-ink-soft mt-1">{form.summary}</p>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <Checkbox checked={approved} onCheckedChange={setApproved} data-testid="approve-publication-checkbox" />
                {L("I approve this narrative and redaction for publication.", "আমি প্রকাশের জন্য এই বিবরণ ও রিডাকশন অনুমোদন করি।")}
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" onClick={saveDraft} disabled={saving || !form.subject_id || !form.title} data-testid="save-draft-btn"><Save className="w-4 h-4 mr-1" />{saving ? L("Saving & snapshotting…", "সংরক্ষণ ও স্ন্যাপশট…") : L("Save draft", "খসড়া সংরক্ষণ")}</Button>
            <Button onClick={submitReport} disabled={saving || !form.subject_id || !form.title || !approved} data-testid="submit-report-btn" className="bg-brand hover:bg-brand-hover"><Send className="w-4 h-4 mr-1" />{L("Submit for moderation", "মডারেশনে জমা")}</Button>
            {editingId && <Button variant="ghost" onClick={() => { setForm({ ...BLANK }); setEditingId(null); setApproved(false); setSaved(null); }}>{L("New", "নতুন")}</Button>}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2">
        <h2 className="font-heading font-bold text-lg mb-3">{L("My reports", "আমার রিপোর্ট")}</h2>
        {mine === null ? <Loading /> : mine.length === 0 ? <EmptyState title={L("No reports yet.", "এখনো কোনো রিপোর্ট নেই।")} /> : (
          <div className="space-y-2" data-testid="my-reports-list">
            {mine.map((r) => (
              <div key={r.report_id} className="bg-surface-card rounded-xl border border-border p-3" data-testid={`my-report-${r.report_id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${STATUS_STYLE[r.status] || ""}`}>{r.status}</span>
                  <IdChip value={r.report_id} />
                </div>
                <div className="font-semibold text-sm mt-1.5">{r.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-ink-muted">{t(r.kind)}</span>
                  {(r.status === "DRAFT" || r.status === "NEEDS_INFORMATION") && (
                    <button onClick={() => editDraft(r)} data-testid={`edit-report-${r.report_id}`} className="text-[11px] font-semibold text-brand-tealdark underline">{L("Edit", "সম্পাদনা")}</button>
                  )}
                  {r.status === "PUBLISHED" && (
                    <Link to={`/subjects/${r.subject_id}`} className="text-[11px] font-semibold text-brand-tealdark underline inline-flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />{L("View", "দেখুন")}</Link>
                  )}
                </div>
                {r.moderation_history?.slice(-1).map((m, i) => m.note ? <p key={i} className="text-[11px] text-ink-muted mt-1 italic">“{m.note}”</p> : null)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
