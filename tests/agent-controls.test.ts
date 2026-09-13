import { describe, expect, it } from "vitest";
import { createFundingTools, requiredFundingTool } from "@/lib/agent";
import { checkCallEligibility } from "@/lib/eligibility";
import { calls } from "@/lib/corpus";

const search = {
  toolResults: [
    {
      toolName: "searchCalls",
      output: { noMatch: false, matches: [{ id: calls[0].id }] },
    },
  ],
};
const checked = {
  toolResults: [
    {
      toolName: "checkEligibility",
      output: checkCallEligibility({ callId: calls[0].id }),
    },
  ],
};

describe("funding control flow", () => {
  it("requires successful retrieval followed by a complete pre-screen", () => {
    expect(requiredFundingTool([])).toBe("searchCalls");
    expect(requiredFundingTool([search])).toBe("checkEligibility");
    expect(requiredFundingTool([search, checked])).toBeUndefined();
  });

  it.each([
    undefined,
    { error: "embedding provider unavailable" },
    { noMatch: false },
    { noMatch: false, matches: [] },
    { noMatch: true, matches: [{ id: calls[0].id }] },
    { noMatch: false, matches: [{}] },
  ])(
    "keeps retrieval mandatory after malformed or failed output: %j",
    (output) => {
      expect(
        requiredFundingTool([
          { toolResults: [{ toolName: "searchCalls", output }] },
        ]),
      ).toBe("searchCalls");
    },
  );

  it("keeps retrieval mandatory when the failed SDK step has no tool results", () => {
    expect(requiredFundingTool([{ toolResults: [] }])).toBe("searchCalls");
  });

  it("does not accept an error part containing a result-shaped payload", () => {
    expect(
      requiredFundingTool([
        { toolResults: [{ ...search.toolResults[0], type: "tool-error" }] },
      ]),
    ).toBe("searchCalls");
  });

  it("does not demand a fabricated eligibility check after a successful empty search", () => {
    expect(
      requiredFundingTool([
        {
          toolResults: [
            { toolName: "searchCalls", output: { noMatch: true, matches: [] } },
          ],
        },
      ]),
    ).toBeUndefined();
  });

  it("requires another eligibility attempt after an error or unknown-record fallback", () => {
    expect(requiredFundingTool([search, { toolResults: [] }])).toBe(
      "checkEligibility",
    );
    expect(
      requiredFundingTool([
        search,
        {
          toolResults: [
            {
              toolName: "checkEligibility",
              output: checkCallEligibility({ callId: "NOT-IN-CORPUS" }),
            },
          ],
        },
      ]),
    ).toBe("checkEligibility");
  });

  it("does not count an eligibility result that preceded retrieval", () => {
    expect(requiredFundingTool([checked, search])).toBe("checkEligibility");
  });

  it("keeps unknown applicant facts unclear instead of inventing company size", () => {
    const result = checkCallEligibility({
      callId: "INNOVATION-FUND",
      country: "Germany",
    });
    expect(result.status).toBe("unclear");
    expect(
      result.checks.find((item) => item.criterion === "applicant_type")?.status,
    ).toBe("unclear");
    expect(checkCallEligibility({ callId: "INNOVATION-FUND" }).status).toBe(
      "unclear",
    );
  });

  it.each(["required", "usually_required", "varies"] as const)(
    "keeps an unknown partner setup unclear for %s consortium policy",
    (policy) => {
      const call = calls.find((item) => item.consortium === policy)!;
      const result = checkCallEligibility({
        callId: call.id,
        applicantType: call.applicantTypes[0],
        country: "Romania",
      });
      expect(result.status).toBe("unclear");
      expect(
        result.checks.find((item) => item.criterion === "consortium"),
      ).toMatchObject({ status: "unclear" });
    },
  );

  it("does not require partners for a call explicitly marked not_required", () => {
    const call = calls.find((item) => item.consortium === "not_required")!;
    const result = checkCallEligibility({
      callId: call.id,
      applicantType: call.applicantTypes[0],
      country: "Romania",
    });
    expect(result.status).toBe("likely");
    expect(
      result.checks.find((item) => item.criterion === "consortium"),
    ).toMatchObject({ status: "likely" });
  });

  it("binds eligibility to evidence retrieved within each request", async () => {
    const a = createFundingTools(async () => [
      { call: calls[0], similarity: 1 },
    ]);
    const b = createFundingTools(async () => []);
    const options = { toolCallId: "synthetic", messages: [], context: {} };
    await expect(
      a.checkEligibility.execute!({ callId: calls[0].id }, options),
    ).rejects.toThrow(/Search/);
    await a.searchCalls.execute!(
      { query: "synthetic query", topK: 1 },
      options,
    );
    await expect(
      a.checkEligibility.execute!({ callId: calls[0].id }, options),
    ).resolves.toMatchObject({ callId: calls[0].id, status: "unclear" });
    await expect(
      b.checkEligibility.execute!({ callId: calls[0].id }, options),
    ).rejects.toThrow(/Search/);
  });
});
