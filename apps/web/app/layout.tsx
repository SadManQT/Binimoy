import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Anek_Bangla, Hind_Siliguri } from "next/font/google";
import type { ReactNode } from "react";
import { getShell } from "../lib/shell";
import { SiteHeader } from "./components/site-header";

// Bengali first: a display face with character for headings, and a body face
// chosen for long reading at small sizes. Both carry Latin for mixed text.
const anek = Anek_Bangla({
  subsets: ["bengali", "latin"],
  variable: "--font-anek",
  display: "swap",
});
const hind = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-hind",
  display: "swap",
});

export const metadata: Metadata = {
  title: "বিনিময়",
  description:
    "ডিজিটাল পণ্যের দোকান ও বিক্রেতা সম্পর্কে অন্যদের অভিজ্ঞতা, প্রকাশিত অভিযোগ ও সতর্কতা। পরীক্ষামূলক সংস্করণ।",
};
export const viewport: Viewport = { themeColor: "#0a1013" };

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const shell = await getShell();
  return (
    <html lang="bn" className={`${anek.variable} ${hind.variable}`}>
      <body>
        <a className="skip" href="#content">
          মূল অংশে যান
        </a>
        {/* INV-15: stated on every page, in words. */}
        <p className="testbar" data-testid="testbar">
          পরীক্ষামূলক সংস্করণ। এখানে কোনো আসল টাকা লেনদেন হয় না, এবং বিনিময় কোনো দোকানকে
          যাচাই বা সুপারিশ করে না।
        </p>
        <SiteHeader shell={shell} />
        <div id="content" className="content">
          {children}
        </div>
        <footer className="site-footer">
          <div>
            <p>
              বিনিময় অন্যদের লেখা অভিজ্ঞতা ও অভিযোগ দেখায়। প্রকাশিত লেখা লেখকের নিজের
              বক্তব্য; প্রকাশ মানে বিনিময় ঘটনাটি সত্য বলে যাচাই করেছে, তা নয়।
            </p>
            <p>
              <a href="/shops">দোকান</a> · <a href="/alerts">সতর্কতা</a> ·{" "}
              <a href="/community">অভিজ্ঞতা লিখুন</a> · <a href="/deals">ডিল</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
