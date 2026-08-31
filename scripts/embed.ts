import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { callToEmbeddingText } from "../lib/corpus";
import { corpusSchema } from "../lib/schema";

const root = resolve(import.meta.dirname, "..");
const corpusPath = resolve(root, "data/calls.json");
const vectorsPath = resolve(root, "data/vectors.json");
const modelName = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
const batchSize = 16;

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required to rebuild the vector snapshot.");
}

const rawCorpus = await readFile(corpusPath, "utf8");
const corpus = corpusSchema.parse(JSON.parse(rawCorpus));
const items: Array<{ id: string; embedding: number[] }> = [];

for (let offset = 0; offset < corpus.calls.length; offset += batchSize) {
  const batch = corpus.calls.slice(offset, offset + batchSize);
  const { embeddings } = await embedMany({
    model: openai.embedding(modelName),
    values: batch.map(callToEmbeddingText),
  });

  batch.forEach((call, index) => {
    const embedding = embeddings[index];
    if (!embedding) throw new Error(`Missing embedding for ${call.id}`);
    items.push({ id: call.id, embedding });
  });

  process.stdout.write(`Embedded ${Math.min(offset + batch.length, corpus.calls.length)}/${corpus.calls.length}\n`);
}

const dimensions = items[0]?.embedding.length;
if (!dimensions || items.some((item) => item.embedding.length !== dimensions)) {
  throw new Error("Embedding provider returned an invalid dimension set.");
}

const index = {
  model: modelName,
  dimensions,
  generatedAt: new Date().toISOString(),
  corpusSha256: createHash("sha256").update(rawCorpus).digest("hex"),
  items,
};

await writeFile(vectorsPath, `${JSON.stringify(index)}\n`, "utf8");
process.stdout.write(`Wrote ${items.length} ${modelName} vectors (${dimensions} dimensions) to data/vectors.json\n`);
