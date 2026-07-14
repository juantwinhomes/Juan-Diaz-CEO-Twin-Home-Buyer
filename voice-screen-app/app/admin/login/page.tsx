"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    router.push("/admin");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 380, margin: "10vh auto" }} className="fade-in">
      <div className="card" style={{ padding: 28 }}>
        <h1 style={{ fontSize: 20, marginTop: 0 }}>Admin sign in</h1>
        <p className="muted small" style={{ marginTop: -6 }}>
          Hiring team access only.
        </p>
        <form onSubmit={signIn} className="stack" style={{ marginTop: 16 }}>
          <input
            className="input" type="email" placeholder="Email" value={email} required
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input" type="password" placeholder="Password" value={password} required
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {error && <p style={{ color: "var(--red)", fontSize: 14, margin: 0 }}>{error}</p>}
        </form>
      </div>
    </main>
  );
}
