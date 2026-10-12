"use client";

import { Translate } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";

// Switches language and comes back to the same page.
export function LangSwitch({ to, label }: { to: "bn" | "en"; label: string }) {
  const pathname = usePathname();
  return (
    <a
      className="tool"
      href={`/api/lang?to=${to}&next=${encodeURIComponent(pathname)}`}
      hrefLang={to}
      lang={to}
      data-testid="lang-switch"
    >
      <Translate size={18} aria-hidden="true" />
      {label}
    </a>
  );
}
