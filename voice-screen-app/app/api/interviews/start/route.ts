import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { interviewerSystemPrompt, LIVE_MODEL } from "@/lib/prompts";

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
  if (!["invited"].includes(candidate.status))
    return NextResponse.json({ error: "This interview was already completed" }, { status: 409 });

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
    model: LIVE_MODEL,
    systemPrompt: interviewerSystemPrompt(candidate.full_name, candidate.role_applied),
  });
}
