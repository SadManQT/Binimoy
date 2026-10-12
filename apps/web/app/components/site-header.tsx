import type { Shell } from "../../lib/shell";

// The mark: two arcs passing each other around a keyhole. Exchange, with
// something kept safe in the middle.
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M5 14a11 11 0 0 1 21-4.5"
        stroke="var(--teal)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M27 18a11 11 0 0 1-21 4.5"
        stroke="var(--text)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="16" cy="14.5" r="2.6" fill="var(--teal)" />
      <path
        d="M16 16v5"
        stroke="var(--teal)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SiteHeader({ shell }: { shell: Shell }) {
  const staff = shell.roles;
  return (
    <header className="site-header">
      <div>
        <a className="brand" href="/" aria-label="বিনিময়: প্রথম পাতা">
          <BrandMark />
          বিনিময়
        </a>
        <nav className="site-nav" aria-label="প্রধান">
          <a href="/shops">দোকান</a>
          <a href="/alerts">সতর্কতা</a>
          <a href="/research">ওয়েবে খোঁজ</a>
          <a href="/deals">ডিল</a>
          {staff.includes("reviewer") && <a href="/review">পর্যালোচনা</a>}
          {staff.includes("moderator") && <a href="/moderation">মডারেশন</a>}
          {shell.user ? (
            <>
              <a href="/notifications">
                নোটিশ
                {shell.unseen > 0 && (
                  <span className="count">
                    {shell.unseen.toLocaleString("bn-BD")}
                    <span className="sr-only"> টি নতুন</span>
                  </span>
                )}
              </a>
              <a href="/account">অ্যাকাউন্ট</a>
            </>
          ) : (
            <a href="/login">লগইন</a>
          )}
          <a className="cta" href="/community">
            অভিজ্ঞতা লিখুন
          </a>
        </nav>
      </div>
    </header>
  );
}
