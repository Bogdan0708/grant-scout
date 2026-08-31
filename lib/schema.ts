import { z } from "zod";

export const applicantTypeSchema = z.enum([
  "startup",
  "sme",
  "research_organisation",
  "university",
  "public_authority",
  "large_enterprise",
  "nonprofit",
  "individual",
]);

export const fundingCallSchema = z.object({
  id: z.string().min(2),
  title: z.string().min(3),
  programme: z.string().min(2),
  summary: z.string().min(10),
  objectives: z.array(z.string()).min(1),
  applicantTypes: z.array(applicantTypeSchema).min(1),
  geography: z.enum(["EU_MEMBERS", "EU_AND_ASSOCIATED", "PROGRAMME_COUNTRIES"]),
  countryNotes: z.string().min(10),
  consortium: z.enum(["required", "usually_required", "not_required", "varies"]),
  funding: z.object({
    budgetLabel: z.string().min(2),
    maxGrantEur: z.number().positive().nullable(),
    cofundingRate: z.string().min(2),
  }),
  deadline: z.object({
    kind: z.enum(["annual", "periodic", "multiple_cutoffs", "varies"]),
    date: z.string().date().nullable(),
    label: z.string().min(2),
  }),
  sectors: z.array(z.string()).min(1),
  keywords: z.array(z.string()).min(1),
  source: z.object({
    label: z.string().min(2),
    url: z.string().url().startsWith("https://"),
    accessedAt: z.string().date(),
  }),
});

export const corpusSchema = z.object({
  snapshotDate: z.string().date(),
  disclaimer: z.string().min(20),
  calls: z.array(fundingCallSchema).min(1),
});

export const vectorIndexSchema = z.object({
  model: z.string().min(2),
  dimensions: z.number().int().positive(),
  generatedAt: z.string().datetime(),
  corpusSha256: z.string().regex(/^[a-f0-9]{64}$/),
  items: z.array(z.object({
    id: z.string(),
    embedding: z.array(z.number()).min(1),
  })),
});

export type ApplicantType = z.infer<typeof applicantTypeSchema>;
export type FundingCall = z.infer<typeof fundingCallSchema>;
export type FundingCorpus = z.infer<typeof corpusSchema>;
export type VectorIndex = z.infer<typeof vectorIndexSchema>;
