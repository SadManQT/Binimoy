import type { ReactNode } from "react";

export const metadata = { title: "বিনিময়" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
