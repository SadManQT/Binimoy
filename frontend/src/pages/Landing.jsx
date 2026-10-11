import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Search, Handshake, ArrowRight, ScrollText, Scale, Eye } from "lucide-react";
import { useLang } from "@/i18n";
import { LanguageToggle } from "@/components/Layout";
import { Button } from "@/components/ui/button";

export default function Landing() {
  const { t, L } = useLang();
  const features = [
    { icon: ScrollText, en: "Dual-consent agreements", bn: "দ্বৈত-সম্মতি চুক্তি", de: L("Both parties accept the same immutable terms before any money moves.", "টাকা নড়ার আগে উভয় পক্ষ একই অপরিবর্তনীয় শর্ত মানে।") },
    { icon: Eye, en: "AI-monitored deal room", bn: "এআই-পর্যবেক্ষিত ডিল রুম", de: L("A guided workspace with a completion map and an honest audit trail.", "সম্পন্ন-ম্যাপ ও সৎ অডিট ট্রেইলসহ গাইডেড ওয়ার্কস্পেস।") },
    { icon: Scale, en: "Fair settlement & disputes", bn: "ন্যায্য নিষ্পত্তি ও বিরোধ", de: L("Release, refund, split or a reviewed outcome — each with the right consent.", "ছাড়, ফেরত, ভাগাভাগি বা পর্যালোচিত সিদ্ধান্ত — সঠিক সম্মতিসহ।") },
  ];
  return (
    <div className="min-h-screen bg-surface-base">
      <header className="bg-brand text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-brand-teal grid place-items-center font-heading font-extrabold text-sm">লে</div>
            <span className="font-heading font-extrabold text-[15px]">{t("appName")}</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <Link to="/login"><Button data-testid="header-signin-btn" className="bg-brand-teal hover:bg-brand-tealdark text-white rounded-full h-9">{t("login")}</Button></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-brand text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider bg-white/10 rounded-full px-3 py-1.5 mb-5">
              <ShieldCheck className="w-4 h-4 text-brand-teal" /> {t("tagline")}
            </span>
            <h1 className="font-heading font-extrabold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] tracking-tight">
              {t("heroTitle")}
            </h1>
            <p className="mt-5 text-white/80 text-base sm:text-lg max-w-xl leading-relaxed">{t("heroSub")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login">
                <Button data-testid="hero-getstarted-btn" className="bg-brand-teal hover:bg-brand-tealdark text-white rounded-full h-12 px-6 text-base">
                  {t("getStarted")} <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" data-testid="hero-research-btn" className="rounded-full h-12 px-6 text-base bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white">
                  <Search className="w-4 h-4 mr-1" /> {t("exploreResearch")}
                </Button>
              </Link>
            </div>
          </div>
          <div className="relative animate-fade-up" style={{ animationDelay: "120ms" }}>
            <img
              src="https://images.unsplash.com/photo-1681505531034-8d67054e07f6?crop=entropy&cs=srgb&fm=jpg&q=85&w=900"
              alt="Dual-consent agreement over a paper contract"
              className="rounded-2xl border border-white/15 shadow-2xl w-full object-cover aspect-[4/3]"
            />
            <div className="absolute -bottom-5 -left-3 bg-surface-card text-ink rounded-xl shadow-xl border border-border p-4 w-56">
              <div className="text-[11px] text-ink-muted font-semibold">{L("In neutral hold", "নিরপেক্ষ হোল্ডে")}</div>
              <div className="font-mono font-bold text-xl tracking-tight">৳ 5,000</div>
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold font-mono bg-state-unk-bg border border-state-unk-bd text-state-unk-tx px-1.5 py-0.5 rounded">UNKNOWN · 4</div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <div key={i} className="bg-surface-card rounded-2xl border border-border p-6 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-xl bg-brand/5 grid place-items-center mb-4">
                <f.icon className="w-5 h-5 text-brand" />
              </div>
              <h3 className="font-heading font-bold text-lg">{L(f.en, f.bn)}</h3>
              <p className="mt-2 text-sm text-ink-soft leading-relaxed">{f.de}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <a href="/progress.html" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-tealdark underline">
            {L("See the live build progress tracker", "লাইভ বিল্ড প্রোগ্রেস ট্র্যাকার দেখুন")} →
          </a>
        </div>
      </section>
    </div>
  );
}
