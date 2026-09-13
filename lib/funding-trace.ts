import { z } from "zod";

/** Only completed, well-formed outputs count as evidence. A requested tool,
 * error, or partial result cannot unlock the next stage or pass evaluation. */
export interface FundingStep {
  toolCalls?: readonly { toolName: string }[];
  toolResults: readonly { type?: string; toolName: string; output?: unknown }[];
}

const searchOutputSchema = z.discriminatedUnion("noMatch", [
  z.object({ noMatch: z.literal(true), matches: z.array(z.never()).length(0) }),
  z.object({
    noMatch: z.literal(false),
    matches: z.array(z.object({ id: z.string().min(2) })).min(1),
  }),
]);
const checkStatus = z.enum(["likely", "unclear", "unlikely"]);
const eligibilityOutputSchema = z.object({
  callId: z.string().min(2),
  status: checkStatus,
  checks: z
    .array(
      z.object({
        criterion: z.enum(["applicant_type", "geography", "consortium"]),
        status: checkStatus,
        explanation: z.string().min(1),
      }),
    )
    .length(3)
    .refine(
      (checks) => new Set(checks.map((check) => check.criterion)).size === 3,
    ),
  source: z.object({ url: z.string().url() }),
});

export function collectFundingTrace(steps: readonly FundingStep[]) {
  const toolNames: string[] = [];
  const successfulToolNames = new Set<string>();
  const retrievedIds = new Set<string>();
  const checkedIds = new Set<string>();
  let sawNoMatch = false;

  for (const step of steps) {
    for (const call of step.toolCalls ?? []) toolNames.push(call.toolName);
    for (const result of step.toolResults) {
      if (result.type !== undefined && result.type !== "tool-result") continue;
      if (result.toolName === "searchCalls") {
        const parsed = searchOutputSchema.safeParse(result.output);
        if (!parsed.success) continue;
        successfulToolNames.add("searchCalls");
        if (parsed.data.noMatch) sawNoMatch = true;
        else
          for (const match of parsed.data.matches) retrievedIds.add(match.id);
      } else if (result.toolName === "checkEligibility") {
        const parsed = eligibilityOutputSchema.safeParse(result.output);
        // Eligibility must follow successful retrieval in this request, not
        // merely name a corpus ID or return the unknown-record fallback.
        if (!parsed.success || !retrievedIds.has(parsed.data.callId)) continue;
        successfulToolNames.add("checkEligibility");
        checkedIds.add(parsed.data.callId);
      }
    }
  }

  return {
    toolNames,
    successfulToolNames,
    retrievedIds,
    checkedIds,
    sawNoMatch,
  };
}
