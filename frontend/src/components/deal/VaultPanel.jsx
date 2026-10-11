import React, { useState, useEffect, useCallback, useRef } from "react";
import { KeyRound, Lock, Unlock, Download, Upload, Eye, EyeOff, Copy, ShieldCheck, Smartphone, History } from "lucide-react";
import { useLang } from "@/i18n";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loading } from "@/components/StatusBits";
import * as vc from "@/lib/vaultCrypto";
import { toast } from "sonner";

const HIDE_AFTER_MS = 60_000;

export function VaultPanel({ deal, user, myRole, onChanged }) {
  const { L } = useLang();
  const [vault, setVault] = useState(null);
  const [err, setErr] = useState("");
  const [deviceKey, setDeviceKey] = useState(() => vc.loadDeviceKey(user.user_id, deal.deal_id));
  const [seal, setSeal] = useState({ field_key: "", label: "", value: "" });
  const [revealed, setRevealed] = useState({});
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setErr("");
    try { const { data } = await api.get(`/deals/${deal.deal_id}/vault`); setVault(data); }
    catch (e) { setErr(apiErr(e)); }
  }, [deal.deal_id]);
  useEffect(() => { load(); }, [load, deal.updated_at]);

  const act = async (fn, ok) => { try { await fn(); if (ok) toast.success(ok); await load(); onChanged(); } catch (e) { toast.error(apiErr(e)); } };

  if (err) return <Shell L={L}><p className="text-sm text-state-fail-tx" data-testid="vault-error">{err}</p></Shell>;
  if (!vault) return <Shell L={L}><Loading /></Shell>;
  if (!vc.cryptoAvailable()) return <Shell L={L}><p className="text-sm text-state-fail-tx">{L("This browser cannot do vault cryptography (WebCrypto unavailable).", "এই ব্রাউজারে ভল্ট ক্রিপ্টোগ্রাফি সম্ভব নয়।")}</p></Shell>;

  const keyMatches = deviceKey && deviceKey.fingerprint === vault.key_fingerprint;
  const terminal = ["SETTLED", "UNRESOLVED"].includes(deal.status);

  const setupKey = () => act(async () => {
    const { pub, fp } = await vc.generateDeviceKey(user.user_id, deal.deal_id);
    await api.post(`/deals/${deal.deal_id}/vault/key`, { public_key: pub, fingerprint: fp });
    setDeviceKey(vc.loadDeviceKey(user.user_id, deal.deal_id));
  }, L("Vault key created on this device", "এই ডিভাইসে ভল্ট কী তৈরি হয়েছে"));

  const importKey = async (file) => {
    if (!file) return;
    try { const fp = await vc.importBackup(file, user.user_id, deal.deal_id, vault.key_fingerprint); setDeviceKey(vc.loadDeviceKey(user.user_id, deal.deal_id)); toast.success(`${L("Key restored", "কী পুনরুদ্ধার")} · ${fp}`); }
    catch (e) { toast.error(e.message); }
  };

  const doSeal = () => act(async () => {
    const envelope = await vc.sealForBuyer(vault.buyer_public_key, seal.value);
    const label = seal.label || vault.vault_fields.find((f) => f.key === seal.field_key)?.label_en || seal.field_key;
    await api.post(`/deals/${deal.deal_id}/vault/items`, { field_key: seal.field_key || "custom", label, envelope });
    setSeal({ field_key: "", label: "", value: "" });
  }, L("Secret sealed for the buyer", "ক্রেতার জন্য গোপন তথ্য সিল হয়েছে"));

  const doReveal = (item) => act(async () => {
    const { data } = await api.post(`/deals/${deal.deal_id}/vault/items/${item.item_id}/reveal`);
    const text = await vc.openEnvelope(deviceKey.private_jwk, data.envelope);
    setRevealed((r) => ({ ...r, [item.item_id]: text }));
    setTimeout(() => setRevealed((r) => { const n = { ...r }; delete n[item.item_id]; return n; }), HIDE_AFTER_MS);
  });

  return (
    <Shell L={L} badge={vault.requires_vault ? L("Required for this category", "এই বিভাগে আবশ্যক") : L("Optional", "ঐচ্ছিক")}>
      <p className="text-[11px] text-ink-muted mb-3">{L("End-to-end: encrypted in the browser to the buyer's device key, then encrypted again at rest. The server never sees plaintext. Every opening is logged.", "এন্ড-টু-এন্ড: ব্রাউজারে ক্রেতার ডিভাইস কী-তে এনক্রিপ্ট, তারপর সার্ভারে আবার এনক্রিপ্ট। সার্ভার কখনো প্লেইনটেক্সট দেখে না। প্রতিটি খোলা লগ হয়।")}</p>

      {/* key status */}
      <div className="rounded-xl border border-border bg-surface-elev p-3 text-sm" data-testid="vault-key-status">
        <div className="flex items-center gap-2 font-semibold"><KeyRound className="w-4 h-4 text-brand" />{L("Buyer's vault key", "ক্রেতার ভল্ট কী")}</div>
        {vault.has_key ? (
          <div className="mt-1 text-xs">
            <span className="font-mono" data-testid="vault-fingerprint">{vault.key_fingerprint}</span>
            <span className="text-ink-muted"> · {L("set", "সেট")} {vault.key_set_at?.slice(0, 10)}</span>
          </div>
        ) : <div className="mt-1 text-xs text-ink-muted">{L("Not set up yet.", "এখনো সেট আপ হয়নি।")}</div>}

        {myRole === "buyer" && !terminal && (
          <div className="mt-2 space-y-2">
            {!vault.has_key && (
              <Button size="sm" onClick={setupKey} data-testid="vault-setup-key" className="bg-brand hover:bg-brand-hover w-full"><Smartphone className="w-4 h-4 mr-1" />{L("Create vault key on this device", "এই ডিভাইসে ভল্ট কী তৈরি করুন")}</Button>
            )}
            {vault.has_key && keyMatches && (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1 text-state-pass-tx font-semibold" data-testid="vault-device-ok"><ShieldCheck className="w-3.5 h-3.5" />{L("This device holds the key", "এই ডিভাইসে কী আছে")}</span>
                <Button size="sm" variant="outline" onClick={() => vc.exportBackup(user.user_id, deal.deal_id)} data-testid="vault-export-key"><Download className="w-3.5 h-3.5 mr-1" />{L("Backup key", "ব্যাকআপ কী")}</Button>
              </div>
            )}
            {vault.has_key && !keyMatches && (
              <div className="rounded-lg border border-state-unk-bd bg-state-unk-bg p-2 text-xs text-state-unk-tx" data-testid="vault-device-missing">
                <div className="font-semibold">{L("This device does not hold the vault key.", "এই ডিভাইসে ভল্ট কী নেই।")}</div>
                <div className="mt-1">{L("Import the backup file you downloaded, or (only if nothing is sealed yet) create a new key.", "ডাউনলোড করা ব্যাকআপ ফাইল ইমপোর্ট করুন, অথবা (কিছু সিল না থাকলে) নতুন কী তৈরি করুন।")}</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => importKey(e.target.files?.[0])} data-testid="vault-import-file" />
                  <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} data-testid="vault-import-key"><Upload className="w-3.5 h-3.5 mr-1" />{L("Import backup", "ব্যাকআপ ইমপোর্ট")}</Button>
                  {vault.items.length === 0 && <Button size="sm" variant="outline" onClick={setupKey} data-testid="vault-reset-key">{L("Create new key", "নতুন কী তৈরি")}</Button>}
                </div>
              </div>
            )}
          </div>
        )}
        {myRole === "seller" && !vault.has_key && <div className="mt-1 text-[11px] text-ink-muted" data-testid="vault-waiting-key">{L("Waiting for the buyer to create their vault key before you can seal secrets.", "গোপন তথ্য সিল করার আগে ক্রেতার ভল্ট কী তৈরির অপেক্ষায়।")}</div>}
      </div>

      {/* seller: seal */}
      {myRole === "seller" && vault.seal_allowed && (
        <div className="mt-3 border border-dashed border-border rounded-xl p-3" data-testid="vault-seal-form">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1"><Lock className="w-3.5 h-3.5" />{L("Seal a secret for the buyer", "ক্রেতার জন্য গোপন তথ্য সিল করুন")}</div>
          <Select value={seal.field_key} onValueChange={(v) => setSeal({ ...seal, field_key: v, label: v === "custom" ? "" : (vault.vault_fields.find((f) => f.key === v)?.label_en || "") })}>
            <SelectTrigger data-testid="vault-field-select"><SelectValue placeholder={L("What is it?", "এটি কী?")} /></SelectTrigger>
            <SelectContent>
              {vault.vault_fields.map((f) => <SelectItem key={f.key} value={f.key}>{L(f.label_en, f.label_bn)}</SelectItem>)}
              <SelectItem value="custom">{L("Other…", "অন্যান্য…")}</SelectItem>
            </SelectContent>
          </Select>
          {seal.field_key === "custom" && <Input value={seal.label} onChange={(e) => setSeal({ ...seal, label: e.target.value })} placeholder={L("Label", "লেবেল")} className="mt-2" data-testid="vault-label-input" />}
          <Textarea value={seal.value} onChange={(e) => setSeal({ ...seal, value: e.target.value })} placeholder={L("Secret value — encrypted before it leaves this browser", "গোপন মান — ব্রাউজার ছাড়ার আগেই এনক্রিপ্টেড")} className="mt-2 font-mono" rows={2} data-testid="vault-secret-input" />
          <Button size="sm" onClick={doSeal} disabled={!seal.field_key || !seal.value || (seal.field_key === "custom" && !seal.label)} data-testid="vault-seal-btn" className="w-full mt-2 bg-brand hover:bg-brand-hover"><Lock className="w-4 h-4 mr-1" />{L("Encrypt & seal", "এনক্রিপ্ট ও সিল")}</Button>
        </div>
      )}
      {myRole === "seller" && vault.has_key && !vault.seal_allowed && !terminal && (
        <p className="mt-2 text-[11px] text-ink-muted" data-testid="vault-seal-locked">{L("Sealing opens once the deal is funded.", "ডিল ফান্ডেড হলে সিল করা যাবে।")}</p>
      )}

      {/* items */}
      <div className="mt-3 space-y-2" data-testid="vault-items">
        {vault.items.length === 0 && <p className="text-xs text-ink-muted">{L("Nothing sealed yet.", "এখনো কিছু সিল হয়নি।")}</p>}
        {vault.items.map((it) => (
          <div key={it.item_id} className="border border-border rounded-lg p-2.5 text-sm" data-testid={`vault-item-${it.item_id}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold">{revealed[it.item_id] ? <Unlock className="w-3.5 h-3.5 text-state-pass-tx" /> : <Lock className="w-3.5 h-3.5 text-ink-muted" />}{it.label}</div>
              <span className="text-[10px] font-mono text-ink-muted">{it.item_id} · {L("opened", "খোলা")} {it.reveal_count}×</span>
            </div>
            {myRole === "buyer" && !revealed[it.item_id] && (
              vault.reveal_allowed ? (
                keyMatches
                  ? <Button size="sm" variant="outline" onClick={() => doReveal(it)} data-testid={`vault-reveal-${it.item_id}`} className="mt-2"><Eye className="w-3.5 h-3.5 mr-1" />{L("Open (logged)", "খুলুন (লগ হবে)")}</Button>
                  : <p className="text-[11px] text-state-unk-tx mt-1">{L("Import your key backup on this device to open.", "খুলতে এই ডিভাইসে কী ব্যাকআপ ইমপোর্ট করুন।")}</p>
              ) : <p className="text-[11px] text-ink-muted mt-1" data-testid={`vault-locked-${it.item_id}`}>{L("Opens after the seller marks delivery.", "বিক্রেতা সরবরাহ চিহ্নিত করলে খুলবে।")}</p>
            )}
            {revealed[it.item_id] && (
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 bg-surface-elev border border-border rounded px-2 py-1.5 font-mono text-xs break-all select-all" data-testid={`vault-plaintext-${it.item_id}`}>{revealed[it.item_id]}</code>
                <button onClick={() => { navigator.clipboard?.writeText(revealed[it.item_id]); toast.success(L("Copied", "কপি হয়েছে")); }} className="text-ink-muted hover:text-brand" data-testid={`vault-copy-${it.item_id}`}><Copy className="w-4 h-4" /></button>
                <button onClick={() => setRevealed((r) => { const n = { ...r }; delete n[it.item_id]; return n; })} className="text-ink-muted hover:text-brand" data-testid={`vault-hide-${it.item_id}`}><EyeOff className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      {myRole !== "seller" && vault.access_log?.length > 0 && (
        <div className="mt-3" data-testid="vault-access-log">
          <div className="text-[11px] font-semibold uppercase text-ink-muted flex items-center gap-1 mb-1"><History className="w-3 h-3" />{L("Access log", "অ্যাক্সেস লগ")}</div>
          {[...vault.access_log].reverse().slice(0, 6).map((a, i) => <div key={i} className="text-[11px] font-mono text-ink-soft">{a.at.slice(5, 16).replace("T", " ")} · {a.label} ({a.item_id})</div>)}
        </div>
      )}
      {myRole === "reviewer" && <p className="mt-2 text-[11px] text-ink-muted">{L("Reviewers see metadata and the access log only — never the secrets.", "পর্যালোচক শুধু মেটাডেটা ও অ্যাক্সেস লগ দেখেন — গোপন তথ্য নয়।")}</p>}
    </Shell>
  );
}

function Shell({ L, badge, children }) {
  return (
    <section className="bg-surface-card rounded-2xl border border-border p-5" data-testid="vault-panel">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="font-heading font-bold flex items-center gap-2"><Lock className="w-4 h-4 text-brand" />{L("Secret delivery vault", "সিক্রেট ডেলিভারি ভল্ট")}</h2>
        {badge && <span className="text-[10px] font-bold uppercase bg-surface-elev border border-border px-2 py-0.5 rounded-full text-ink-soft">{badge}</span>}
      </div>
      {children}
    </section>
  );
}
