import { loadConfig } from "@lp/contracts";
import { getI18n } from "../../lib/i18n";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: `${t.nav.login} · ${t.brand}` };
}

export default async function LoginPage() {
  const config = loadConfig(process.env);
  const { locale, t } = await getI18n();
  return (
    <main className="wide">
      <h1>{t.nav.login}</h1>
      <p>
        {locale === "en"
          ? "Pick any one way to sign in."
          : "যেকোনো একটা উপায় বেছে নিন।"}
      </p>
      <LoginForm
        providers={Object.keys(config.social)}
        showDevHint={config.APP_ENV === "local"}
        locale={locale}
      />
    </main>
  );
}
