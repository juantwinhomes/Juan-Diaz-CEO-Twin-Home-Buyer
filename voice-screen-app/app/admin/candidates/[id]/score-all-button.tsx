"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ScoreAllButton({
  candidateId,
  attempts,
}: {
  candidateId: string;
  attempts: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function scoreAll() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/score-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setError(body.error || `Scoring failed (${res.status})`);
    }
    router.refresh();
  }

  return (
    <div style={{ margin: "8px 0" }}>
      <button onClick={scoreAll} disabled={busy} className="btn btn-teal">
        {busy ? "Scoring all…" : `Score all ${attempts} attempt${attempts === 1 ? "" : "s"} — 1 API call`}
      </button>
      {error && <p style={{ color: "#c00", fontSize: 13 }}>{error}</p>}
    </div>
  );
}
