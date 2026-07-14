"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ScoreButton({ interviewId, rescore = false }: { interviewId: string; rescore?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function score() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interviewId }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setError(body.error || `Scoring failed (${res.status})`);
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={score}
        disabled={busy}
        style={{ padding: "8px 16px", borderRadius: 6, border: 0, background: "#7c3aed", color: "#fff", cursor: "pointer" }}
      >
        {busy ? "Scoring…" : rescore ? "Re-score with AI" : "Score with AI"}
      </button>
      {error && <p style={{ color: "#c00", fontSize: 13 }}>{error}</p>}
    </div>
  );
}
