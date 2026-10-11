import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { PenLine, MessageSquarePlus, Link2, ArrowLeft } from "lucide-react";
import { useLang } from "@/i18n";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loading, ErrorState, EmptyState, IdChip, EvidenceChip } from "@/components/StatusBits";
import { toast } from "sonner";

const KIND_STYLE = {
  positive: "border-l-state-pass-bd bg-state-pass-bg/40",
  negative: "border-l-state-fail-bd bg-state-fail-bg/40",
  neutral: "border-l-border bg-surface-elev/40",
  resolution: "border-l-brand-teal bg-teal-50/40",
};
const ACCESS_LABEL = {
  open: ["Open source", "ওপেন সোর্স"],
  snippet_only: ["Snippet only", "শুধু স্নিপেট"],
  link_only: ["Link only", "শুধু লিংক"],
  unavailable: ["Unavailable", "অনুপলব্ধ"],
};

export default function SubjectProfile() {
  const { id } = useParams();
  const { t, L } = useLang();
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState("");

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const { data } = await api.get(`/subjects/${id}`);
      setState({ loading: false, error: "", data });
    } catch (e) { setState({ loading: false, error: apiErr(e), data: null }); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const sendReply = async (reportId, kind) => {
    try {
      await api.post(`/reports/${reportId}/respond`, { text: replyText, kind });
      toast.success(L("Response added", "উত্তর যোগ হয়েছে"));
      setReplyTo(null); setReplyText(""); load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  if (state.loading) return <div className="max-w-4xl mx-auto px-4 py-8"><Loading /></div>;
  if (state.error) return <div className="max-w-4xl mx-auto px-4 py-8"><ErrorState message={state.error} onRetry={load} /></div>;

  const { subject, reports, counts } = state.data;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to="/research" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand mb-4"><ArrowLeft className="w-4 h-4" />{t("research")}</Link>

      <div className="bg-surface-card rounded-2xl border border-border p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading font-extrabold text-2xl sm:text-3xl tracking-tight">{subject.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <IdChip value={subject.subject_id} />
              <span className="text-xs font-mono text-ink-muted">{subject.handle}</span>
              <span className="text-xs bg-surface-elev border border-border rounded-full px-2 py-0.5 capitalize">{subject.subject_type}</span>
            </div>
            {subject.aliases?.length > 0 && (
              <p className="mt-2 text-xs text-ink-muted">{L("Also known as", "অন্য নামে")}: {subject.aliases.join(", ")}</p>
            )}
          </div>
          <Link to={`/reports/new?subject=${subject.subject_id}`}>
            <Button data-testid="write-report-btn" className="bg-brand hover:bg-brand-hover rounded-full"><PenLine className="w-4 h-4 mr-1" />{L("Write a report", "রিপোর্ট লিখুন")}</Button>
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2 text-center">
          {["positive", "negative", "neutral", "resolution"].map((k) => (
            <div key={k} className="bg-surface-elev rounded-xl py-3">
              <div className="font-mono font-extrabold text-xl">{counts[k] || 0}</div>
              <div className="text-[11px] text-ink-soft">{t(k)}</div>
            </div>
          ))}
        </div>
      </div>

      <h2 className="font-heading font-bold text-lg mb-3">{L("Report timeline", "রিপোর্ট টাইমলাইন")}</h2>
      {reports.length === 0 ? <EmptyState title={L("No published reports yet.", "এখনো প্রকাশিত রিপোর্ট নেই।")} /> : (
        <div className="space-y-3" data-testid="report-timeline">
          {reports.map((r) => {
            const resolvedTarget = r.resolution_of ? reports.find((x) => x.report_id === r.resolution_of) : null;
            return (
              <div key={r.report_id} className={`border border-border border-l-4 rounded-xl p-4 ${KIND_STYLE[r.kind]}`} data-testid={`report-${r.report_id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white border border-border">{t(r.kind)}</span>
                    <IdChip value={r.report_id} />
                    <span className="text-[11px] font-mono text-ink-muted">{(r.created_at || "").slice(0, 10)}</span>
                  </div>
                  <span className="text-[10px] font-semibold text-ink-muted">{(ACCESS_LABEL[r.access_status] || ["", ""])[L(0, 1)]}</span>
                </div>
                <h3 className="font-bold mt-2">{r.title}</h3>
                <p className="text-sm text-ink-soft mt-1 leading-relaxed">{r.summary}</p>

                {resolvedTarget && (
                  <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand-tealdark bg-white border border-brand-teal/40 rounded px-2 py-0.5">
                    <Link2 className="w-3 h-3" /> {L("Resolves", "সমাধান করে")} <span className="font-mono">{resolvedTarget.report_id}</span>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {r.source_url ? <EvidenceChip href={r.source_url} label={`${r.source_platform || "source"}`} testid={`evidence-${r.report_id}`} /> : <span className="text-[11px] text-ink-muted italic">{L("No openable source", "খোলা যায় এমন সোর্স নেই")}</span>}
                  <span className="text-[11px] font-mono text-ink-muted uppercase">{r.language}</span>
                </div>

                {r.responses?.length > 0 && (
                  <div className="mt-3 space-y-2 pl-3 border-l-2 border-border">
                    {r.responses.map((resp) => (
                      <div key={resp.response_id} className="text-sm">
                        <span className="text-[11px] font-bold uppercase text-ink-muted mr-2">{resp.kind}</span>
                        <span className="font-semibold">{resp.by_name}:</span> {resp.text}
                      </div>
                    ))}
                  </div>
                )}

                {replyTo === r.report_id ? (
                  <div className="mt-3 space-y-2">
                    <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={L("Your response / correction / appeal…", "আপনার উত্তর / সংশোধন / আপিল…")} data-testid={`reply-text-${r.report_id}`} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => sendReply(r.report_id, "response")} disabled={!replyText} data-testid={`reply-send-${r.report_id}`} className="bg-brand hover:bg-brand-hover">{L("Respond", "উত্তর")}</Button>
                      <Button size="sm" variant="outline" onClick={() => sendReply(r.report_id, "appeal")} disabled={!replyText}>{L("Appeal", "আপিল")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>{L("Cancel", "বাতিল")}</Button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setReplyTo(r.report_id); setReplyText(""); }} data-testid={`reply-open-${r.report_id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-tealdark">
                    <MessageSquarePlus className="w-3.5 h-3.5" /> {L("Respond as the subject / seller", "বিষয়/বিক্রেতা হিসেবে উত্তর দিন")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
