import React from "react";
import { Link } from "react-router-dom";
import { Search, Handshake, ArrowRight, ShieldCheck, Gavel } from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const { t, L } = useLang();
  const { user } = useAuth();
  const isReviewer = user && (user.role === "reviewer" || user.role === "admin");

  const Card = ({ to, icon: Icon, title, desc, cta, testid }) => (
    <Link to={to} data-testid={testid}
      className="group relative bg-surface-card rounded-2xl border border-border p-7 hover:border-brand-teal hover:shadow-lg transition-all overflow-hidden">
      <div className="w-12 h-12 rounded-xl bg-brand grid place-items-center mb-5">
        <Icon className="w-6 h-6 text-white" />
      </div>
      <h3 className="font-heading font-extrabold text-xl">{title}</h3>
      <p className="mt-2 text-sm text-ink-soft leading-relaxed">{desc}</p>
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-brand-tealdark">
        {cta} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </span>
    </Link>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8 animate-fade-up">
        <p className="text-sm text-ink-muted">{L("Signed in as", "সাইন ইন করেছেন")} <span className="font-semibold text-ink">{user?.name}</span></p>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight mt-1">
          {L("What would you like to do?", "আপনি কী করতে চান?")}
        </h1>
      </div>

      <div className="grid md:grid-cols-2 gap-5 max-w-4xl">
        <Card to="/research" icon={Search} testid="home-research-card"
          title={t("research")}
          desc={L("Look up a person or business, read grouped reports with evidence, compare two subjects, and submit your own report.", "কোনো ব্যক্তি বা ব্যবসা খুঁজুন, প্রমাণসহ গ্রুপ করা রিপোর্ট পড়ুন, দুটি বিষয় তুলনা করুন এবং নিজের রিপোর্ট জমা দিন।")}
          cta={t("exploreResearch")} />
        <Card to="/deals" icon={Handshake} testid="home-deals-card"
          title={t("myDeals")}
          desc={L("Create an escrow deal, agree terms, fund the hold, deliver, inspect and settle fairly — or open a dispute.", "এসক্রো ডিল তৈরি করুন, শর্তে একমত হন, হোল্ডে ফান্ড দিন, সরবরাহ ও পরিদর্শন করে ন্যায্যভাবে নিষ্পত্তি করুন — বা বিরোধ খুলুন।")}
          cta={t("createDeal")} />
      </div>

      {isReviewer && (
        <div className="mt-5 max-w-4xl">
          <Link to="/moderation" data-testid="home-moderation-card"
            className="flex items-center gap-4 bg-brand/5 rounded-2xl border border-brand/15 p-5 hover:bg-brand/10 transition-colors">
            <div className="w-11 h-11 rounded-xl bg-brand grid place-items-center"><Gavel className="w-5 h-5 text-white" /></div>
            <div className="flex-1">
              <h3 className="font-heading font-bold">{t("moderation")}</h3>
              <p className="text-sm text-ink-soft">{L("Review disputes and moderate community reports.", "বিরোধ পর্যালোচনা ও কমিউনিটি রিপোর্ট মডারেট করুন।")}</p>
            </div>
            <ArrowRight className="w-5 h-5 text-brand" />
          </Link>
        </div>
      )}

      <div className="mt-10 flex items-start gap-2.5 text-sm text-ink-soft bg-surface-elev border border-border rounded-xl p-4 max-w-4xl">
        <ShieldCheck className="w-5 h-5 text-brand-teal mt-0.5 shrink-0" />
        <p>{L("All amounts are in BDT and shown exactly. Money is simulated in Phase 1 — nothing real is charged. Our assistant proposes guidance, but every money and permission decision follows fixed policy rules.", "সব পরিমাণ BDT-তে এবং হুবহু দেখানো হয়। ফেজ ১-এ টাকা সিমুলেটেড — বাস্তবে কিছু কাটা হয় না। আমাদের সহকারী পরামর্শ দেয়, কিন্তু প্রতিটি টাকা ও অনুমতির সিদ্ধান্ত নির্দিষ্ট নীতি অনুসরণ করে।")}</p>
      </div>
    </div>
  );
}
