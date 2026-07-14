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

const STATUS_PILL: Record<string, string> = {
  invited: "pill-blue",
  interviewed: "pill-amber",
  scored: "pill-amber",
  passed: "pill-green",
  hired: "pill-green",
  live_call: "pill-blue",
  failed: "pill-red",
  declined: "pill-red",
};

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
    <main className="fade-in">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Candidates</h1>
        <span className="pill pill-gray">{(candidates ?? []).length} total</span>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 14, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)" }}>
          Add candidate
        </h2>
        <form action={addCandidate} className="row">
          <input name="full_name" placeholder="Full name" required className="input" style={{ flex: 2, minWidth: 160 }} />
          <input name="role_applied" placeholder="Role" required className="input" style={{ flex: 2, minWidth: 140 }} />
          <input name="email" placeholder="Email (optional)" className="input" style={{ flex: 2, minWidth: 160 }} />
          <input name="phone" placeholder="Phone (optional)" className="input" style={{ flex: 1, minWidth: 120 }} />
          <button className="btn">Add + generate link</button>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Invite link</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(candidates ?? []).map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.full_name}</td>
                <td>{c.role_applied}</td>
                <td>
                  <span className={`pill ${STATUS_PILL[c.status] || "pill-gray"}`}>{c.status}</span>
                </td>
                <td style={{ maxWidth: 320 }}>
                  <code className="linkbox">{`${base}/interview/${c.interview_token}`}</code>
                </td>
                <td>
                  <Link href={`/admin/candidates/${c.id}`}>Open →</Link>
                </td>
              </tr>
            ))}
            {(candidates ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No candidates yet — add one above.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
