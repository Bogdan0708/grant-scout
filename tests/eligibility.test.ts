import { describe, expect, it } from "vitest";
import { checkCallEligibility } from "@/lib/eligibility";

describe("deterministic eligibility checks", () => {
  it("accepts an eligible Romanian startup profile for EIC Accelerator", () => {
    const result = checkCallEligibility({
      callId: "EIC-ACC-OPEN",
      applicantType: "startup",
      country: "Romania",
      hasPartners: false,
    });
    expect(result.status).toBe("likely");
  });

  it("rejects a solo Pathfinder Open setup", () => {
    const result = checkCallEligibility({
      callId: "EIC-PATH-OPEN",
      applicantType: "sme",
      country: "Romania",
      hasPartners: false,
    });
    expect(result.status).toBe("unlikely");
    expect(result.checks.some((check) => check.criterion === "consortium" && check.status === "unlikely")).toBe(true);
  });

  it("does not overclaim UK association", () => {
    const result = checkCallEligibility({
      callId: "HE-CL4-DIGITAL",
      applicantType: "university",
      country: "United Kingdom",
      hasPartners: true,
    });
    expect(result.status).toBe("unclear");
  });

  it("returns unclear for an unknown call", () => {
    expect(checkCallEligibility({
      callId: "NOT-IN-CORPUS",
      applicantType: "sme",
      country: "Romania",
    }).status).toBe("unclear");
  });
});
