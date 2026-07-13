import { supabaseAdmin } from "@/lib/supabase/admin";
import InterviewClient from "./interview-client";

export default async function InterviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = supabaseAdmin();
  const { data: candidate } = await db
    .from("candidates")
    .select("full_name, role_applied, status, token_expires_at")
    .eq("interview_token", token)
    .single();

  const wrap: React.CSSProperties = { maxWidth: 560, margin: "8vh auto", padding: 24, textAlign: "center" };

  if (!candidate) return <main style={wrap}><h1>Link not found</h1><p>Please check the link you received, or contact Twin Home Buyer.</p></main>;

  const expired = candidate.token_expires_at && new Date(candidate.token_expires_at) < new Date();
  if (candidate.status !== "invited" || expired)
    return <main style={wrap}><h1>Interview unavailable</h1><p>This interview link was already used or has expired. If you believe this is a mistake, contact Twin Home Buyer.</p></main>;

  return (
    <InterviewClient
      token={token}
      candidateName={candidate.full_name}
      roleApplied={candidate.role_applied}
    />
  );
}
