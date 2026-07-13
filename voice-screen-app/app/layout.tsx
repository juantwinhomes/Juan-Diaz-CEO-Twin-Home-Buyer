import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Twin Home Buyer — Voice Screen",
  description: "Applicant voice screening",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#f6f7f9",
          color: "#1a1a1a",
        }}
      >
        {children}
      </body>
    </html>
  );
}
