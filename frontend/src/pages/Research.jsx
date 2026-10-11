import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Plus, GitCompare, Building2, User, Globe, Flag } from "lucide-react";
import { useLang } from "@/i18n";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loading, EmptyState, ErrorState, IdChip } from "@/components/StatusBits";
import { toast } from "sonner";

const TYPE_ICON = { person: User, business: Building2, page: Flag, domain: Globe };

function CountPills({ counts }) {
  const { t } = useLang();
  const items = [
    ["positive", counts.positive, "bg-state-pass-bg text-state-pass-tx border-state-pass-bd"],
    ["negative", counts.negative, "bg-state-fail-bg text-state-fail-tx border-state-fail-bd"],
    ["neutral", counts.neutral, "bg-surface-elev text-ink-soft border-border"],
    ["resolution", counts.resolution, "bg-teal-50 text-brand-tealdark border-brand-teal/40"],
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([k, v, cls]) => (
        <span key={k} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
          {t(k)} · <span className="font-mono">{v || 0}</span>
        </span>
      ))}
    </div>
  );
}

export default function Research() {
  const { t, L } = useLang();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [state, setState] = useState({ loading: true, error: "", subjects: [] });
  const [selected, setSelected] = useState([]);
  const [open, setOpen] = useState(false);
  const [newSubj, setNewSubj] = useState({ name: "", subject_type: "business", handle: "" });

  const fetchSubjects = useCallback(async (query) => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const { data } = await api.get("/subjects", { params: { q: query } });
      setState({ loading: false, error: "", subjects: data });
    } catch (e) {
      setState({ loading: false, error: apiErr(e), subjects: [] });
    }
  }, []);

  useEffect(() => { fetchSubjects(""); }, [fetchSubjects]);

  const onSearch = (e) => { e.preventDefault(); fetchSubjects(q); };

  const toggleSelect = (id) => {
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : (cur.length < 2 ? [...cur, id] : cur));
  };

  const createSubject = async () => {
    try {
      const { data } = await api.post("/subjects", newSubj);
      toast.success(L("Subject created", "বিষয় তৈরি হয়েছে"));
      setOpen(false); setNewSubj({ name: "", subject_type: "business", handle: "" });
      nav(`/subjects/${data.subject_id}`);
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl tracking-tight">{t("research")}</h1>
          <p className="text-sm text-ink-muted mt-1">{L("Check a track record before you deal. Positive, negative and resolved reports — no trust score.", "লেনদেনের আগে ট্র্যাক রেকর্ড যাচাই করুন। ইতিবাচক, নেতিবাচক ও সমাধান — কোনো ট্রাস্ট স্কোর নেই।")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" data-testid="add-subject-btn" className="rounded-full border-brand text-brand"><Plus className="w-4 h-4 mr-1" />{L("Add subject", "বিষয় যোগ")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{L("Add a subject", "নতুন বিষয় যোগ করুন")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{L("Name", "নাম")}</Label><Input data-testid="subject-name-input" value={newSubj.name} onChange={(e) => setNewSubj({ ...newSubj, name: e.target.value })} className="mt-1" /></div>
              <div><Label>{L("Type", "ধরন")}</Label>
                <Select value={newSubj.subject_type} onValueChange={(v) => setNewSubj({ ...newSubj, subject_type: v })}>
                  <SelectTrigger className="mt-1" data-testid="subject-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="business">{L("Business", "ব্যবসা")}</SelectItem>
                    <SelectItem value="person">{L("Person", "ব্যক্তি")}</SelectItem>
                    <SelectItem value="page">{L("Page", "পেজ")}</SelectItem>
                    <SelectItem value="domain">{L("Domain", "ডোমেইন")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{L("Handle / URL", "হ্যান্ডেল / ইউআরএল")}</Label><Input data-testid="subject-handle-input" value={newSubj.handle} onChange={(e) => setNewSubj({ ...newSubj, handle: e.target.value })} className="mt-1 font-mono" placeholder="facebook.com/…" /></div>
            </div>
            <DialogFooter><Button onClick={createSubject} disabled={!newSubj.name} data-testid="subject-create-btn" className="bg-brand hover:bg-brand-hover">{L("Create", "তৈরি")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <form onSubmit={onSearch} className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input data-testid="subject-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchSubject")} className="pl-9 h-11" />
        </div>
        <Button type="submit" data-testid="subject-search-btn" className="bg-brand hover:bg-brand-hover h-11 px-5">{t("research")}</Button>
      </form>

      {selected.length === 2 && (
        <div className="flex items-center justify-between bg-brand/5 border border-brand/20 rounded-xl p-3 mb-5">
          <span className="text-sm font-semibold">{L("Compare 2 subjects selected", "তুলনার জন্য ২টি বিষয় নির্বাচিত")}</span>
          <Button size="sm" data-testid="compare-go-btn" onClick={() => nav(`/compare?a=${selected[0]}&b=${selected[1]}`)} className="bg-brand-teal hover:bg-brand-tealdark">
            <GitCompare className="w-4 h-4 mr-1" />{L("Compare", "তুলনা")}
          </Button>
        </div>
      )}

      {state.loading ? <Loading /> : state.error ? <ErrorState message={state.error} onRetry={() => fetchSubjects(q)} /> :
        state.subjects.length === 0 ? <EmptyState title={L("No subjects found. Add one to start.", "কোনো বিষয় পাওয়া যায়নি। শুরু করতে একটি যোগ করুন।")} /> : (
          <div className="grid sm:grid-cols-2 gap-4" data-testid="subject-results">
            {state.subjects.map((s) => {
              const Icon = TYPE_ICON[s.subject_type] || Building2;
              const sel = selected.includes(s.subject_id);
              return (
                <div key={s.subject_id} className={`bg-surface-card rounded-2xl border p-5 transition-all ${sel ? "border-brand-teal ring-1 ring-brand-teal" : "border-border hover:shadow-md"}`} data-testid={`subject-card-${s.subject_id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <Link to={`/subjects/${s.subject_id}`} className="flex items-start gap-3 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-surface-elev grid place-items-center shrink-0"><Icon className="w-5 h-5 text-brand" /></div>
                      <div>
                        <h3 className="font-heading font-bold leading-tight hover:text-brand-tealdark">{s.name}</h3>
                        <div className="mt-1 flex items-center gap-2">
                          <IdChip value={s.subject_id} />
                          <span className="text-xs text-ink-muted font-mono">{s.handle}</span>
                        </div>
                      </div>
                    </Link>
                    <label className="flex items-center gap-1 text-[11px] text-ink-muted cursor-pointer">
                      <input type="checkbox" checked={sel} onChange={() => toggleSelect(s.subject_id)} data-testid={`subject-select-${s.subject_id}`} className="accent-brand-teal" />
                      {L("compare", "তুলনা")}
                    </label>
                  </div>
                  <div className="mt-4"><CountPills counts={s.counts || {}} /></div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
