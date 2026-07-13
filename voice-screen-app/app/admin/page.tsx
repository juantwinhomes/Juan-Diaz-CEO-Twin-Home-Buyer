import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

async function addCandidate(formData: FormData) {
  "use server";
  const supabase = await supabaseServer();
  const { error } = await supabase.from("candidates").insert({
    full_name: String(formData.get("full_name") || "").trim(),
    phone: String(formData.get("phone") || "").trim() || null,
    email: String(formData.get("email") || "").trim() || null,
    role_applied: String(formData.get("role_applied") || "").trim(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export default async function AdminPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: candidates } = await supabase
    .from("candidates")
    .select("*")
    .order("created_at", { ascending: false });

  const base = process.env.NEXT_PUBLIC_APP_URL || "";

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22 }}>Candidates</h1>

      <form
        action={addCandidate}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0", alignItems: "center" }}
      >
        <input name="full_name" placeholder="Full name" required style={inp} />
        <input name="role_applied" placeholder="Role" required style={inp} />
        <input name="email" placeholder="Email" style={inp} />
        <input name="phone" placeholder="Phone" style={inp} />
        <button style={{ padding: "8px 16px", borderRadius: 6, border: 0, background: "#1a56db", color: "#fff", cursor: "pointer" }}>
          Add + generate link
        </button>
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8 }}>
        <thead>
          <tr>
            {["Name", "Role", "Status", "Invite link", ""].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "2px solid #eee", fontSize: 13, color: "#666" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(candidates ?? []).map((c) => (
            <tr key={c.id}>
              <td style={td}>{c.full_name}</td>
              <td style={td}>{c.role_applied}</td>
              <td style={td}>
                <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 12, background: badge(c.status) }}>{c.status}</span>
              </td>
              <td style={{ ...td, fontSize: 12 }}>
                <code>{`${base}/interview/${c.interview_token}`}</code>
              </td>
              <td style={td}>
                <Link href={`/admin/candidates/${c.id}`}>Open →</Link>
              </td>
            </tr>
          ))}
          {(candidates ?? []).length === 0 && (
            <tr><td style={td} colSpan={5}>No candidates yet — add one above.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

const inp: React.CSSProperties = { padding: 8, border: "1px solid #ccc", borderRadius: 6 };
const td: React.CSSProperties = { padding: 10, borderBottom: "1px solid #f0f0f0", fontSize: 14 };

function badge(status: string) {
  if (status === "passed" || status === "hired") return "#d1fadf";
  if (status === "failed" || status === "declined") return "#fde2e2";
  if (status === "interviewed" || status === "scored") return "#fef3c7";
  return "#e5e7eb";
}
