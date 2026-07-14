import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import ScoreButton from "./score-button";
import ScoreAllButton from "./score-all-button";

const STATUSES = ["invited", "interviewed", "scored", "passed", "failed", "live_call", "hired", "declined"];

async function setStatus(formData: FormData) {
  "use server";
  const supabase = await supabaseServer();
  const id = String(formData.get("id"));
  const { error } = await supabase
    .from("candidates")
    .update({ status: String(formData.get("status")) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/candidates/${id}`);
}

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: candidate } = await supabase.from("candidates").select("*").eq("id", id).single();
  if (!candidate) return <main style={{ padding: 24 }}>Candidate not found.</main>;

  const { data: interviews } = await supabase
    .from("interviews")
    .select("*, scores(*)")
    .eq("candidate_id", id)
    .order("started_at", { ascending: false });

  // Signed URL for audio playback (private bucket)
  const admin = supabaseAdmin();
  const withAudio = await Promise.all(
    (interviews ?? []).map(async (iv) => {
      let signedUrl: string | null = null;
      if (iv.audio_url) {
        const { data } = await admin.storage.from("interview-audio").createSignedUrl(iv.audio_url, 3600);
        signedUrl = data?.signedUrl ?? null;
      }
      return { ...iv, signedUrl };
    })
  );

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <Link href="/admin">← All candidates</Link>
      <h1 style={{ fontSize: 22 }}>{candidate.full_name}</h1>
      <p style={{ color: "#555" }}>
        {candidate.role_applied} · {candidate.email || "no email"} · {candidate.phone || "no phone"}
      </p>

      <form action={setStatus} style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
        <input type="hidden" name="id" value={candidate.id} />
        <label style={{ fontSize: 14 }}>Status:</label>
        <select name="status" defaultValue={candidate.status} style={{ padding: 6, borderRadius: 6 }}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button style={{ padding: "6px 14px", borderRadius: 6, border: 0, background: "#1a56db", color: "#fff", cursor: "pointer" }}>Save</button>
      </form>

      {withAudio.length === 0 && <p>No interview yet. Send them their invite link.</p>}

      {(() => {
        const scoreable = withAudio.filter(
          (iv) => Array.isArray(iv.transcript) && (iv.transcript as any[]).length >= 4
        ).length;
        return scoreable > 1 ? (
          <ScoreAllButton candidateId={candidate.id} attempts={scoreable} />
        ) : null;
      })()}

      {withAudio.map((iv, idx) => (
        <section key={iv.id} style={{ background: "#fff", borderRadius: 8, padding: 16, marginTop: 16 }}>
          <h2 style={{ fontSize: 16 }}>
            Attempt {withAudio.length - idx} — {iv.started_at ? new Date(iv.started_at).toLocaleString() : "not started"}
            {iv.completed ? " ✓ completed" : " (incomplete)"}
          </h2>
          <p style={{ fontSize: 13, color: "#666" }}>
            Consent: {iv.consent_given ? `yes (${new Date(iv.consent_at).toLocaleString()})` : "NO"}
          </p>

          {!iv.completed && (
            <p style={{ fontSize: 13, background: "#f3f4f6", padding: 8, borderRadius: 6 }}>
              ⚠️ Ended early — does NOT count against the candidate&apos;s 3 attempts.
              {Array.isArray(iv.transcript) && (iv.transcript as any[]).length >= 4
                ? " Partial transcript available — you can score it if there's enough to judge."
                : " Too little transcript to score."}
            </p>
          )}

          {iv.signedUrl && <audio controls src={iv.signedUrl} style={{ width: "100%", margin: "8px 0" }} />}

          {(iv.scores ?? [])
            .slice()
            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map((s: any, sIdx: number, arr: any[]) => (
            <div key={s.id} style={{ background: s.verdict === "PASS" ? "#d1fadf" : s.verdict === "BORDERLINE" ? "#fef3c7" : "#fde2e2", borderRadius: 6, padding: 12, margin: "8px 0", fontSize: 14 }}>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>
                Score #{sIdx + 1} of this attempt{sIdx === arr.length - 1 ? " (latest)" : " (superseded)"} · {new Date(s.created_at).toLocaleString()}
              </div>
              <strong>{s.verdict}</strong> ({s.scored_by}) — <strong>Average {(((s.clarity ?? 0) + (s.directness ?? 0) + (s.communication ?? 0)) / 3).toFixed(2)} / 5</strong> · Clarity {s.clarity} · Directness {s.directness} · Communication {s.communication}
              {s.knockout && <div>⚠️ Knockout: {s.knockout_reason}</div>}
              {s.suggested_followup && <div>Live-call follow-up: “{s.suggested_followup}”</div>}
              {s.notes && <div>Notes: {s.notes}</div>}
            </div>
          ))}

          {Array.isArray(iv.transcript) && (iv.transcript as any[]).length >= 4 && (
            <ScoreButton interviewId={iv.id} rescore={(iv.scores ?? []).length > 0} />
          )}

          {iv.transcript && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer" }}>Transcript</summary>
              <div style={{ fontSize: 14, marginTop: 8 }}>
                {(iv.transcript as any[]).map((t, i) => (
                  <p key={i} style={{ margin: "4px 0" }}>
                    <strong>{t.role === "agent" ? "AI" : "Candidate"}:</strong> {t.text}
                  </p>
                ))}
              </div>
            </details>
          )}
        </section>
      ))}
    </main>
  );
}
