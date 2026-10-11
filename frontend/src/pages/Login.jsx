import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LanguageToggle } from "@/components/Layout";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function Login() {
  const { t, L } = useLang();
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register(form.email, form.password, form.name);
      nav("/home");
    } catch (err) {
      setError(apiErr(err));
    } finally { setBusy(false); }
  };

  const googleSignin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/home";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-surface-base">
      <div className="hidden lg:flex flex-col justify-between bg-brand text-white p-10">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-brand-teal grid place-items-center font-heading font-extrabold text-sm">লে</div>
          <span className="font-heading font-extrabold">{t("appName")}</span>
        </Link>
        <div>
          <h2 className="font-heading font-extrabold text-3xl leading-tight">{t("heroTitle")}</h2>
          <p className="mt-4 text-white/75 max-w-md leading-relaxed">{t("heroSub")}</p>
        </div>
        <p className="text-xs text-white/50 font-mono">Phase 1 · money is simulated (mock)</p>
      </div>

      <div className="flex flex-col">
        <div className="flex items-center justify-end p-4">
          <div className="bg-brand rounded-full"><LanguageToggle /></div>
        </div>
        <div className="flex-1 grid place-items-center px-6 pb-16">
          <div className="w-full max-w-sm">
            <h1 className="font-heading font-extrabold text-2xl mb-1">{mode === "login" ? t("login") : t("register")}</h1>
            <p className="text-sm text-ink-muted mb-6">{L("Welcome to Lenden Prohori.", "লেনদেন প্রহরীতে স্বাগতম।")}</p>

            <Tabs value={mode} onValueChange={(v) => { setMode(v); setError(""); }} className="mb-5">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="login" data-testid="tab-login">{t("login")}</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">{t("register")}</TabsTrigger>
              </TabsList>
            </Tabs>

            {error && (
              <div className="flex items-start gap-2 text-sm text-state-fail-tx bg-state-fail-bg border border-state-fail-bd rounded-lg p-3 mb-4" data-testid="auth-error">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <Label htmlFor="name">{t("name")}</Label>
                  <Input id="name" data-testid="name-input" value={form.name} onChange={upd("name")} required className="mt-1" />
                </div>
              )}
              <div>
                <Label htmlFor="email">{t("email")}</Label>
                <Input id="email" type="email" data-testid="email-input" value={form.email} onChange={upd("email")} required className="mt-1" placeholder="you@example.com" />
              </div>
              <div>
                <Label htmlFor="password">{t("password")}</Label>
                <Input id="password" type="password" data-testid="password-input" value={form.password} onChange={upd("password")} required className="mt-1" />
              </div>
              <Button type="submit" disabled={busy} data-testid="auth-submit-btn" className="w-full bg-brand hover:bg-brand-hover h-11 rounded-lg">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === "login" ? t("login") : t("register"))}
              </Button>
            </form>

            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-ink-muted">{L("or", "অথবা")}</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button variant="outline" onClick={googleSignin} data-testid="google-signin-btn" className="w-full h-11 rounded-lg border-border bg-white">
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
              {t("googleSignin")}
            </Button>

            <p className="mt-6 text-xs text-ink-muted text-center font-mono">
              demo: buyer@lendenprohori.com · Buyer@12345
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
