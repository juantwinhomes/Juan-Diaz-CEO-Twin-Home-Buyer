import type { Metadata } from "next";
import { COMPANY } from "@/lib/prompts";
import "./globals.css";

export const metadata: Metadata = {
  title: `${COMPANY} — Voice Screen`,
  description: "Applicant voice screening",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
