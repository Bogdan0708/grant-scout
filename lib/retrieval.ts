import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import vectorsJson from "@/data/vectors.json";
import { calls } from "@/lib/corpus";
import { vectorIndexSchema, type ApplicantType, type FundingCall } from "@/lib/schema";

export type SearchFilters = {
  applicantType?: ApplicantType;
  programme?: string;
};

export type SearchMatch = {
  call: FundingCall;
  similarity: number;
};

type QueryEmbedder = (query: string) => Promise<number[]>;

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    throw new Error("Embedding dimensions do not match");
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function validateVectorIndex() {
  const index = vectorIndexSchema.parse(vectorsJson);
  const callIds = new Set(calls.map((call) => call.id));
  const vectorIds = new Set(index.items.map((item) => item.id));

  if (index.items.length !== calls.length) {
    throw new Error(`Vector index has ${index.items.length} items for ${calls.length} calls. Run npm run embed.`);
  }
  if (index.items.some((item) => item.embedding.length !== index.dimensions)) {
    throw new Error("Vector index contains inconsistent dimensions. Run npm run embed.");
  }
  if ([...callIds].some((id) => !vectorIds.has(id)) || [...vectorIds].some((id) => !callIds.has(id))) {
    throw new Error("Vector index IDs do not match the funding corpus. Run npm run embed.");
  }

  return index;
}

async function embedQueryWithOpenAI(query: string): Promise<number[]> {
  const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  const { embedding } = await embed({
    model: openai.embedding(model),
    value: query,
  });
  return embedding;
}

export function createRetriever(embedQuery: QueryEmbedder = embedQueryWithOpenAI) {
  return async function retrieve(
    query: string,
    options: { topK?: number; minSimilarity?: number; filters?: SearchFilters } = {},
  ): Promise<SearchMatch[]> {
    const index = validateVectorIndex();
    const queryVector = await embedQuery(query);

    if (queryVector.length !== index.dimensions) {
      throw new Error(`Query embedding has ${queryVector.length} dimensions; expected ${index.dimensions}.`);
    }

    const { topK = 4, minSimilarity = 0.25, filters = {} } = options;
    const callById = new Map(calls.map((call) => [call.id, call]));

    return index.items
      .map((item) => ({ call: callById.get(item.id), similarity: cosineSimilarity(queryVector, item.embedding) }))
      .filter((match): match is SearchMatch => Boolean(match.call))
      .filter(({ call }) => !filters.applicantType || call.applicantTypes.includes(filters.applicantType))
      .filter(({ call }) => !filters.programme || call.programme.toLowerCase().includes(filters.programme.toLowerCase()))
      .filter(({ similarity }) => similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Math.min(Math.max(topK, 1), 5));
  };
}

export const retrieveCalls = createRetriever();
