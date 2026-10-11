import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck, Search, Handshake, Gavel, LogOut, Languages, LayoutDashboard } from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

export function LanguageToggle() {
  const { lang, toggle } = useLang();
  return (
    <button
      onClick={toggle}
      data-testid="bilingual-language-toggle"
      className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10 transition-colors"
      title="Bangla ⇄ English"
    >
      <Languages className="w-3.5 h-3.5" />
      <span className={lang === "bn" ? "opacity-50" : ""}>EN</span>
      <span className="opacity-40">/</span>
      <span className={`font-bangla ${lang === "en" ? "opacity-50" : ""}`}>বাং</span>
    </button>
  );
}

export default function Layout({ children }) {
  const { t, L } = useLang();
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const isReviewer = user && (user.role === "reviewer" || user.role === "admin");

  const links = [
    { to: "/home", label: L("Home", "হোম"), icon: LayoutDashboard },
    { to: "/research", label: t("research"), icon: Search },
    { to: "/deals", label: t("myDeals"), icon: Handshake },
    ...(isReviewer ? [{ to: "/moderation", label: t("moderation"), icon: Gavel }] : []),
  ];

  const onLogout = async () => { await logout(); nav("/login"); };

  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      <header className="sticky top-0 z-50 bg-brand text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link to="/home" className="flex items-center gap-2.5 shrink-0" data-testid="brand-home-link">
            <div className="w-9 h-9 rounded-lg bg-brand-teal grid place-items-center font-heading font-extrabold text-sm">লে</div>
            <div className="leading-tight">
              <div className="font-heading font-extrabold text-[15px]">{t("appName")}</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => {
              const active = loc.pathname.startsWith(l.to);
              const Icon = l.icon;
              return (
                <Link key={l.to} to={l.to} data-testid={`nav-${l.to.slice(1)}`}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${active ? "bg-white/15" : "hover:bg-white/10 text-white/85"}`}>
                  <Icon className="w-4 h-4" /> {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <LanguageToggle />
            {user && (
              <div className="hidden sm:flex items-center gap-2 pl-2">
                <span className="text-xs font-semibold bg-white/10 rounded-full px-2.5 py-1 capitalize" data-testid="user-role-pill">
                  {user.name} · {user.role}
                </span>
                <button onClick={onLogout} data-testid="logout-btn" className="p-2 rounded-lg hover:bg-white/10" title={t("logout")}>
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
        {/* mobile nav */}
        <div className="md:hidden border-t border-white/10 flex overflow-x-auto">
          {links.map((l) => {
            const active = loc.pathname.startsWith(l.to);
            const Icon = l.icon;
            return (
              <Link key={l.to} to={l.to} className={`flex-1 min-w-max flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active ? "bg-white/15" : "text-white/80"}`}>
                <Icon className="w-4 h-4" /> {l.label}
              </Link>
            );
          })}
        </div>
      </header>

      <main className="flex-1 w-full">{children}</main>

      <footer className="border-t border-border bg-surface-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-brand-teal" />
            {L("Money is simulated (mock) in Phase 1 — nothing real is charged.", "ফেজ ১-এ টাকা সিমুলেটেড (মক) — বাস্তবে কিছু কাটা হয় না।")}
          </span>
          <a href="/progress.html" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-tealdark underline" data-testid="progress-tracker-link">
            {L("Build progress tracker", "বিল্ড প্রোগ্রেস ট্র্যাকার")} →
          </a>
        </div>
      </footer>
    </div>
  );
}
