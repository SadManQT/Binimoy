import { loadConfig } from "@lp/contracts";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "লগইন · বিনিময়" };

export default function LoginPage() {
  const config = loadConfig(process.env);
  return (
    <main>
      <h1>লগইন</h1>
      <p>যেকোনো একটি উপায় বেছে নিন।</p>
      <LoginForm
        providers={Object.keys(config.social)}
        showDevHint={config.APP_ENV === "local"}
      />
    </main>
  );
}
