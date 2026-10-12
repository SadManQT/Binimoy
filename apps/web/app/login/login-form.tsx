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
}: {
  providers: string[];
  showDevHint: boolean;
}) {
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
    setStatus("অপেক্ষা করুন…");
    try {
      const outcome = await action();
      if (outcome?.error) {
        setStatus(`হয়নি: ${outcome.error.message ?? "অজানা সমস্যা"}`);
      } else {
        setStatus(done);
        then?.();
      }
    } catch {
      setStatus("হয়নি: সার্ভারে পৌঁছানো যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  const field = (form: FormEvent<HTMLFormElement>, name: string) =>
    String(new FormData(form.currentTarget).get(name) ?? "").trim();
  const toAccount = () => window.location.assign("/account");
  const devHint = showDevHint ? " (লোকাল মোড: /dev/messages পাতায় দেখুন)" : "";

  return (
    <div className="auth-grid">
      <p role="status" aria-live="polite">
        {status}
      </p>

      <section aria-labelledby="pw">
        <h2 id="pw">ইমেইল ও পাসওয়ার্ড</h2>
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
                "অ্যাকাউন্ট তৈরি হয়েছে।",
                toAccount,
              );
            } else {
              run(
                () => authClient.signIn.email({ email, password }),
                "লগইন হয়েছে।",
                toAccount,
              );
            }
          }}
        >
          <label>
            নাম (নতুন অ্যাকাউন্টের জন্য)
            <input name="name" autoComplete="name" />
          </label>
          <label>
            ইমেইল
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর)
            <input
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="current-password"
            />
          </label>
          <button type="submit" value="signin" disabled={busy}>
            লগইন
          </button>
          <button type="submit" value="signup" disabled={busy}>
            নতুন অ্যাকাউন্ট
          </button>
        </form>
      </section>

      <section aria-labelledby="link">
        <h2 id="link">ইমেইলে লগইন লিংক</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const email = field(e, "email");
            run(
              () =>
                authClient.signIn.magicLink({ email, callbackURL: "/account" }),
              `লিংক পাঠানো হয়েছে।${devHint}`,
            );
          }}
        >
          <label>
            ইমেইল
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <button type="submit" disabled={busy}>
            লিংক পাঠান
          </button>
        </form>
      </section>

      <section aria-labelledby="ecode">
        <h2 id="ecode">ইমেইলে কোড</h2>
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
                `কোড পাঠানো হয়েছে।${devHint}`,
                () => setEmailCodeSent(true),
              );
            } else {
              run(
                () => authClient.signIn.emailOtp({ email, otp }),
                "লগইন হয়েছে।",
                toAccount,
              );
            }
          }}
        >
          <label>
            ইমেইল
            <input name="email" type="email" required autoComplete="email" />
          </label>
          {emailCodeSent && (
            <label>
              কোড
              <input
                name="otp"
                inputMode="numeric"
                required
                autoComplete="one-time-code"
              />
            </label>
          )}
          <button type="submit" disabled={busy}>
            {emailCodeSent ? "কোড দিয়ে লগইন" : "কোড পাঠান"}
          </button>
        </form>
      </section>

      <section aria-labelledby="phone">
        <h2 id="phone">ফোনে কোড</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const phoneNumber = field(e, "phone");
            const code = field(e, "code");
            if (!phoneCodeSent) {
              run(
                () => authClient.phoneNumber.sendOtp({ phoneNumber }),
                `কোড পাঠানো হয়েছে।${devHint}`,
                () => setPhoneCodeSent(true),
              );
            } else {
              run(
                () => authClient.phoneNumber.verify({ phoneNumber, code }),
                "লগইন হয়েছে।",
                toAccount,
              );
            }
          }}
        >
          <label>
            ফোন নম্বর (যেমন +8801XXXXXXXXX)
            <input name="phone" type="tel" required autoComplete="tel" />
          </label>
          {phoneCodeSent && (
            <label>
              কোড
              <input
                name="code"
                inputMode="numeric"
                required
                autoComplete="one-time-code"
              />
            </label>
          )}
          <button type="submit" disabled={busy}>
            {phoneCodeSent ? "কোড দিয়ে লগইন" : "কোড পাঠান"}
          </button>
        </form>
      </section>

      <section aria-labelledby="social">
        <h2 id="social">অন্য অ্যাকাউন্ট দিয়ে</h2>
        {providers.length === 0 ? (
          <p>এই পরিবেশে Google, Facebook বা GitHub লগইন এখনো চালু করা হয়নি।</p>
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
                  "অন্য সাইটে নেওয়া হচ্ছে…",
                )
              }
            >
              {PROVIDER_LABEL[provider] ?? provider} দিয়ে লগইন
            </button>
          ))
        )}
      </section>
    </div>
  );
}
