import { getCall } from "@/lib/corpus";
import type { ApplicantType, FundingCall } from "@/lib/schema";

export type CheckStatus = "likely" | "unclear" | "unlikely";

type Check = {
  criterion: "applicant_type" | "geography" | "consortium";
  status: CheckStatus;
  explanation: string;
};

const EU_COUNTRIES = new Set([
  "austria", "belgium", "bulgaria", "croatia", "cyprus", "czechia", "czech republic",
  "denmark", "estonia", "finland", "france", "germany", "greece", "hungary", "ireland",
  "italy", "latvia", "lithuania", "luxembourg", "malta", "netherlands", "poland", "portugal",
  "romania", "slovakia", "slovenia", "spain", "sweden",
]);

const ASSOCIATED_COUNTRIES = new Set([
  "united kingdom", "uk", "norway", "iceland", "israel", "turkey", "türkiye", "ukraine",
  "moldova", "serbia", "montenegro", "albania", "north macedonia", "bosnia and herzegovina",
  "georgia", "armenia", "tunisia", "new zealand", "canada", "switzerland",
]);

function geographyCheck(call: FundingCall, country: string): Check {
  const normalised = country.trim().toLowerCase();
  if (EU_COUNTRIES.has(normalised)) {
    return {
      criterion: "geography",
      status: "likely",
      explanation: `${country} is an EU Member State. The specific call conditions still control.`,
    };
  }

  if (call.geography === "EU_MEMBERS") {
    return {
      criterion: "geography",
      status: "unlikely",
      explanation: `${call.title} is represented here as an EU Member State instrument. ${country} needs a call-specific exception or eligible EU establishment.`,
    };
  }

  if (ASSOCIATED_COUNTRIES.has(normalised)) {
    return {
      criterion: "geography",
      status: "unclear",
      explanation: `${country} participates in some EU programmes, but association and restrictions differ by programme and call. Verify the official topic.`,
    };
  }

  return {
    criterion: "geography",
    status: "unclear",
    explanation: `The snapshot cannot establish ${country}'s participation. Verify the official call conditions.`,
  };
}

export function checkCallEligibility(input: {
  callId: string;
  applicantType: ApplicantType;
  country: string;
  hasPartners?: boolean;
}) {
  const call = getCall(input.callId);
  if (!call) {
    return {
      status: "unclear" as const,
      callId: input.callId,
      checks: [],
      explanation: "The requested call is not in this snapshot. Search the corpus before checking eligibility.",
      source: null,
    };
  }

  const checks: Check[] = [
    {
      criterion: "applicant_type",
      status: call.applicantTypes.includes(input.applicantType) ? "likely" : "unlikely",
      explanation: call.applicantTypes.includes(input.applicantType)
        ? `${input.applicantType} appears in the snapshot's eligible applicant profiles.`
        : `${input.applicantType} is not listed among this snapshot's applicant profiles.`,
    },
    geographyCheck(call, input.country),
  ];

  if (input.hasPartners !== undefined) {
    let consortiumStatus: CheckStatus = "likely";
    let explanation = "The stated partnership setup is compatible with the snapshot.";

    if (!input.hasPartners && call.consortium === "required") {
      consortiumStatus = "unlikely";
      explanation = "This opportunity requires a consortium, but the applicant has no partners.";
    } else if (!input.hasPartners && call.consortium === "usually_required") {
      consortiumStatus = "unclear";
      explanation = "This opportunity usually requires a consortium; inspect the specific topic conditions.";
    } else if (call.consortium === "varies") {
      consortiumStatus = "unclear";
      explanation = "Consortium requirements vary by the specific action.";
    }

    checks.push({ criterion: "consortium", status: consortiumStatus, explanation });
  }

  const status: CheckStatus = checks.some((check) => check.status === "unlikely")
    ? "unlikely"
    : checks.some((check) => check.status === "unclear")
      ? "unclear"
      : "likely";

  return {
    status,
    callId: call.id,
    title: call.title,
    checks,
    caveat: "This is a deterministic pre-screen, not a legal eligibility decision. The official call document controls.",
    source: call.source,
  };
}
