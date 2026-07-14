import { COMPANY } from "@/lib/prompts";
import SignOutButton from "./signout-button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="brand">
            {COMPANY}
            <small>Voice Screen · Hiring</small>
          </div>
          <SignOutButton />
        </div>
      </header>
      <div className="container">{children}</div>
    </>
  );
}
