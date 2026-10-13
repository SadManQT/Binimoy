"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const EVERY_MS = 3000;
const LIVE_COOKIE = "live";

// Keeps an open deal page current. It asks the server for the deal's pulse
// and, when the pulse differs from the one this page was drawn with, re-reads
// the page in place: no reload, typed text and open panels stay.
export function LiveDeal({
  dealId,
  pulse,
  label,
  offline,
}: {
  dealId: string;
  pulse: string;
  label: string;
  offline: string;
}) {
  const router = useRouter();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // The re-read that brought this pulse has finished.
    document.cookie = `${LIVE_COOKIE}=; max-age=0; path=${location.pathname}`;
    let stopped = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`/api/deals/${dealId}/pulse`, {
          cache: "no-store",
        });
        if (stopped) return;
        setOnline(response.ok);
        if (!response.ok) return;
        const now = (await response.json()).pulse as string;
        if (!stopped && now !== pulse) {
          // Tells the server this re-read was not the person opening the
          // page, so it must not count as showing them a notice (D.6).
          document.cookie = `${LIVE_COOKIE}=1; max-age=10; path=${location.pathname}; samesite=lax`;
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
  }, [dealId, pulse, router]);

  return (
    <span className="live" data-online={online} data-testid="live">
      {online ? label : offline}
    </span>
  );
}
