import React, { useState } from "react";
import { FileText, ExternalLink, RefreshCw, Camera, Quote, ShieldAlert } from "lucide-react";
import { useLang } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export const ACCESS = {
  open: { en: "Open source", bn: "ওপেন সোর্স", cls: "bg-state-pass-bg border-state-pass-bd text-state-pass-tx",
    ex_en: "The source was fetched and readable when the snapshot was taken.", ex_bn: "স্ন্যাপশট নেওয়ার সময় সোর্সটি পড়া গেছে।" },
  snippet_only: { en: "Snippet only", bn: "শুধু স্নিপেট", cls: "bg-state-unk-bg border-state-unk-bd text-state-unk-tx",
    ex_en: "Only a fragment could be captured (login wall or very short page).", ex_bn: "শুধু একটি অংশ সংগ্রহ করা গেছে (লগইন বাধা বা ছোট পাতা)।" },
  link_only: { en: "Link only", bn: "শুধু লিংক", cls: "bg-surface-elev border-border text-ink-soft",
    ex_en: "The source refused automated access. The link is preserved; its content was not captured.", ex_bn: "সোর্স স্বয়ংক্রিয় অ্যাক্সেস প্রত্যাখ্যান করেছে। লিংক সংরক্ষিত; বিষয়বস্তু সংগ্রহ হয়নি।" },
  unavailable: { en: "Unavailable", bn: "অনুপলব্ধ", cls: "bg-state-fail-bg border-state-fail-bd text-state-fail-tx",
    ex_en: "The source could not be reached. This claim rests on the author's excerpt alone.", ex_bn: "সোর্সে পৌঁছানো যায়নি। এই দাবি শুধু লেখকের উদ্ধৃতির উপর নির্ভরশীল।" },
};

