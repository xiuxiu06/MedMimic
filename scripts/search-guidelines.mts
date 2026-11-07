// Quick retrieval test against data/guidelines.json.
//   node --env-file=.env.local scripts/search-guidelines.mts "how to ask directly about suicide"
//   node --env-file=.env.local scripts/search-guidelines.mts            # runs the built-in test queries

import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Chunk = { id: string; source: string; section: string; text: string; embedding: number[] };
const lib = JSON.parse(readFileSync(join(process.cwd(), "data", "guidelines.json"), "utf8")) as {
  model: string;
  dims: number;
  chunks: Chunk[];
};

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { apiVersion: "v1beta" },
});

// Test queries ≈ what the debrief will send for each flagged timeline event.
const DEFAULT_QUERIES: [string, string][] = [
  ["missed:asked_SI_directly", "how to ask directly about suicidal thoughts and ideation"],
  ["missed:asked_plan", "asking about a suicide plan, method, intent, and preparation"],
  ["premature_reassurance", "avoid premature reassurance; use reflective listening and empathy"],
  ["closed_rapid", "too many closed questions, interrogation, question-and-answer trap"],
  ["sleep_aid without risk check", "access to lethal means, safety planning, means counseling"],
  ["missed:asked_support", "protective factors, social support, reasons for living"],
  ["mood screen", "screening for depression symptoms over the last two weeks"],
];

const arg = process.argv.slice(2).join(" ").trim();
const queries: [string, string][] = arg ? [["custom", arg]] : DEFAULT_QUERIES;

const res = await ai.models.embedContent({
  model: lib.model,
  contents: queries.map(([, q]) => q),
  config: { taskType: "RETRIEVAL_QUERY", outputDimensionality: lib.dims },
});

for (const [i, [label, q]] of queries.entries()) {
  const v = res.embeddings?.[i]?.values ?? [];
  const n = Math.hypot(...v);
  const qv = v.map((x) => x / n);
  const ranked = lib.chunks
    .map((c) => ({ c, score: c.embedding.reduce((s, x, j) => s + x * qv[j], 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  console.log(`\n[${label}] "${q}"`);
  for (const { c, score } of ranked) {
    console.log(`  ${score.toFixed(3)}  ${c.id.padEnd(9)} ${c.section}`);
  }
}
