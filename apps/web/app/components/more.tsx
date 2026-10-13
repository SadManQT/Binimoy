import type { ReactNode } from "react";
import { getI18n } from "../../lib/i18n";

// The longer explanation behind a short line. Nothing is removed from the
// page; it is one tap away instead of in the way.
export async function More({ children }: { children: ReactNode }) {
  const { L } = await getI18n();
  return (
    <details className="more">
      <summary>{L("আরও জানুন", "Learn more")}</summary>
      <p>{children}</p>
    </details>
  );
}
