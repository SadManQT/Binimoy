import React from "react";
import { Loader2, Inbox, AlertTriangle, Lock, Sparkles, FileText } from "lucide-react";
import { useLang } from "@/i18n";

// Amounts & IDs are ALWAYS monospaced and shown exactly (never transliterated).
export function Money({ amount, className = "" }) {
  const n = Number(amount || 0).toLocaleString("en-US");
  return <span className={`font-mono tabular-nums tracking-tight ${className}`} data-testid="money">৳ {n}</span>;
}

export function IdChip({ value, className = "" }) {
  return (
    <span className={`font-mono text-[11px] bg-surface-elev text-ink-soft px-1.5 py-0.5 rounded border border-border ${className}`}>
      {value}
    </span>
  );
}

const STATE = {
  PASS: "bg-state-pass-bg border-state-pass-bd text-state-pass-tx",
  FAIL: "bg-state-fail-bg border-state-fail-bd text-state-fail-tx",
  UNKNOWN: "bg-state-unk-bg border-state-unk-bd text-state-unk-tx",
};
export function StatusBadge({ status, children, className = "" }) {
  const cls = STATE[status] || "bg-surface-elev border-border text-ink-soft";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold font-mono px-2 py-0.5 rounded-md border ${cls} ${className}`}>
      {children || status}
    </span>
  );
}

// AI-proposed content: visually DISTINCT from committed facts (dashed + tinted + pill).
export function AiCard({ children, className = "" }) {
  const { t } = useLang();
  return (
    <div className={`relative rounded-xl border border-dashed border-brand-teal bg-teal-50/40 p-4 ${className}`} data-testid="ai-card">
      <span className="absolute -top-2.5 left-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-brand-teal text-white px-2 py-0.5 rounded-full">
        <Sparkles className="w-3 h-3" /> {t("aiSuggested")}
      </span>
      <div className="pt-1">{children}</div>
    </div>
  );
}

export function EvidenceChip({ href, label, testid = "evidence-chip" }) {
  const content = (
    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium bg-white border border-brand-teal/40 text-brand-tealdark px-2 py-0.5 rounded hover:bg-brand-teal hover:text-white transition-colors">
      <FileText className="w-3 h-3" /> {label}
    </span>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" data-testid={testid}>{content}</a>
  ) : (
    <span data-testid={testid}>{content}</span>
  );
}

export function Loading({ label }) {
  const { t } = useLang();
  return (
    <div className="flex items-center gap-2 text-ink-muted py-10 justify-center" data-testid="loading-state">
      <Loader2 className="w-5 h-5 animate-spin" /> {label || t("loading")}
    </div>
  );
}

export function EmptyState({ title, action }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center text-center gap-3 py-12 border border-dashed border-border rounded-xl bg-white/60" data-testid="empty-state">
      <Inbox className="w-8 h-8 text-ink-muted" />
      <p className="text-ink-soft">{title || t("empty")}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center text-center gap-3 py-10 border border-state-fail-bd bg-state-fail-bg rounded-xl" data-testid="error-state">
      <AlertTriangle className="w-7 h-7 text-state-fail-tx" />
      <p className="text-state-fail-tx font-medium">{message}</p>
      {onRetry && (
        <button onClick={onRetry} data-testid="retry-btn" className="text-sm font-semibold text-brand underline">
          {t("retry")}
        </button>
      )}
    </div>
  );
}

export function PermissionDenied({ requiredRole }) {
  const { L } = useLang();
  return (
    <div className="flex flex-col items-center text-center gap-3 py-12" data-testid="permission-denied">
      <Lock className="w-8 h-8 text-ink-muted" />
      <p className="text-ink-soft">
        {L("You do not have permission to view this.", "এটি দেখার অনুমতি আপনার নেই।")}
        {requiredRole ? ` ${L("Required role", "প্রয়োজনীয় ভূমিকা")}: ${requiredRole}.` : ""}
      </p>
    </div>
  );
}
