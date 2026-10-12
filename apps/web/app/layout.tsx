import type { ReactNode } from "react";

// ponytail: bare readable defaults. The real visual system arrives with LP-014.
const CSS = `
label { display: block; margin: 0.5rem 0; }
input { display: block; width: 100%; min-height: 44px; font: inherit; padding: 0.4rem; box-sizing: border-box; }
button { min-height: 44px; font: inherit; padding: 0.4rem 0.9rem; margin: 0.4rem 0.4rem 0.4rem 0; }
section { border-top: 1px solid #8884; padding: 0.5rem 0 1rem; }
:focus-visible { outline: 3px solid #0a7; outline-offset: 2px; }
`;

export const metadata = { title: "বিনিময়" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <body
        style={{
          maxWidth: "40rem",
          margin: "0 auto",
          padding: "1rem",
          fontFamily: "system-ui, sans-serif",
          lineHeight: 1.6,
        }}
      >
        <style>{CSS}</style>
        {children}
      </body>
    </html>
  );
}
