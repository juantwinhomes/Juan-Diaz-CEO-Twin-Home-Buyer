"use client";

import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function SignOutButton() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/admin/login") return null;

  async function signOut() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      style={{
        background: "rgba(255,255,255,.12)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,.25)",
        padding: "7px 14px",
        borderRadius: 8,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      Sign out
    </button>
  );
}
