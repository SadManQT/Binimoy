import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const processed = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const hash = window.location.hash || "";
    const match = hash.match(/session_id=([^&]+)/);
    const sessionId = match ? decodeURIComponent(match[1]) : null;
    if (!sessionId) { nav("/login"); return; }
    (async () => {
      try {
        const { data } = await api.post("/auth/session", { session_id: sessionId });
        setUser(data.user);
        window.history.replaceState(null, "", window.location.pathname);
        nav("/home", { replace: true, state: { user: data.user } });
      } catch (e) {
        setError("Sign-in failed. Please try again.");
        setTimeout(() => nav("/login"), 1500);
      }
    })();
  }, [nav, setUser]);

  return (
    <div className="min-h-screen grid place-items-center bg-brand text-white">
      <div className="flex flex-col items-center gap-3">
        {!error ? <Loader2 className="w-7 h-7 animate-spin" /> : null}
        <p>{error || "Signing you in…"}</p>
      </div>
    </div>
  );
}
