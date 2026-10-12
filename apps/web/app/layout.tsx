import "./globals.css";
import type { Metadata, Viewport } from "next";
import {
  Anek_Bangla,
  Hind_Siliguri,
  Plus_Jakarta_Sans,
} from "next/font/google";
import type { ReactNode } from "react";
import { getI18n } from "../lib/i18n";
import { getShell } from "../lib/shell";
import { SiteFooter, SiteHeader } from "./components/site-header";
import { TiltEffects } from "./components/tilt";

// Bangla: a display face with character for headings, and a body face chosen
// for long reading at small sizes. English: one clean face for both.
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
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t.brand,
    description: `${t.home.title} ${t.home.titleMark}. ${t.home.sub}`,
  };
}
export const viewport: Viewport = { themeColor: "#070b18" };

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [shell, i18n] = await Promise.all([getShell(), getI18n()]);
  return (
    <html
      lang={i18n.locale}
      className={`${anek.variable} ${hind.variable} ${jakarta.variable}`}
    >
      <body>
        <a className="skip" href="#content">
          {i18n.t.skip}
        </a>
        {/* INV-15: stated on every page, in words. */}
        <p className="testbar" data-testid="testbar">
          {i18n.t.testbar}
        </p>
        <SiteHeader shell={shell} i18n={i18n} />
        <div id="content" className="content">
          {children}
        </div>
        <SiteFooter shell={shell} i18n={i18n} />
        <TiltEffects />
      </body>
    </html>
  );
}
