import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("public demo rate limiter", () => {
  it("limits an IP within a fixed window and recovers after reset", () => {
    const limit = createRateLimiter({ requests: 2, windowMs: 1_000, dailyRequests: 10 });
    expect(limit("203.0.113.4", 1_000).allowed).toBe(true);
    expect(limit("203.0.113.4", 1_100).allowed).toBe(true);
    expect(limit("203.0.113.4", 1_200).allowed).toBe(false);
    expect(limit("203.0.113.4", 2_001).allowed).toBe(true);
  });

  it("enforces the shared daily demo budget", () => {
    const limit = createRateLimiter({ requests: 5, windowMs: 1_000, dailyRequests: 2 });
    expect(limit("one", 10_000).allowed).toBe(true);
    expect(limit("two", 10_001).allowed).toBe(true);
    const result = limit("three", 10_002);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("daily");
  });
});
