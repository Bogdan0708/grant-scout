import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grant Scout — EU funding evidence explorer",
  description:
    "A small agentic RAG demo that searches a curated EU funding snapshot, runs eligibility pre-screens, and presents citations to retrieved sources.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
