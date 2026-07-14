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

function verdictClass(v?: string) {
  if (v === "PASS") return "score-pass";
  if (v === "BORDERLINE") return "score-borderline";
  return "score-fail";
}

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: candidate } = await supabase.from("candidates").select("*").eq("id", id).single();
  if (!candidate) return <main>Candidate not found.</main>;

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

  const scoreableCount = withAudio.filter(
    (iv) => Array.isArray(iv.transcript) && (iv.transcript as any[]).length >= 4
  ).length;

  return (
    <main className="fade-in">
      <Link href="/admin" className="small">← All candidates</Link>

      <div className="card" style={{ marginTop: 12, marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, marginTop: 0 }}>{candidate.full_name}</h1>
        <p className="muted" style={{ marginTop: -8 }}>
          {candidate.role_applied} · {candidate.email || "no email"} · {candidate.phone || "no phone"}
        </p>

        <div className="row">
          <form action={setStatus} className="row">
            <input type="hidden" name="id" value={candidate.id} />
            <label className="small muted">Status:</label>
            <select name="status" defaultValue={candidate.status} className="input" style={{ width: "auto" }}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button className="btn btn-secondary">Save</button>
          </form>
          {scoreableCount > 1 && <ScoreAllButton candidateId={candidate.id} attempts={scoreableCount} />}
        </div>
      </div>

      {withAudio.length === 0 && (
        <div className="card muted">No interview yet. Send them their invite link.</div>
      )}

      {withAudio.map((iv, idx) => (
        <section key={iv.id} className="card" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>
              Attempt {withAudio.length - idx}
              <span className="muted small" style={{ fontWeight: 400 }}>
                {" "}· {iv.started_at ? new Date(iv.started_at).toLocaleString() : "not started"}
              </span>
            </h2>
            <span className={`pill ${iv.completed ? "pill-green" : "pill-gray"}`}>
              {iv.completed ? "✓ completed" : "ended early"}
            </span>
          </div>
          <p className="small muted" style={{ margin: "6px 0" }}>
            Consent: {iv.consent_given ? `yes (${new Date(iv.consent_at).toLocaleString()})` : "NO"}
          </p>

          {!iv.completed && (
            <p className="notice notice-gray small" style={{ margin: "8px 0" }}>
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
              <div key={s.id} className={`score-card ${verdictClass(s.verdict)}`}>
                <div className="small muted" style={{ marginBottom: 4 }}>
                  Score #{sIdx + 1} of this attempt{sIdx === arr.length - 1 ? " (latest)" : " (superseded)"} · {new Date(s.created_at).toLocaleString()}
                </div>
                <strong>{s.verdict}</strong> ({s.scored_by}) —{" "}
                <strong>
                  Average {(((s.clarity ?? 0) + (s.directness ?? 0) + (s.communication ?? 0)) / 3).toFixed(2)} / 5
                </strong>{" "}
                · Clarity {s.clarity} · Directness {s.directness} · Communication {s.communication}
                {s.knockout && <div>⚠️ Knockout: {s.knockout_reason}</div>}
                {s.suggested_followup && <div>Live-call follow-up: “{s.suggested_followup}”</div>}
                {s.notes && <div className="small" style={{ marginTop: 4 }}>Notes: {s.notes}</div>}
              </div>
            ))}

          {Array.isArray(iv.transcript) && (iv.transcript as any[]).length >= 4 && (
            <ScoreButton interviewId={iv.id} rescore={(iv.scores ?? []).length > 0} />
          )}

          {iv.transcript && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Transcript</summary>
              <div className="small" style={{ marginTop: 8 }}>
                {(iv.transcript as any[]).map((t, i) => (
                  <p key={i} style={{ margin: "5px 0" }}>
                    <strong style={{ color: t.role === "agent" ? "var(--brand-ink)" : "var(--ink)" }}>
                      {t.role === "agent" ? "AI" : "Candidate"}:
                    </strong>{" "}
                    {t.text}
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
