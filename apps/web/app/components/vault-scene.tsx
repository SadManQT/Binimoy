"use client";

import { useEffect, useRef, useState } from "react";

// The 3D strongbox, with a still image underneath it.
//
// The image is what everyone gets first, and all that some get: visitors who
// asked for reduced data, browsers without WebGL, and anyone for whom the
// model fails to load. The scene itself starts only when it is about to be
// seen. It is decoration: every fact on the page is in the text beside it.
export function VaultScene({
  story,
  poster,
}: {
  // The id of a list whose items drive the scene as they scroll past.
  story?: string;
  poster: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = host.current;
    const surface = canvas.current;
    if (!element || !surface) return;
    const connection = (navigator as { connection?: { saveData?: boolean } })
      .connection;
    if (connection?.saveData) return;

    let dispose = () => {};
    let gone = false;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        watcher.disconnect();
        import("./vault-scene-three")
          .then(({ mountScene }) => {
            if (gone) return;
            dispose = mountScene(surface, element, {
              steps: story
                ? [
                    ...document.querySelectorAll<HTMLElement>(
                      `#${CSS.escape(story)} > li`,
                    ),
                  ]
                : [],
              reducedMotion: matchMedia("(prefers-reduced-motion: reduce)")
                .matches,
              onReady: () => setReady(true),
            });
          })
          // No WebGL, or the code did not arrive: the still image stays.
          .catch(() => {});
      },
      { rootMargin: "300px" },
    );
    watcher.observe(element);
    return () => {
      gone = true;
      watcher.disconnect();
      dispose();
    };
  }, [story]);

  return (
    <div ref={host} data-ready={ready} data-testid="vault-scene">
      {/* biome-ignore lint/performance/noImgElement: a fixed local file that must show before any script runs */}
      <img
        src={poster}
        alt="পিতলের কোনা লাগানো একটি সিন্দুক"
        width={900}
        height={1263}
        decoding="async"
      />
      {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas takes no focus; the image beside it carries the description */}
      <canvas ref={canvas} aria-hidden="true" />
    </div>
  );
}
