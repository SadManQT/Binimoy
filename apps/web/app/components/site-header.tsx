import {
  Bell,
  Globe,
  Handshake,
  List,
  PencilSimpleLine,
  ShieldCheck,
  SignIn,
  Storefront,
  UserCircle,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import type { I18n } from "../../lib/i18n";
import type { Shell } from "../../lib/shell";
import { LangSwitch } from "./lang-switch";

// The mark: two arcs passing each other around a keyhole. An exchange, with
// something kept safe in the middle.
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M5 14a11 11 0 0 1 21-4.5"
        stroke="var(--blue)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M27 18a11 11 0 0 1-21 4.5"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <circle cx="16" cy="14.5" r="2.7" fill="var(--mint)" />
      <path
        d="M16 16v5"
        stroke="var(--mint)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SiteHeader({ shell, i18n }: { shell: Shell; i18n: I18n }) {
  const { t, locale, num } = i18n;
  const staff = shell.roles;
  // Every feature, in one list. The desktop bar shows the first four; the
  // phone menu shows all of them.
  const features = [
    { href: "/shops", label: t.nav.shops, icon: Storefront },
    { href: "/alerts", label: t.nav.alerts, icon: Warning, tone: "alert" },
    { href: "/research", label: t.nav.lookup, icon: Globe },
    { href: "/deals", label: t.nav.deals, icon: Handshake },
  ];
  const personal = shell.user
    ? [
        { href: "/notifications", label: t.nav.notices, icon: Bell },
        { href: "/account", label: t.nav.account, icon: UserCircle },
      ]
    : [{ href: "/login", label: t.nav.login, icon: SignIn }];
  const staffLinks = [
    ...(staff.includes("reviewer")
      ? [{ href: "/review", label: t.nav.review, icon: ShieldCheck }]
      : []),
    ...(staff.includes("moderator")
      ? [{ href: "/moderation", label: t.nav.moderation, icon: ShieldCheck }]
      : []),
  ];

  return (
    <header className="site-header">
      <div>
        <a className="brand" href="/" aria-label={t.brand}>
          <BrandMark />
          {t.brand}
        </a>
        <nav className="site-nav" aria-label={t.nav.label}>
          {[...features, ...staffLinks].map((item) => (
            <a
              key={item.href}
              href={item.href}
              data-tone={"tone" in item ? item.tone : undefined}
            >
              <item.icon size={18} aria-hidden="true" />
              {item.label}
            </a>
          ))}
        </nav>
        <div className="header-tools">
          <LangSwitch
            to={locale === "bn" ? "en" : "bn"}
            label={t.nav.language}
          />
          {personal.map((item) => (
            <a key={item.href} className="tool wide-only" href={item.href}>
              <item.icon size={18} aria-hidden="true" />
              {item.label}
              {item.href === "/notifications" && shell.unseen > 0 && (
                <span className="count">
                  {num(shell.unseen)}
                  <span className="sr-only">{t.nav.newCount}</span>
                </span>
              )}
            </a>
          ))}
          <a className="button wide-only" href="/community">
            {t.nav.write}
          </a>
          <details className="menu">
            <summary aria-label={t.nav.menu}>
              <List size={22} aria-hidden="true" />
            </summary>
            <nav aria-label={t.nav.menu}>
              <a href="/community">
                <PencilSimpleLine size={22} aria-hidden="true" />
                {t.nav.write}
              </a>
              {[...features, ...staffLinks, ...personal].map((item) => (
                <a key={item.href} href={item.href}>
                  <item.icon size={22} aria-hidden="true" />
                  {item.label}
                </a>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ shell, i18n }: { shell: Shell; i18n: I18n }) {
  const { t } = i18n;
  const columns = [
    {
      title: t.footer.check,
      links: [
        ["/shops", t.nav.shops],
        ["/alerts", t.nav.alerts],
        ["/research", t.nav.lookup],
      ],
    },
    {
      title: t.footer.share,
      links: [
        ["/community", t.nav.write],
        ["/community?type=negative", t.footer.report],
      ],
    },
    {
      title: t.footer.trade,
      links: [
        ["/deals/new", t.nav.deals],
        ["/deals", t.footer.myDeals],
      ],
    },
    {
      title: t.footer.you,
      links: shell.user
        ? [
            ["/notifications", t.nav.notices],
            ["/account", t.nav.account],
          ]
        : [["/login", t.nav.login]],
    },
  ];
  return (
    <footer className="site-footer">
      <div>
        <div className="about">
          <a className="brand" href="/">
            <BrandMark />
            {t.brand}
          </a>
          <p>{t.footer.about}</p>
        </div>
        <nav className="sitemap" aria-label={t.nav.label}>
          {columns.map((column) => (
            <div key={column.title}>
              <h2>{column.title}</h2>
              <ul>
                {column.links.map(([href, label]) => (
                  <li key={href}>
                    <a href={href}>{label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}
