import { describe, expect, it } from "vitest";
import { evaluateControls, passesEvaluation } from "../evals/scoring";
import { checkCallEligibility } from "@/lib/eligibility";
import type { FundingStep } from "@/lib/funding-trace";

const callId = "EIC-PATH-OPEN";
const expected = {
  expectedTools: ["searchCalls", "checkEligibility"],
  expectedAnyCallIds: [callId],
  expectNoMatch: false,
};
const search: FundingStep = {
  toolCalls: [{ toolName: "searchCalls" }],
  toolResults: [
    {
      toolName: "searchCalls",
      output: { noMatch: false, matches: [{ id: callId }] },
    },
  ],
};
const check: FundingStep = {
  toolCalls: [{ toolName: "checkEligibility" }],
  toolResults: [
    { toolName: "checkEligibility", output: checkCallEligibility({ callId }) },
  ],
};
const answer = `Consortium information is still needed. [source:${callId}]`;

describe("behavioral evaluation control gates (offline)", () => {
  it("fails tools when eligibility was called but returned an SDK error", () => {
    const failedCheck: FundingStep = {
      toolCalls: [{ toolName: "checkEligibility" }],
      toolResults: [],
    };
    const result = evaluateControls(expected, answer, [search, failedCheck]);
    expect(result.trace.toolNames).toContain("checkEligibility");
    expect(result.trace.successfulToolNames.has("checkEligibility")).toBe(
      false,
    );
    expect(result).toMatchObject({
      toolsPass: false,
      retrievalPass: true,
      citationsPass: true,
    });
  });

  it("fails retrieval and citations after an errored search request", () => {
    const result = evaluateControls(expected, answer, [
      { toolCalls: [{ toolName: "searchCalls" }], toolResults: [] },
    ]);
    expect(result).toMatchObject({
      toolsPass: false,
      retrievalPass: false,
      citationsPass: false,
    });
  });

  it("rejects incomplete and ungrounded eligibility outputs", () => {
    for (const output of [
      { callId, checks: [] },
      checkCallEligibility({ callId: "NOT-IN-CORPUS" }),
      checkCallEligibility({ callId: "EIC-ACC-OPEN" }),
    ]) {
      const result = evaluateControls(expected, answer, [
        search,
        { toolResults: [{ toolName: "checkEligibility", output }] },
      ]);
      expect(result.toolsPass).toBe(false);
    }
  });

  it("credits a successful retry while retaining the attempted-tool trace", () => {
    const result = evaluateControls(expected, answer, [
      search,
      { toolCalls: [{ toolName: "checkEligibility" }], toolResults: [] },
      check,
    ]);
    expect(result).toMatchObject({
      toolsPass: true,
      retrievalPass: true,
      citationsPass: true,
    });
    expect(
      result.trace.toolNames.filter((name) => name === "checkEligibility"),
    ).toHaveLength(2);
    expect([...result.trace.successfulToolNames]).toEqual([
      "searchCalls",
      "checkEligibility",
    ]);
  });

  it("does not let an unrelated tool manufacture retrieval or no-match evidence", () => {
    const result = evaluateControls(
      {
        expectedTools: ["searchCalls"],
        expectedAnyCallIds: [],
        expectNoMatch: true,
      },
      "No match",
      [
        {
          toolResults: [
            { toolName: "other", output: { noMatch: true, matches: [] } },
          ],
        },
      ],
    );
    expect(result).toMatchObject({ toolsPass: false, retrievalPass: false });
  });

  it("passes a successful no-match outcome without demanding eligibility", () => {
    const result = evaluateControls(
      {
        expectedTools: ["searchCalls"],
        expectedAnyCallIds: [],
        expectNoMatch: true,
      },
      "No match in this snapshot.",
      [
        {
          toolResults: [
            { toolName: "searchCalls", output: { noMatch: true, matches: [] } },
          ],
        },
      ],
    );
    expect(result).toMatchObject({
      toolsPass: true,
      retrievalPass: true,
      citationsPass: true,
    });
  });

  it("fails a malformed citation even when another citation is valid", () => {
    expect(
      evaluateControls(expected, `${answer} [source:made-up-id]`, [
        search,
        check,
      ]).citationsPass,
    ).toBe(false);
  });

  it.each(["tools", "retrieval", "citations"] as const)(
    "fails the run despite a high weighted score when %s fails",
    (gate) => {
      expect(
        passesEvaluation(0.979, [
          { tools: true, retrieval: true, citations: true, [gate]: false },
        ]),
      ).toBe(false);
    },
  );

  it("requires finite thresholds, completed cases and sufficient weighted quality", () => {
    const passed = [{ tools: true, retrieval: true, citations: true }];
    expect(passesEvaluation(0.98, passed)).toBe(true);
    expect(passesEvaluation(0.74, passed)).toBe(false);
    expect(passesEvaluation(1, [])).toBe(false);
    expect(passesEvaluation(1, passed, Number.NaN)).toBe(false);
  });
});
