import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { z } from "zod";
import { calls } from "../lib/corpus";
import { generateFundingAnswer } from "../lib/agent";

const caseSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  expectedTools: z.array(z.string()),
  expectedAnyCallIds: z.array(z.string()),
  expectNoMatch: z.boolean(),
});

type EvalCase = z.infer<typeof caseSchema>;
type EvalResult = {
  id: string;
  score: number;
  tools: boolean;
  retrieval: boolean;
  citations: boolean;
  faithfulness: number;
  note: string;
  answer: string;
  toolNames: string[];
  retrievedIds: string[];
  citationIds: string[];
  sawNoMatch: boolean;
};

const root = resolve(import.meta.dirname, "..");
const cases = z.array(caseSchema).parse(JSON.parse(await readFile(resolve(root, "evals/cases.json"), "utf8")));
const writeReadme = process.argv.includes("--write-readme");

if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY and OPENAI_API_KEY are required for behavioral evals.");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function collectTrace(result: Awaited<ReturnType<typeof generateFundingAnswer>>) {
  const toolNames: string[] = [];
  const retrievedIds = new Set<string>();
  let sawNoMatch = false;

  for (const step of result.steps) {
    for (const call of step.toolCalls) toolNames.push(call.toolName);
    for (const toolResult of step.toolResults) {
      const record = asRecord(toolResult.output);
      if (!record) continue;
      if (record.noMatch === true) sawNoMatch = true;
      if (Array.isArray(record.matches)) {
        for (const match of record.matches) {
          const item = asRecord(match);
          if (typeof item?.id === "string") retrievedIds.add(item.id);
        }
      }
    }
  }

  return { toolNames, retrievedIds, sawNoMatch };
}

function citationIds(text: string) {
  return [...text.matchAll(/\[source:([A-Z0-9-]+)\]/g)].map((match) => match[1]);
}

function parseJudge(text: string): { score: number; reason: string } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { score: 0, reason: "Judge returned invalid JSON" };
  try {
    const parsed = z.object({ score: z.number().min(0).max(1), reason: z.string() }).parse(JSON.parse(match[0]));
    return parsed;
  } catch {
    return { score: 0, reason: "Judge returned invalid JSON" };
  }
}

async function judgeFaithfulness(answer: string, retrievedIds: Set<string>) {
  const evidence = calls
    .filter((call) => retrievedIds.has(call.id))
    .map((call) => ({
      id: call.id,
      title: call.title,
      summary: call.summary,
      countryNotes: call.countryNotes,
      funding: call.funding,
      deadline: call.deadline,
    }));

  const result = await generateText({
    model: anthropic(process.env.EVAL_JUDGE_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5"),
    system: "You are a strict faithfulness evaluator. Use only the supplied evidence. Return JSON and no markdown.",
    prompt: JSON.stringify({
      task: "Score whether every factual funding claim in the answer is supported by the evidence. A cautious caveat is good. Unsupported dates, budgets, eligibility, or programme claims are failures.",
      answer,
      evidence,
      output: { score: "number from 0 to 1", reason: "one short sentence" },
    }),
    temperature: 0,
    maxOutputTokens: 180,
    maxRetries: 1,
  });

  return parseJudge(result.text);
}

async function runCase(evalCase: EvalCase): Promise<EvalResult> {
  const generated = await generateFundingAnswer(evalCase.prompt);
  const trace = collectTrace(generated);
  const citations = citationIds(generated.text);
  const toolsPass = evalCase.expectedTools.every((name) => trace.toolNames.includes(name));
  const retrievalPass = evalCase.expectNoMatch
    ? trace.sawNoMatch && trace.retrievedIds.size === 0
    : evalCase.expectedAnyCallIds.some((id) => trace.retrievedIds.has(id));
  const citationsPass = evalCase.expectNoMatch
    ? citations.length === 0
    : citations.length > 0 && citations.every((id) => trace.retrievedIds.has(id));
  const judge = await judgeFaithfulness(generated.text, trace.retrievedIds);
  const score = (Number(toolsPass) * 0.25) + (Number(retrievalPass) * 0.25) + (Number(citationsPass) * 0.2) + (judge.score * 0.3);

  return {
    id: evalCase.id,
    score: Number(score.toFixed(3)),
    tools: toolsPass,
    retrieval: retrievalPass,
    citations: citationsPass,
    faithfulness: judge.score,
    note: judge.reason,
    answer: generated.text,
    toolNames: trace.toolNames,
    retrievedIds: [...trace.retrievedIds],
    citationIds: citations,
    sawNoMatch: trace.sawNoMatch,
  };
}

const results: EvalResult[] = [];
for (const evalCase of cases) {
  process.stdout.write(`Running ${evalCase.id}... `);
  const result = await runCase(evalCase);
  results.push(result);
  process.stdout.write(`${(result.score * 100).toFixed(1)}%\n`);
}

const overall = results.reduce((sum, result) => sum + result.score, 0) / results.length;
const timestamp = new Date().toISOString();
const table = [
  "| Case | Score | Tools | Retrieval | Citations | Faithfulness |",
  "|---|---:|:---:|:---:|:---:|---:|",
  ...results.map((result) => `| ${result.id} | ${(result.score * 100).toFixed(1)}% | ${result.tools ? "✓" : "✗"} | ${result.retrieval ? "✓" : "✗"} | ${result.citations ? "✓" : "✗"} | ${(result.faithfulness * 100).toFixed(0)}% |`),
  `| **Overall** | **${(overall * 100).toFixed(1)}%** |  |  |  |  |`,
].join("\n");

await mkdir(resolve(root, "evals/results"), { recursive: true });
await writeFile(resolve(root, "evals/results/latest.json"), `${JSON.stringify({ timestamp, overall, results }, null, 2)}\n`);

if (writeReadme) {
  const readmePath = resolve(root, "README.md");
  const readme = await readFile(readmePath, "utf8");
  const replacement = `<!-- EVAL_RESULTS_START -->\n_Last credentialed run: ${timestamp}_\n\n${table}\n<!-- EVAL_RESULTS_END -->`;
  const updated = readme.replace(/<!-- EVAL_RESULTS_START -->[\s\S]*<!-- EVAL_RESULTS_END -->/, replacement);
  if (updated === readme) throw new Error("README eval result markers were not found.");
  await writeFile(readmePath, updated, "utf8");
}

process.stdout.write(`\n${table}\n`);
if (overall < Number(process.env.EVAL_MIN_SCORE ?? 0.75)) process.exitCode = 1;
