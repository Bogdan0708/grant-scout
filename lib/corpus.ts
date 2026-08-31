import corpusJson from "@/data/calls.json";
import { corpusSchema, type FundingCall } from "@/lib/schema";

export const corpus = corpusSchema.parse(corpusJson);
export const calls = corpus.calls;

const callsById = new Map(calls.map((call) => [call.id, call]));

export function getCall(id: string): FundingCall | undefined {
  return callsById.get(id);
}

export function callToEmbeddingText(call: FundingCall): string {
  return [
    `Title: ${call.title}`,
    `Programme: ${call.programme}`,
    `Summary: ${call.summary}`,
    `Objectives: ${call.objectives.join(", ")}`,
    `Applicants: ${call.applicantTypes.join(", ")}`,
    `Geography: ${call.geography}. ${call.countryNotes}`,
    `Consortium: ${call.consortium}`,
    `Funding: ${call.funding.budgetLabel}. ${call.funding.cofundingRate}`,
    `Deadline: ${call.deadline.label}`,
    `Sectors: ${call.sectors.join(", ")}`,
    `Keywords: ${call.keywords.join(", ")}`,
  ].join("\n");
}
