import { retrieveCalls } from "../lib/retrieval";

const queries = process.argv.slice(2);
if (queries.length === 0) {
  throw new Error("Pass one or more quoted queries to probe retrieval.");
}

for (const query of queries) {
  const matches = await retrieveCalls(query, { topK: 5, minSimilarity: -1 });
  process.stdout.write(`\n${query}\n`);
  for (const match of matches) {
    process.stdout.write(`  ${match.similarity.toFixed(4)}  ${match.call.id}  ${match.call.title}\n`);
  }
}
