import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scoringPrompt, SCORING_MODEL } from "@/lib/prompts";

// Admin-only: send an interview transcript to Gemini with the THB rubric,
// store the result in `scores`, and update candidate status.
export async function POST(req: Request) {
  // Require a logged-in admin
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

  const { interviewId } = await req.json().catch(() => ({}));
  if (!interviewId) return NextResponse.json({ error: "Missing interviewId" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: interview } = await db.from("interviews").select("*").eq("id", interviewId).single();
  if (!interview?.transcript)
    return NextResponse.json({ error: "No transcript to score" }, { status: 404 });

  const transcriptText = (interview.transcript as any[])
    .map((t) => `${t.role === "agent" ? "INTERVIEWER" : "CANDIDATE"}: ${t.text}`)
    .join("\n");

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const result = await ai.models.generateContent({
    model: SCORING_MODEL,
    contents: scoringPrompt(transcriptText),
  });

  let parsed: any;
  try {
    parsed = JSON.parse((result.text ?? "").replace(/```json|```/g, "").trim());
  } catch {
    return NextResponse.json({ error: "AI returned unparseable output — retry" }, { status: 502 });
  }

  const { error } = await db.from("scores").insert({
    interview_id: interviewId,
    clarity: parsed.clarity,
    directness: parsed.directness,
    communication: parsed.communication,
    knockout: !!parsed.knockout,
    knockout_reason: parsed.knockout_reason || null,
    verdict: parsed.verdict,
    suggested_followup: parsed.suggested_followup || null,
    scored_by: "ai",
    notes: [parsed.clarity_note, parsed.directness_note, parsed.communication_note]
      .filter(Boolean)
      .join(" · "),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db
    .from("candidates")
    .update({ status: "scored" })
    .eq("id", interview.candidate_id);

  return NextResponse.json({ ok: true, verdict: parsed.verdict });
}
