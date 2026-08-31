import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grant Scout — EU funding evidence explorer",
  description:
    "A small agentic RAG demo that searches a curated EU funding snapshot, checks eligibility, and cites every funding claim.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
