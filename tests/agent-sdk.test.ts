/** Exercise the real generateText/streamText loops and prepareStep callbacks.
 * Only the provider boundary and embedding retrieval are mocked. Fetch is
 * forbidden, so these tests cannot consume API credits even if keys exist. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { calls } from "@/lib/corpus";
import { generateFundingAnswer, streamFundingAnswer } from "@/lib/agent";
import { evaluateControls } from "../evals/scoring";

const mocks = vi.hoisted(() => ({ provider: vi.fn(), retrieve: vi.fn() }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: mocks.provider }));
vi.mock("@/lib/retrieval", () => ({ retrieveCalls: mocks.retrieve }));

const call = calls.find((item) => item.id === "EIC-PATH-OPEN")!;
const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const finalText = `Partner details are still needed. [source:${call.id}]`;
function toolResult(
  toolName: string,
  index: number,
  invalidEligibility: boolean,
): LanguageModelV4GenerateResult {
  return {
    content: [
      {
        type: "tool-call",
        toolCallId: `call-${index}`,
        toolName,
        input: JSON.stringify(
          toolName === "searchCalls"
            ? { query: "Romanian SME research partners", topK: 1 }
            : {
                callId: invalidEligibility ? "NOT-RETRIEVED" : call.id,
                applicantType: "sme",
                country: "Romania",
              },
        ),
      },
    ],
    finishReason: { unified: "tool-calls", raw: undefined },
    usage,
    warnings: [],
  };
}
function installModel(invalidFirstEligibility = false) {
  let index = 0;
  let checks = 0;
  const next = (
    toolChoice: { type: string; toolName?: string } | undefined,
  ): LanguageModelV4GenerateResult => {
    index++;
    if (toolChoice?.type === "tool" && toolChoice.toolName) {
      const invalid =
        toolChoice.toolName === "checkEligibility" &&
        ++checks === 1 &&
        invalidFirstEligibility;
      return toolResult(toolChoice.toolName, index, invalid);
    }
    return {
      content: [{ type: "text", text: finalText }],
      finishReason: { unified: "stop", raw: undefined },
      usage,
      warnings: [],
    };
  };
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => next(options.toolChoice),
    doStream: async (options) => {
      const result = next(options.toolChoice);
      const chunks: LanguageModelV4StreamPart[] = [
        { type: "stream-start", warnings: [] },
      ];
      for (const part of result.content) {
        if (part.type === "tool-call") chunks.push(part);
        if (part.type === "text")
          chunks.push(
            { type: "text-start", id: `text-${index}` },
            { type: "text-delta", id: `text-${index}`, delta: part.text },
            { type: "text-end", id: `text-${index}` },
          );
      }
      chunks.push({ type: "finish", finishReason: result.finishReason, usage });
      return {
        stream: simulateReadableStream({
          chunks,
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      };
    },
  });
  mocks.provider.mockReturnValue(model);
  return model;
}
async function answer(mode: "generate" | "stream") {
  if (mode === "generate")
    return generateFundingAnswer(
      "We are an SME in Romania. What research call fits?",
    );
  const result = streamFundingAnswer([
    {
      role: "user",
      content: "We are an SME in Romania. What research call fits?",
    },
  ]);
  await result.consumeStream();
  return { text: await result.text, steps: await result.steps };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.retrieve.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Network forbidden in offline controls tests");
    }),
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe.each(["generate", "stream"] as const)(
  "actual %s SDK control loop",
  (mode) => {
    it("retries failed retrieval before permitting eligibility and final text", async () => {
      mocks.retrieve
        .mockRejectedValueOnce(new Error("embedding service unavailable"))
        .mockResolvedValue([{ call, similarity: 1 }]);
      const model = installModel();
      const result = await answer(mode);
      const modelCalls =
        mode === "generate" ? model.doGenerateCalls : model.doStreamCalls;
      expect(modelCalls.map((item) => item.toolChoice)).toEqual([
        { type: "tool", toolName: "searchCalls" },
        { type: "tool", toolName: "searchCalls" },
        { type: "tool", toolName: "checkEligibility" },
        { type: "auto" },
      ]);
      expect(result.text).toBe(finalText);
      expect(
        evaluateControls(
          {
            expectedTools: ["searchCalls", "checkEligibility"],
            expectedAnyCallIds: [call.id],
            expectNoMatch: false,
          },
          result.text,
          result.steps,
        ).toolsPass,
      ).toBe(true);
      const eligibility = result.steps
        .flatMap((step) => step.toolResults)
        .find((item) => item.toolName === "checkEligibility");
      expect(eligibility?.output).toMatchObject({ status: "unclear" });
    });

    it("never switches to unrestricted generation when retrieval fails throughout the step budget", async () => {
      mocks.retrieve.mockRejectedValue(
        new Error("embedding service unavailable"),
      );
      const model = installModel();
      const result = await answer(mode);
      const modelCalls =
        mode === "generate" ? model.doGenerateCalls : model.doStreamCalls;
      expect(modelCalls).toHaveLength(5);
      expect(
        modelCalls.every(
          (item) =>
            item.toolChoice?.type === "tool" &&
            item.toolChoice.toolName === "searchCalls",
        ),
      ).toBe(true);
      expect(result.text).toBe("");
      expect(
        evaluateControls(
          {
            expectedTools: ["searchCalls"],
            expectedAnyCallIds: [call.id],
            expectNoMatch: false,
          },
          result.text,
          result.steps,
        ).toolsPass,
      ).toBe(false);
    });

    it("retries an eligibility error instead of counting the attempted call as completed", async () => {
      mocks.retrieve.mockResolvedValue([{ call, similarity: 1 }]);
      const model = installModel(true);
      const result = await answer(mode);
      const modelCalls =
        mode === "generate" ? model.doGenerateCalls : model.doStreamCalls;
      expect(modelCalls.map((item) => item.toolChoice)).toEqual([
        { type: "tool", toolName: "searchCalls" },
        { type: "tool", toolName: "checkEligibility" },
        { type: "tool", toolName: "checkEligibility" },
        { type: "auto" },
      ]);
      expect(result.text).toBe(finalText);
      expect(result.steps[1].toolResults).toHaveLength(0);
      expect(result.steps[2].toolResults).toHaveLength(1);
    });

    it("releases tool forcing only after a valid no-match result", async () => {
      mocks.retrieve.mockResolvedValue([]);
      const model = installModel();
      await answer(mode);
      const modelCalls =
        mode === "generate" ? model.doGenerateCalls : model.doStreamCalls;
      expect(modelCalls.map((item) => item.toolChoice)).toEqual([
        { type: "tool", toolName: "searchCalls" },
        { type: "auto" },
      ]);
    });
  },
);
