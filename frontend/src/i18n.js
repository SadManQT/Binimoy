import React, { createContext, useContext, useState, useCallback } from "react";

const DICT = {
  en: {
    appName: "Lenden Prohori",
    tagline: "Safe deals. Honest records.",
    research: "Research", myDeals: "My Deals", moderation: "Moderation",
    login: "Sign in", logout: "Sign out", register: "Create account",
    email: "Email", password: "Password", name: "Full name",
    googleSignin: "Continue with Google",
    heroTitle: "Deal with confidence. Verify before you trust.",
    heroSub: "An AI-monitored escrow workspace plus a public research space to look up people and businesses before you deal with them. Money is simulated in Phase 1.",
    getStarted: "Get started", exploreResearch: "Explore research",
    searchSubject: "Search a person or business…",
    positive: "Positive", negative: "Negative", neutral: "Neutral", resolution: "Resolution",
    createDeal: "Create a deal", openDeal: "Open",
    loading: "Loading…", empty: "Nothing here yet.", retry: "Retry",
    aiSuggested: "AI Suggested", monitored: "AI-monitored",
    held: "In hold", release: "Release to seller", refund: "Refund to buyer", split: "Propose split",
    dispute: "Open dispute", receipt: "Receipt",
    pass: "PASS", fail: "FAIL", unknown: "UNKNOWN",
  },
  bn: {
    appName: "লেনদেন প্রহরী",
    tagline: "নিরাপদ লেনদেন। সৎ রেকর্ড।",
    research: "গবেষণা", myDeals: "আমার ডিল", moderation: "মডারেশন",
    login: "সাইন ইন", logout: "সাইন আউট", register: "অ্যাকাউন্ট খুলুন",
    email: "ইমেইল", password: "পাসওয়ার্ড", name: "পুরো নাম",
    googleSignin: "গুগল দিয়ে চালিয়ে যান",
    heroTitle: "আস্থার সাথে লেনদেন করুন। বিশ্বাসের আগে যাচাই করুন।",
    heroSub: "এআই-পর্যবেক্ষিত এসক্রো ওয়ার্কস্পেস এবং লেনদেনের আগে মানুষ ও ব্যবসা যাচাইয়ের পাবলিক গবেষণা স্পেস। ফেজ ১-এ টাকা সিমুলেটেড।",
    getStarted: "শুরু করুন", exploreResearch: "গবেষণা দেখুন",
    searchSubject: "একজন ব্যক্তি বা ব্যবসা খুঁজুন…",
    positive: "ইতিবাচক", negative: "নেতিবাচক", neutral: "নিরপেক্ষ", resolution: "সমাধান",
    createDeal: "নতুন ডিল", openDeal: "খুলুন",
    loading: "লোড হচ্ছে…", empty: "এখনো কিছু নেই।", retry: "আবার চেষ্টা",
    aiSuggested: "এআই প্রস্তাবিত", monitored: "এআই-পর্যবেক্ষিত",
    held: "হোল্ডে", release: "বিক্রেতাকে ছাড়ুন", refund: "ক্রেতাকে ফেরত", split: "ভাগাভাগি প্রস্তাব",
    dispute: "বিরোধ খুলুন", receipt: "রসিদ",
    pass: "PASS", fail: "FAIL", unknown: "UNKNOWN",
  },
};

const LangContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem("lp_lang") || "en");
  const setLang = useCallback((l) => { localStorage.setItem("lp_lang", l); setLangState(l); }, []);
  const toggle = useCallback(() => setLang(lang === "en" ? "bn" : "en"), [lang, setLang]);
  const t = useCallback((key) => (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key, [lang]);
  const L = useCallback((en, bn) => (lang === "bn" ? bn : en), [lang]);
  return (
    <LangContext.Provider value={{ lang, setLang, toggle, t, L }}>
      <div lang={lang} className={lang === "bn" ? "font-bangla" : ""}>{children}</div>
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
