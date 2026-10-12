"use client";

import { useEffect } from "react";

// Cards marked data-tilt lean toward the pointer, with a light that follows
// it. One listener for the page; touch devices and reduced motion get none.
export function TiltEffects() {
  useEffect(() => {
    if (
      !matchMedia("(hover: hover) and (pointer: fine)").matches ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let current: HTMLElement | null = null;
    const reset = (element: HTMLElement) => {
      element.style.removeProperty("--rx");
      element.style.removeProperty("--ry");
    };
    const move = (event: PointerEvent) => {
      const card =
        (event.target as Element | null)?.closest<HTMLElement>("[data-tilt]") ??
        null;
      if (current && current !== card) reset(current);
      current = card;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      card.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
      card.style.setProperty("--ry", `${((x - 0.5) * 9).toFixed(2)}deg`);
      card.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
      card.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
  return null;
}
