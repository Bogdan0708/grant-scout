import { collectFundingTrace, type FundingStep } from "../lib/funding-trace";

export interface ControlExpectations {
  expectedTools: readonly string[];
  expectedAnyCallIds: readonly string[];
  expectNoMatch: boolean;
}
export interface ControlResult {
  tools: boolean;
  retrieval: boolean;
  citations: boolean;
}

export function evaluateControls(
  expected: ControlExpectations,
  answer: string,
  steps: readonly FundingStep[],
) {
  const trace = collectFundingTrace(steps);
  // Keep malformed/unknown IDs visible to the gate instead of silently
  // ignoring them when a second, valid citation is also present.
  const citations = [...answer.matchAll(/\[source:([^\]\r\n]+)\]/g)].map(
    (match) => match[1],
  );
  const toolsPass = expected.expectedTools.every((name) =>
    trace.successfulToolNames.has(name),
  );
  const retrievalPass = expected.expectNoMatch
    ? trace.sawNoMatch && trace.retrievedIds.size === 0
    : expected.expectedAnyCallIds.some((id) => trace.retrievedIds.has(id));
  const citationsPass = expected.expectNoMatch
    ? citations.length === 0
    : citations.length > 0 &&
      citations.every((id) => trace.retrievedIds.has(id));
  return { trace, citations, toolsPass, retrievalPass, citationsPass };
}

export function passesEvaluation(
  overall: number,
  results: readonly ControlResult[],
  minimumScore = 0.75,
) {
  return (
    Number.isFinite(overall) &&
    Number.isFinite(minimumScore) &&
    minimumScore >= 0 &&
    minimumScore <= 1 &&
    overall >= minimumScore &&
    results.length > 0 &&
    results.every(
      (result) => result.tools && result.retrieval && result.citations,
    )
  );
}