export function AccessPill({ status, testid }) {
  const { L } = useLang();
  const a = ACCESS[status] || ACCESS.unavailable;
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${a.cls}`} data-testid={testid}>{L(a.en, a.bn)}</span>;
}

// evidence = { source_url, source_platform, access_status, snapshot, author_excerpt, report_id? }
export function EvidenceDrawer({ open, onOpenChange, evidence, onRefetch }) {
  const { L } = useLang();
  const [busy, setBusy] = useState(false);
  if (!evidence) return null;
  const snap = evidence.snapshot;
  const status = evidence.access_status || snap?.auto_access_status || "unavailable";
  const a = ACCESS[status] || ACCESS.unavailable;
  const refetch = async () => { setBusy(true); try { await onRefetch(); } finally { setBusy(false); } };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto" data-testid="evidence-drawer">
        <SheetHeader className="text-left">
          <SheetTitle className="font-heading flex items-center gap-2"><Camera className="w-4 h-4 text-brand" />{L("Evidence snapshot", "প্রমাণের স্ন্যাপশট")}</SheetTitle>
          <SheetDescription>{L("What the source looked like when it was saved — proof is one tap away.", "সংরক্ষণের সময় সোর্স কেমন ছিল — প্রমাণ এক ট্যাপে।")}</SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <AccessPill status={status} testid="drawer-access-status" />
            {snap?.origin === "seed" && <span className="text-[10px] font-mono text-ink-muted border border-dashed border-border px-1.5 py-0.5 rounded">{L("seed snapshot (synthetic)", "সিড স্ন্যাপশট (কৃত্রিম)")}</span>}
            {evidence.report_id && <span className="text-[10px] font-mono text-ink-muted">{evidence.report_id}</span>}
          </div>
          <p className="text-xs text-ink-soft">{L(a.ex_en, a.ex_bn)}</p>

          <div className="rounded-xl border border-border bg-surface-elev p-3 space-y-1">
            <div className="text-[11px] font-semibold uppercase text-ink-muted">{L("Source", "সোর্স")}</div>
            <div className="font-semibold">{evidence.source_platform || snap?.host || L("Unknown platform", "অজানা প্ল্যাটফর্ম")}</div>
            {evidence.source_url ? (
              <a href={evidence.source_url} target="_blank" rel="noopener noreferrer" className="block font-mono text-[11px] text-brand-tealdark break-all hover:underline" data-testid="drawer-source-url">{evidence.source_url}</a>
            ) : <div className="text-xs italic text-ink-muted">{L("No URL recorded", "কোনো ইউআরএল নেই")}</div>}
          </div>

          {snap ? (
            <div className="rounded-xl border border-border p-3 space-y-2" data-testid="drawer-snapshot">
              <div className="grid grid-cols-2 gap-y-1 text-[11px] font-mono text-ink-soft">
                <span>{L("fetched", "সংগ্রহ")}</span><span className="text-right">{(snap.fetched_at || "").slice(0, 16).replace("T", " ")} UTC</span>
                <span>HTTP</span><span className="text-right">{snap.http_status ?? "—"}</span>
                <span>{L("hash", "হ্যাশ")}</span><span className="text-right">{snap.content_hash || "—"}</span>
                <span>{L("size", "আকার")}</span><span className="text-right">{snap.content_length ? `${snap.content_length} B` : "—"}</span>
              </div>
              {snap.title && <div className="font-semibold leading-snug pt-1">{snap.title}</div>}
              {snap.excerpt ? (
                <blockquote className="border-l-2 border-brand-teal pl-3 text-ink-soft text-[13px] leading-relaxed whitespace-pre-wrap" data-testid="drawer-excerpt">{snap.excerpt}</blockquote>
              ) : (
                <div className="flex items-start gap-2 text-xs text-ink-muted"><ShieldAlert className="w-4 h-4 shrink-0" />{L("No readable content was captured.", "পাঠযোগ্য কোনো বিষয়বস্তু সংগ্রহ হয়নি।")}</div>
              )}
              {snap.error && <div className="text-[11px] text-state-fail-tx font-mono">{snap.error}</div>}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3 text-xs text-ink-muted" data-testid="drawer-no-snapshot">{L("No snapshot captured for this source.", "এই সোর্সের কোনো স্ন্যাপশট নেই।")}</div>
          )}

          {evidence.author_excerpt && (
            <div className="rounded-xl border border-dashed border-brand-teal bg-teal-50/40 p-3" data-testid="drawer-author-excerpt">
              <div className="flex items-center gap-1 text-[11px] font-semibold uppercase text-brand-tealdark mb-1"><Quote className="w-3 h-3" />{L("Author's pasted excerpt", "লেখকের উদ্ধৃতি")}</div>
              <p className="text-[13px] text-ink-soft whitespace-pre-wrap">{evidence.author_excerpt}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {evidence.source_url && (
              <a href={evidence.source_url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" data-testid="drawer-open-original"><ExternalLink className="w-4 h-4 mr-1" />{L("Open original", "মূল সোর্স খুলুন")}</Button></a>
            )}
            {onRefetch && evidence.source_url && (
              <Button size="sm" variant="outline" onClick={refetch} disabled={busy} data-testid="drawer-refetch"><RefreshCw className={`w-4 h-4 mr-1 ${busy ? "animate-spin" : ""}`} />{L("Refresh snapshot", "স্ন্যাপশট হালনাগাদ")}</Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Chip that opens the drawer — drop-in for the old plain link chip.
export function EvidenceButton({ evidence, label, testid = "evidence-chip", onRefetch }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid={testid}
        className="inline-flex items-center gap-1 text-[11px] font-mono font-medium bg-white border border-brand-teal/40 text-brand-tealdark px-2 py-0.5 rounded hover:bg-brand-teal hover:text-white transition-colors">
        <FileText className="w-3 h-3" /> {label}
      </button>
      <EvidenceDrawer open={open} onOpenChange={setOpen} evidence={evidence} onRefetch={onRefetch} />
    </>
  );
}
