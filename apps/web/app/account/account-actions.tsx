"use client";

import { useState } from "react";
import { authClient } from "../../lib/auth-client";

export function AccountActions({ locale }: { locale: "bn" | "en" }) {
  const L = (bn: string, en: string) => (locale === "en" ? en : bn);
  const [status, setStatus] = useState("");

  async function run(
    action: () => Promise<{ error?: { message?: string } | null } | undefined>,
    after: () => void,
  ) {
    setStatus(L("অপেক্ষা করুন…", "Please wait…"));
    try {
      const outcome = await action();
      if (outcome?.error) {
        setStatus(
          `${L("হয়নি", "It did not work")}: ${outcome.error.message ?? L("অজানা সমস্যা", "unknown problem")}`,
        );
        return;
      }
      after();
    } catch {
      setStatus(
        L(
          "হয়নি: সার্ভারে পৌঁছানো যায়নি।",
          "It did not work: the server could not be reached.",
        ),
      );
    }
  }

  return (
    <div>
      <p role="status" aria-live="polite">
        {status}
      </p>
      <button
        type="button"
        onClick={() =>
          run(
            () => authClient.revokeOtherSessions(),
            () => window.location.reload(),
          )
        }
      >
        {L("অন্য সব ডিভাইস থেকে লগআউট", "Log out of all other devices")}
      </button>
      <button
        type="button"
        onClick={() =>
          run(
            () => authClient.signOut(),
            () => window.location.assign("/login"),
          )
        }
      >
        {L("লগআউট", "Log out")}
      </button>
    </div>
  );
}
