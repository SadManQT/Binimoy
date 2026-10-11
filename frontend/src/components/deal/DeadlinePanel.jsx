import React, { useState } from "react";
import { CalendarClock, Bell, Plus, Check, X } from "lucide-react";
import { useLang } from "@/i18n";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Countdown } from "@/components/Countdown";
import { toast } from "sonner";

const KIND_TONE = {
  window_overdue: "border-l-state-fail-bd", refund_requested: "border-l-state-fail-bd", dispute_opened: "border-l-state-fail-bd",
  extension_requested: "border-l-state-unk-bd", extension_declined: "border-l-state-unk-bd",
  extension_approved: "border-l-state-pass-bd", settled: "border-l-state-pass-bd",
  vault_key_set: "border-l-brand-teal", vault_sealed: "border-l-brand-teal", vault_revealed: "border-l-brand-teal",
};

export function DeadlinePanel({ deal, myRole, onChanged }) {
  const { L } = useLang();
  const [ext, setExt] = useState({ window: "", extra_days: 1, reason: "" });
  const [showAll, setShowAll] = useState(false);
  const timers = deal.timers || {};
  const req = deal.deadlines?.extension_request;
  const isParty = myRole === "buyer" || myRole === "seller";
  const openWindows = ["delivery", "inspection"].filter((w) => ["running", "overdue"].includes(timers[w]?.state));
  const canRequest = isParty && !req && openWindows.length > 0 && !["DISPUTED", "SETTLED", "UNRESOLVED"].includes(deal.status);
  const notices = [...(deal.notices || [])].reverse();
  const shown = showAll ? notices : notices.slice(0, 4);

  const call = async (fn, ok) => { try { await fn(); if (ok) toast.success(ok); onChanged(); } catch (e) { toast.error(apiErr(e)); } };

  return (
    <section className="bg-surface-card rounded-2xl border border-border p-5" data-testid="deadline-panel">
      <h2 className="font-heading font-bold flex items-center gap-2 mb-1"><CalendarClock className="w-4 h-4 text-brand" />{L("Deadlines", "সময়সীমা")}</h2>
      <p className="text-[11px] text-ink-muted mb-3">{L("Windows can only be extended by mutual consent — never shortened or started silently.", "সময় শুধু পারস্পরিক সম্মতিতে বাড়ে — কখনো নীরবে কমে বা শুরু হয় না।")}</p>
      <div className="space-y-2">
        <Countdown timer={timers.delivery} label={L("Delivery", "সরবরাহ")} testid="timer-delivery" />
        <Countdown timer={timers.inspection} label={L("Inspection / challenge", "পরিদর্শন / চ্যালেঞ্জ")} testid="timer-inspection" />
      </div>

      {req && (
        <div className="mt-3 rounded-xl border border-state-unk-bd bg-state-unk-bg p-3 text-sm" data-testid="extension-request">
          <div className="font-semibold text-state-unk-tx">{L("Extension requested", "মেয়াদ বৃদ্ধির অনুরোধ")} · {req.window} · +{req.extra_days} {L("day(s)", "দিন")}</div>
          <div className="text-xs text-state-unk-tx mt-0.5">{L("by", "করেছেন")} {req.by_role}{req.reason ? ` — ${req.reason}` : ""}</div>
          {isParty && req.by_role !== myRole ? (
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={() => call(() => api.post(`/deals/${deal.deal_id}/extensions/approve`), L("Extension approved", "মেয়াদ বৃদ্ধি অনুমোদিত"))} data-testid="extension-approve" className="bg-brand hover:bg-brand-hover"><Check className="w-4 h-4 mr-1" />{L("Approve", "অনুমোদন")}</Button>
              <Button size="sm" variant="outline" onClick={() => call(() => api.post(`/deals/${deal.deal_id}/extensions/decline`), L("Declined", "প্রত্যাখ্যাত"))} data-testid="extension-decline"><X className="w-4 h-4 mr-1" />{L("Decline", "প্রত্যাখ্যান")}</Button>
            </div>
          ) : <div className="text-[11px] text-ink-muted mt-1">{L("Waiting for the other party.", "অপর পক্ষের অপেক্ষায়।")}</div>}
        </div>
      )}

      {canRequest && (
        <div className="mt-3 border border-dashed border-border rounded-xl p-3" data-testid="extension-form">
          <div className="text-xs font-semibold mb-2">{L("Request an extension", "মেয়াদ বৃদ্ধি চান")}</div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={ext.window} onValueChange={(v) => setExt({ ...ext, window: v })}>
              <SelectTrigger data-testid="extension-window"><SelectValue placeholder={L("Window", "সময়")} /></SelectTrigger>
              <SelectContent>{openWindows.map((w) => <SelectItem key={w} value={w}>{w === "delivery" ? L("Delivery", "সরবরাহ") : L("Inspection", "পরিদর্শন")}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" min={1} max={60} value={ext.extra_days} onChange={(e) => setExt({ ...ext, extra_days: e.target.value })} data-testid="extension-days" className="font-mono" placeholder={L("+days", "+দিন")} />
          </div>
          <Input value={ext.reason} onChange={(e) => setExt({ ...ext, reason: e.target.value })} data-testid="extension-reason" className="mt-2" placeholder={L("Reason (shown to the other party)", "কারণ (অপর পক্ষ দেখবে)")} />
          <Button size="sm" disabled={!ext.window || Number(ext.extra_days) < 1} data-testid="extension-submit" className="w-full mt-2 bg-brand hover:bg-brand-hover"
            onClick={() => call(async () => { await api.post(`/deals/${deal.deal_id}/extensions`, { ...ext, extra_days: Number(ext.extra_days) }); setExt({ window: "", extra_days: 1, reason: "" }); }, L("Extension requested", "অনুরোধ পাঠানো হয়েছে"))}>
            <Plus className="w-4 h-4 mr-1" />{L("Send request", "অনুরোধ পাঠান")}
          </Button>
        </div>
      )}

      {deal.deadlines?.extensions?.length > 0 && (
        <div className="mt-3 text-[11px] text-ink-muted font-mono" data-testid="extension-history">
          {deal.deadlines.extensions.map((e) => <div key={e.request_id}>+{e.extra_days}d {e.window} · {L("agreed", "সম্মত")} {e.approved_at?.slice(0, 10)}</div>)}
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-heading font-bold flex items-center gap-1.5"><Bell className="w-4 h-4 text-brand" />{L("Notices", "নোটিশ")} <span className="font-mono text-[11px] text-ink-muted">({notices.length})</span></h3>
          {notices.length > 4 && <button onClick={() => setShowAll(!showAll)} className="text-[11px] font-semibold text-brand-tealdark underline" data-testid="notices-toggle">{showAll ? L("Show fewer", "কম দেখান") : L("Show all", "সব দেখান")}</button>}
        </div>
        {notices.length === 0 ? <p className="text-xs text-ink-muted">{L("No notices yet.", "এখনো কোনো নোটিশ নেই।")}</p> : (
          <div className="space-y-1.5" data-testid="notices-list">
            {shown.map((n) => (
              <div key={n.notice_id} className={`border border-border border-l-4 rounded-lg px-3 py-2 ${KIND_TONE[n.kind] || "border-l-border"}`} data-testid={`notice-${n.kind}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{L(n.title_en, n.title_bn)}</span>
                  <span className="text-[10px] font-mono text-ink-muted whitespace-nowrap">{(n.at || "").slice(5, 16).replace("T", " ")}</span>
                </div>
                {(n.body_en || n.body_bn) && <p className="text-[11px] text-ink-soft mt-0.5 leading-snug">{L(n.body_en, n.body_bn)}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
