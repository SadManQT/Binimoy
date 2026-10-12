"use client";

import { type FormEvent, useState } from "react";
import { authClient } from "../../lib/auth-client";

type Outcome = { error?: { message?: string } | null } | undefined;
const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  facebook: "Facebook",
  github: "GitHub",
};

export function LoginForm({
  providers,
  showDevHint,
  locale,
}: {
  providers: string[];
  showDevHint: boolean;
  locale: "bn" | "en";
}) {
  const L = (bn: string, en: string) => (locale === "en" ? en : bn);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);

  // Runs one sign-in step and reports what actually happened. A failure never
  // shows a success message.
  async function run(
    action: () => Promise<Outcome>,
    done: string,
    then?: () => void,
  ) {
    setBusy(true);
    setStatus(L("অপেক্ষা করুন…", "Please wait…"));
    try {
      const outcome = await action();
      if (outcome?.error) {
        setStatus(
          `${L("হয়নি", "Failed")}: ${outcome.error.message ?? L("অজানা সমস্যা", "unknown problem")}`,
        );
      } else {
        setStatus(done);
        then?.();
      }
    } catch {
      setStatus(
        L(
          "হয়নি: সার্ভারে পৌঁছানো যায়নি। আবার চেষ্টা করুন।",
          "Failed: could not reach the server. Try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  const field = (form: FormEvent<HTMLFormElement>, name: string) =>
    String(new FormData(form.currentTarget).get(name) ?? "").trim();
  const toAccount = () => window.location.assign("/account");
  const devHint = showDevHint
    ? L(
        " (লোকাল মোড: /dev/messages পাতায় দেখুন)",
        " (local mode: see /dev/messages)",
      )
    : "";

  return (
    <div className="auth-grid">
      <p role="status" aria-live="polite">
        {status}
      </p>

      <section aria-labelledby="pw">
        <h2 id="pw">{L("ইমেইল ও পাসওয়ার্ড", "Email and password")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const submitter = (e.nativeEvent as SubmitEvent)
              .submitter as HTMLButtonElement | null;
            const email = field(e, "email");
            const password = field(e, "password");
            if (submitter?.value === "signup") {
              const name = field(e, "name") || email;
              run(
                () => authClient.signUp.email({ name, email, password }),
                L("অ্যাকাউন্ট তৈরি হয়েছে।", "Account created."),
                toAccount,
              );
            } else {
              run(
                () => authClient.signIn.email({ email, password }),
                L("লগইন হয়েছে।", "Logged in."),
                toAccount,
              );
            }
          }}
        >
          <label>
            {L("নাম (নতুন অ্যাকাউন্টের জন্য)", "Name (for a new account)")}
            <input name="name" autoComplete="name" />
          </label>
          <label>
            {L("ইমেইল", "Email")}
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            {L("পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর)", "Password (at least 10 characters)")}
            <input
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="current-password"
            />
          </label>
          <button type="submit" value="signin" disabled={busy}>
            {L("লগইন", "Log in")}
          </button>
          <button type="submit" value="signup" disabled={busy}>
            {L("নতুন অ্যাকাউন্ট", "Create account")}
          </button>
        </form>
      </section>

      <section aria-labelledby="link">
        <h2 id="link">{L("ইমেইলে লগইন লিংক", "Login link by email")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const email = field(e, "email");
            run(
              () =>
                authClient.signIn.magicLink({ email, callbackURL: "/account" }),
              `${L("লিংক পাঠানো হয়েছে।", "Link sent.")}${devHint}`,
            );
          }}
        >
          <label>
            {L("ইমেইল", "Email")}
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <button type="submit" disabled={busy}>
            {L("লিংক পাঠান", "Send link")}
          </button>
        </form>
      </section>

      <section aria-labelledby="ecode">
        <h2 id="ecode">{L("ইমেইলে কোড", "Code by email")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const email = field(e, "email");
            const otp = field(e, "otp");
            if (!emailCodeSent) {
              run(
                () =>
                  authClient.emailOtp.sendVerificationOtp({
                    email,
                    type: "sign-in",
                  }),
                `${L("কোড পাঠানো হয়েছে।", "Code sent.")}${devHint}`,
                () => setEmailCodeSent(true),
              );
            } else {
              run(
                () => authClient.signIn.emailOtp({ email, otp }),
                L("লগইন হয়েছে।", "Logged in."),
                toAccount,
              );
            }
          }}
        >
          <label>
            {L("ইমেইল", "Email")}
            <input name="email" type="email" required autoComplete="email" />
          </label>
          {emailCodeSent && (
            <label>
              {L("কোড", "Code")}
              <input
                name="otp"
                inputMode="numeric"
                required
                autoComplete="one-time-code"
              />
            </label>
          )}
          <button type="submit" disabled={busy}>
            {emailCodeSent
              ? L("কোড দিয়ে লগইন", "Log in with code")
              : L("কোড পাঠান", "Send code")}
          </button>
        </form>
      </section>

      <section aria-labelledby="phone">
        <h2 id="phone">{L("ফোনে কোড", "Code by phone")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const phoneNumber = field(e, "phone");
            const code = field(e, "code");
            if (!phoneCodeSent) {
              run(
                () => authClient.phoneNumber.sendOtp({ phoneNumber }),
                `${L("কোড পাঠানো হয়েছে।", "Code sent.")}${devHint}`,
                () => setPhoneCodeSent(true),
              );
            } else {
              run(
                () => authClient.phoneNumber.verify({ phoneNumber, code }),
                L("লগইন হয়েছে।", "Logged in."),
                toAccount,
              );
            }
          }}
        >
          <label>
            {L(
              "ফোন নম্বর (যেমন +8801XXXXXXXXX)",
              "Phone number (like +8801XXXXXXXXX)",
            )}
            <input name="phone" type="tel" required autoComplete="tel" />
          </label>
          {phoneCodeSent && (
            <label>
              {L("কোড", "Code")}
              <input
                name="code"
                inputMode="numeric"
                required
                autoComplete="one-time-code"
              />
            </label>
          )}
          <button type="submit" disabled={busy}>
            {phoneCodeSent
              ? L("কোড দিয়ে লগইন", "Log in with code")
              : L("কোড পাঠান", "Send code")}
          </button>
        </form>
      </section>

      <section aria-labelledby="social">
        <h2 id="social">{L("অন্য অ্যাকাউন্ট দিয়ে", "With another account")}</h2>
        {providers.length === 0 ? (
          <p>
            {L(
              "এই পরিবেশে Google, Facebook বা GitHub লগইন এখনো চালু করা হয়নি।",
              "Google, Facebook and GitHub login are not set up in this environment yet.",
            )}
          </p>
        ) : (
          providers.map((provider) => (
            <button
              key={provider}
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    authClient.signIn.social({
                      provider,
                      callbackURL: "/account",
                    }),
                  L("অন্য সাইটে নেওয়া হচ্ছে…", "Taking you to the other site…"),
                )
              }
            >
              {L(
                `${PROVIDER_LABEL[provider] ?? provider} দিয়ে লগইন`,
                `Continue with ${PROVIDER_LABEL[provider] ?? provider}`,
              )}
            </button>
          ))
        )}
      </section>
    </div>
  );
}
