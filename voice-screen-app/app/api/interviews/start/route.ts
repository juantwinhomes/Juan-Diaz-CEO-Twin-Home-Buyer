import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { interviewerSystemPrompt, LIVE_MODEL } from "@/lib/prompts";
import { johnSystemPrompt } from "@/lib/sales-prompts";

// Candidate clicked "I consent, start interview".
// Validates the invite token, logs consent, creates the interview row,
// and mints a single-use ephemeral token so the GEMINI_API_KEY never
// reaches the browser.
export async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({}));
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: candidate } = await db
    .from("candidates")
    .select("*")
    .eq("interview_token", token)
    .single();

  if (!candidate) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (candidate.token_expires_at && new Date(candidate.token_expires_at) < new Date())
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  if (["live_call", "hired", "declined"].includes(candidate.status))
    return NextResponse.json({ error: "This interview is closed" }, { status: 409 });

  // Up to 3 attempts per candidate; each attempt draws a different question
  // bank (abandoned/errored sessions don't burn an attempt).
  const MAX_ATTEMPTS = 3;
  const { count: attemptsUsed } = await db
    .from("interviews")
    .select("*", { count: "exact", head: true })
    .eq("candidate_id", candidate.id)
    .eq("completed", true);
  if ((attemptsUsed ?? 0) >= MAX_ATTEMPTS)
    return NextResponse.json({ error: "All interview attempts have been used" }, { status: 409 });

  const { data: interview, error } = await db
    .from("interviews")
    .insert({
      candidate_id: candidate.id,
      consent_given: true,
      consent_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Ephemeral token: single session, expires in 15 minutes.
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const authToken = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      httpOptions: { apiVersion: "v1alpha" },
    },
  });

  return NextResponse.json({
    interviewId: interview.id,
    ephemeralToken: authToken.name,
    // LIVE_MODEL env var overrides the default — lets us switch Live model
    // names from Vercel settings without a code change (they rotate often)
    model: process.env.LIVE_MODEL || LIVE_MODEL,
    systemPrompt:
      candidate.mode === "sales"
        ? johnSystemPrompt(candidate.difficulty === "hard" ? "hard" : "easy")
        : interviewerSystemPrompt(
            candidate.full_name,
            candidate.role_applied,
            attemptsUsed ?? 0
          ),
    mode: candidate.mode || "hiring",
    attempt: (attemptsUsed ?? 0) + 1,
    maxAttempts: MAX_ATTEMPTS,
  });
}
