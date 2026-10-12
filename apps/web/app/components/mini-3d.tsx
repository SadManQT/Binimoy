"use client";

import { useEffect, useRef, useState } from "react";
import type { MiniKind } from "./mini-scene-three";

// A small 3D object beside a heading. Purely decorative: what it shows is
// always also written in the text next to it. Without WebGL, or when the
// visitor asked for reduced data, nothing is drawn and nothing is lost.
export function Mini3D({
  kind,
  value,
  className = "mini3d",
}: {
  kind: MiniKind;
  value?: number | null;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = host.current;
    const surface = canvas.current;
    if (!element || !surface) return;
    if (
      (navigator as { connection?: { saveData?: boolean } }).connection
        ?.saveData
    ) {
      return;
    }
    let dispose = () => {};
    let gone = false;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        watcher.disconnect();
        import("./mini-scene-three")
          .then(({ mountMini }) => {
            if (gone) return;
            dispose = mountMini(surface, element, {
              kind,
              value,
              reducedMotion: matchMedia("(prefers-reduced-motion: reduce)")
                .matches,
              onReady: () => setReady(true),
            });
          })
          .catch(() => {});
      },
      { rootMargin: "200px" },
    );
    watcher.observe(element);
    return () => {
      gone = true;
      watcher.disconnect();
      dispose();
    };
  }, [kind, value]);

  return (
    <div ref={host} className={className} data-ready={ready} aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
