import { describe, expect, it } from "vitest";
import { callToEmbeddingText, calls, corpus } from "@/lib/corpus";

describe("funding corpus", () => {
  it("contains the intended curated snapshot", () => {
    expect(calls).toHaveLength(30);
    expect(new Set(calls.map((call) => call.id)).size).toBe(calls.length);
    expect(corpus.snapshotDate).toBe("2026-08-29");
  });

  it("uses official HTTPS source links and explicit non-live deadlines", () => {
    for (const call of calls) {
      expect(call.source.url).toMatch(/^https:\/\//);
      expect(call.deadline.label.length).toBeGreaterThan(8);
      expect(call.source.accessedAt).toBe(corpus.snapshotDate);
    }
  });

  it("builds a readable embedding document", () => {
    const text = callToEmbeddingText(calls[0]);
    expect(text).toContain(calls[0].title);
    expect(text).toContain("Applicants:");
    expect(text).toContain("Deadline:");
  });
});
