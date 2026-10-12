"use client";

import { useState } from "react";
import { authClient } from "../../lib/auth-client";

export function AccountActions() {
  const [status, setStatus] = useState("");

  async function run(
    action: () => Promise<{ error?: { message?: string } | null } | undefined>,
    after: () => void,
  ) {
    setStatus("অপেক্ষা করুন…");
    try {
      const outcome = await action();
      if (outcome?.error) {
        setStatus(`হয়নি: ${outcome.error.message ?? "অজানা সমস্যা"}`);
        return;
      }
      after();
    } catch {
      setStatus("হয়নি: সার্ভারে পৌঁছানো যায়নি।");
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
        অন্য সব ডিভাইস থেকে লগআউট
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
        লগআউট
      </button>
    </div>
  );
}
