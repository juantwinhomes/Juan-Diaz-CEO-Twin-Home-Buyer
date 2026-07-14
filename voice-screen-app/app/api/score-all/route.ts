import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scoringPromptBatch, SCORING_MODEL } from "@/lib/prompts";

// Admin-only: score ALL of a candidate's scoreable attempts in ONE Gemini
// call (quota saver — the free tier caps scoring requests per day).
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { candidateId } = await req.json().catch(() => ({}));
  if (!candidateId) return NextResponse.json({ error: "Missing candidateId" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: interviews } = await db
    .from("interviews")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("started_at", { ascending: true });

  const scoreable = (interviews ?? []).filter(
    (iv) => Array.isArray(iv.transcript) && (iv.transcript as any[]).length >= 4
  );
  if (scoreable.length === 0)
    return NextResponse.json({ error: "No scoreable attempts" }, { status: 404 });

  const transcriptTexts = scoreable.map((iv) =>
    (iv.transcript as any[])
      .map((t) => `${t.role === "agent" ? "INTERVIEWER" : "CANDIDATE"}: ${t.text}`)
      .join("\n")
  );

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  let result;
  try {
    result = await ai.models.generateContent({
      model: process.env.SCORING_MODEL || SCORING_MODEL,
      contents: scoringPromptBatch(transcriptTexts),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Scoring model error: ${e?.message || e}` },
      { status: 502 }
    );
  }

  let parsed: any[];
  try {
    parsed = JSON.parse((result.text ?? "").replace(/```json|```/g, "").trim());
    if (!Array.isArray(parsed) || parsed.length !== scoreable.length)
      throw new Error("length mismatch");
  } catch {
    return NextResponse.json(
      { error: "AI returned unparseable batch output — retry" },
      { status: 502 }
    );
  }

  const PASS_BAR = Number(process.env.PASS_BAR || 3.0);
  const BORDERLINE_BAR = Number(process.env.BORDERLINE_BAR || 2.5);

  const rows = parsed.map((p, i) => {
    const avg = (Number(p.clarity) + Number(p.directness) + Number(p.communication)) / 3;
    const verdict = p.knockout
      ? "FAIL"
      : avg >= PASS_BAR
        ? "PASS"
        : avg >= BORDERLINE_BAR
          ? "BORDERLINE"
          : "FAIL";
    return {
      interview_id: scoreable[i].id,
      clarity: p.clarity,
      directness: p.directness,
      communication: p.communication,
      knockout: !!p.knockout,
      knockout_reason: p.knockout_reason || null,
      verdict,
      suggested_followup: p.suggested_followup || null,
      scored_by: "ai",
      notes: [p.clarity_note, p.directness_note, p.communication_note]
        .filter(Boolean)
        .join(" · "),
    };
  });

  const { error } = await db.from("scores").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("candidates").update({ status: "scored" }).eq("id", candidateId);

  return NextResponse.json({
    ok: true,
    scored: rows.length,
    verdicts: rows.map((r) => r.verdict),
  });
}
