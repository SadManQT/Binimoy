"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const EVERY_MS = 3000;
const LIVE_COOKIE = "live";

// Keeps an open page current. It asks the server for a pulse (`href`) and,
// when the pulse differs from the one this page was drawn with, re-reads the
// page in place: no reload, typed text and open panels stay.
export function LiveDeal({
  href,
  pulse,
  label,
  offline,
}: {
  href: string;
  pulse: string;
  label: string;
  offline: string;
}) {
  const router = useRouter();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // The re-read that brought this pulse has finished.
    document.cookie = `${LIVE_COOKIE}=; max-age=0; path=/`;
    let stopped = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(href, {
          cache: "no-store",
        });
        if (stopped) return;
        setOnline(response.ok);
        if (!response.ok) return;
        const now = (await response.json()).pulse as string;
        if (!stopped && now !== pulse) {
          // Tells the server this re-read was not the person opening the
          // page, so it must not count as showing them a notice (D.6).
          // The value names this page, so a page opened right afterwards is
          // not mistaken for a re-read.
          document.cookie = `${LIVE_COOKIE}=${encodeURIComponent(location.pathname)}; max-age=10; path=/; samesite=lax`;
          router.refresh();
        }
      } catch {
        if (!stopped) setOnline(false);
      }
    };
    const timer = setInterval(check, EVERY_MS);
    // Coming back to the tab should not wait for the next tick.
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [href, pulse, router]);

  return (
    <span className="live" data-online={online} data-testid="live">
      {online ? label : offline}
    </span>
  );
}
