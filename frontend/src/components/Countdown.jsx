import React, { useEffect, useState } from "react";
import { Timer, AlertTriangle, PauseCircle, CheckCircle2, Clock } from "lucide-react";
import { useLang } from "@/i18n";

function fmt(total) {
  const s = Math.abs(total);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${String(sec).padStart(2, "0")}s`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

// Ticks locally from the server-computed remaining_seconds so client clock skew cannot shorten a window.
export function Countdown({ timer, label, testid }) {
  const { L } = useLang();
  const [rem, setRem] = useState(timer?.remaining_seconds ?? null);
  useEffect(() => { setRem(timer?.remaining_seconds ?? null); }, [timer?.remaining_seconds, timer?.due]);
  useEffect(() => {
    if (timer?.state !== "running" && timer?.state !== "overdue") return undefined;
    const id = setInterval(() => setRem((r) => (r == null ? r : r - 1)), 1000);
    return () => clearInterval(id);
  }, [timer?.state]);

  const state = timer?.state || "not_started";
  const overdue = state === "overdue" || (state === "running" && rem != null && rem < 0);
  const urgent = !overdue && state === "running" && rem != null && rem < 6 * 3600;
  const tone = overdue ? "bg-state-fail-bg border-state-fail-bd text-state-fail-tx"
    : urgent ? "bg-state-unk-bg border-state-unk-bd text-state-unk-tx"
    : state === "running" ? "bg-teal-50 border-brand-teal/40 text-brand-tealdark"
    : "bg-surface-elev border-border text-ink-muted";
  const Icon = overdue ? AlertTriangle : state === "paused" ? PauseCircle : state === "closed" ? CheckCircle2 : state === "running" ? Timer : Clock;

  let value;
  if (state === "not_started") value = L("Not started", "শুরু হয়নি");
  else if (state === "closed") value = L("Closed", "বন্ধ");
  else if (state === "paused") value = L("Paused (dispute)", "স্থগিত (বিরোধ)");
  else if (overdue) value = `${L("Overdue by", "বিলম্ব")} ${fmt(rem)}`;
  else value = fmt(rem);

  return (
    <div className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3 ${tone}`} data-testid={testid} data-state={overdue ? "overdue" : state}>
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide">{label}</div>
          {timer?.due && <div className="text-[10px] font-mono opacity-80 truncate">{L("due", "শেষ")} {timer.due.slice(0, 16).replace("T", " ")} UTC</div>}
        </div>
      </div>
      <span className="font-mono font-bold tabular-nums text-sm whitespace-nowrap">{value}</span>
    </div>
  );
}
