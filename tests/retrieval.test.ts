import { describe, expect, it } from "vitest";
import { cosineSimilarity, createRetriever, validateVectorIndex } from "@/lib/retrieval";

describe("in-memory retrieval", () => {
  it("computes cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(() => cosineSimilarity([1], [1, 2])).toThrow(/dimensions/i);
  });

  it("ranks an identical query vector first", async () => {
    const index = validateVectorIndex();
    const first = index.items[0];
    expect(first).toBeDefined();
    const retrieve = createRetriever(async () => first.embedding);
    const results = await retrieve("fixture", { topK: 3, minSimilarity: -1 });
    expect(results[0].call.id).toBe(first.id);
    expect(results[0].similarity).toBeCloseTo(1);
  });
});
