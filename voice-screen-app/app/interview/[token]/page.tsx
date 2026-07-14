import { supabaseAdmin } from "@/lib/supabase/admin";
import InterviewClient from "./interview-client";
import { COMPANY } from "@/lib/prompts";

export default async function InterviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = supabaseAdmin();
  const { data: candidate } = await db
    .from("candidates")
    .select("id, full_name, role_applied, status, token_expires_at")
    .eq("interview_token", token)
    .single();

  const wrap: React.CSSProperties = { maxWidth: 560, margin: "8vh auto", padding: 24, textAlign: "center" };

  if (!candidate) return <main style={wrap}><h1>Link not found</h1><p>Please check the link you received, or contact {COMPANY}.</p></main>;

  const { count: attemptsUsed } = await db
    .from("interviews")
    .select("*", { count: "exact", head: true })
    .eq("candidate_id", candidate.id)
    .eq("completed", true);

  const expired = candidate.token_expires_at && new Date(candidate.token_expires_at) < new Date();
  const closed = ["live_call", "hired", "declined"].includes(candidate.status);
  if (expired || closed || (attemptsUsed ?? 0) >= 3)
    return <main style={wrap}><h1>Interview unavailable</h1><p>This interview link was already used or has expired. If you believe this is a mistake, contact {COMPANY}.</p></main>;

  return (
    <InterviewClient
      token={token}
      candidateName={candidate.full_name}
      roleApplied={candidate.role_applied}
      attemptsUsed={attemptsUsed ?? 0}
    />
  );
}
