import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Info } from "lucide-react";
import { useLang } from "@/i18n";
import { api, apiErr } from "@/lib/api";
import { Loading, ErrorState, IdChip } from "@/components/StatusBits";

function Column({ side }) {
  const { t, L } = useLang();
  const kinds = ["positive", "negative", "neutral", "resolution"];
  return (
    <div className="bg-surface-card rounded-2xl border border-border p-6" data-testid="compare-column">
      <h3 className="font-heading font-extrabold text-xl">{side.subject.name}</h3>
      <div className="mt-1 flex items-center gap-2"><IdChip value={side.subject.subject_id} /><span className="text-xs font-mono text-ink-muted">{side.subject.handle}</span></div>
      <div className="mt-5 space-y-2">
        {kinds.map((k) => (
          <div key={k} className="flex items-center justify-between text-sm">
            <span className="text-ink-soft">{t(k)}</span>
            <span className="font-mono font-bold">{side.counts[k] || 0}</span>
          </div>
        ))}
        <div className="h-px bg-border my-2" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-soft">{L("Total reports", "মোট রিপোর্ট")}</span>
          <span className="font-mono font-bold">{side.total}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-soft">{L("Latest report", "সর্বশেষ রিপোর্ট")}</span>
          <span className="font-mono text-ink-muted">{side.latest ? side.latest.slice(0, 10) : "—"}</span>
        </div>
      </div>
    </div>
  );
}

export default function Compare() {
  const [sp] = useSearchParams();
  const { L } = useLang();
  const a = sp.get("a"), b = sp.get("b");
  const [state, setState] = useState({ loading: true, error: "", data: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const { data } = await api.get("/compare", { params: { a, b } });
      setState({ loading: false, error: "", data });
    } catch (e) { setState({ loading: false, error: apiErr(e), data: null }); }
  }, [a, b]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to="/research" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand mb-4"><ArrowLeft className="w-4 h-4" />{L("Back to research", "গবেষণায় ফিরুন")}</Link>
      <h1 className="font-heading font-extrabold text-2xl sm:text-3xl tracking-tight mb-5">{L("Compare subjects", "বিষয় তুলনা")}</h1>

      {state.loading ? <Loading /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <Column side={state.data.a} />
            <Column side={state.data.b} />
          </div>
          <div className="mt-5 flex items-start gap-2.5 text-sm text-ink-soft bg-state-unk-bg border border-state-unk-bd rounded-xl p-4" data-testid="compare-disclaimer">
            <Info className="w-5 h-5 text-state-unk-tx mt-0.5 shrink-0" />
            <p>{L(state.data.disclaimer_en, state.data.disclaimer_bn)}</p>
          </div>
        </>
      )}
    </div>
  );
}
