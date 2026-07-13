import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Called by the interview page when the session ends (complete or aborted).
// Saves transcript + audio recording, marks candidate as interviewed.
export async function POST(req: Request) {
  const form = await req.formData();
  const interviewId = String(form.get("interviewId") || "");
  const transcriptRaw = String(form.get("transcript") || "[]");
  const completed = String(form.get("completed")) === "true";
  const audio = form.get("audio") as File | null;

  if (!interviewId) return NextResponse.json({ error: "Missing interviewId" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: interview } = await db.from("interviews").select("*").eq("id", interviewId).single();
  if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  if (interview.completed) return NextResponse.json({ error: "Already completed" }, { status: 409 });

  let audio_url: string | null = null;
  if (audio && audio.size > 0) {
    const path = `${interview.candidate_id}/${interviewId}.webm`;
    const { error: upErr } = await db.storage
      .from("interview-audio")
      .upload(path, audio, { contentType: audio.type || "audio/webm", upsert: true });
    if (!upErr) audio_url = path;
  }

  let transcript: unknown = [];
  try {
    transcript = JSON.parse(transcriptRaw);
  } catch {}

  await db
    .from("interviews")
    .update({
      ended_at: new Date().toISOString(),
      transcript,
      audio_url,
      completed,
    })
    .eq("id", interviewId);

  await db
    .from("candidates")
    .update({ status: "interviewed", token_expires_at: new Date().toISOString() })
    .eq("id", interview.candidate_id);

  return NextResponse.json({ ok: true });
}
