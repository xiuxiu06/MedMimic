// Builds the RAG guideline library: data/raw/*.md → chunks → Gemini embeddings → data/guidelines.json
//
// Run (Node 24 runs TypeScript directly):
//   node --env-file=.env.local scripts/embed-guidelines.mts
//   node --env-file=.env.local scripts/embed-guidelines.mts --dry-run   # parse + print chunks, no API calls
//
// Format of data/raw/*.md: see data/raw/_TEMPLATE.md. Files starting with "_" are skipped.
// Each "## " heading becomes one chunk with id "<file id>-NN" (e.g. cssrs-01).

import { GoogleGenAI } from "@google/genai";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Keep in sync with lib/models.ts (MODELS.embedding) and lib/rag.ts (EMBED_DIMS).
const MODEL = "gemini-embedding-001";
const DIMS = 768; // smaller than the default 3072: ~4x smaller file, same quality for 13–80 chunks

const RAW_DIR = join(process.cwd(), "data", "raw");
const OUT_FILE = join(process.cwd(), "data", "guidelines.json");
const dryRun = process.argv.includes("--dry-run");

export interface GuidelineChunk {
  id: string; // e.g. "cssrs-01"
  sourceId: string; // file id, e.g. "cssrs"
  source: string; // display name, e.g. "C-SSRS Screener — Outpatient/Ambulatory"
  section: string; // the ## heading
  text: string; // verbatim body
  url?: string;
  license?: string;
  attribution?: string;
  embedding: number[];
}

// --- minimal front-matter parser (key: value, optional quotes) ---
function parseFile(file: string) {
  const raw = readFileSync(join(RAW_DIR, file), "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter (--- ... ---)`);

  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    meta[kv[1]] = v;
  }
  for (const key of ["id", "source", "url", "license"]) {
    if (!meta[key]) throw new Error(`${file}: front matter is missing "${key}"`);
  }
  if (`${meta.id}.md` !== file) throw new Error(`${file}: id "${meta.id}" must match the file name`);

  // strip HTML comments, then split on "## " headings
  const body = m[2].replace(/<!--[\s\S]*?-->/g, "");
  const sections = body.split(/^## /m).slice(1);
  if (sections.length === 0) throw new Error(`${file}: no "## " sections found`);

  return sections.map((s, i) => {
    const [heading, ...rest] = s.split("\n");
    const text = rest.join("\n").trim();
    if (!text) throw new Error(`${file}: section "${heading}" is empty`);
    return {
      id: `${meta.id}-${String(i + 1).padStart(2, "0")}`,
      sourceId: meta.id,
      source: meta.source,
      section: heading.trim(),
      text,
      url: meta.url,
      license: meta.license,
      attribution: meta.attribution,
    };
  });
}

function normalize(v: number[]): number[] {
  const n = Math.hypot(...v);
  return n ? v.map((x) => x / n) : v;
}

// --- 1) parse ---
const files = readdirSync(RAW_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_")).sort();
const chunks = files.flatMap(parseFile);

console.log(`Parsed ${chunks.length} chunks from ${files.length} files:`);
for (const c of chunks) {
  const words = c.text.split(/\s+/).length;
  const warn = words > 450 ? "  ⚠ long" : words < 40 ? "  ⚠ short" : "";
  console.log(`  ${c.id.padEnd(10)} ${String(words).padStart(4)} words  ${c.section}${warn}`);
}
if (dryRun) process.exit(0);

// --- 2) embed (one batch call) ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is not set (run with --env-file=.env.local)");
const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1beta" } });

// Embed source + heading + text so the heading's meaning helps retrieval.
const inputs = chunks.map((c) => `${c.source}\n${c.section}\n\n${c.text}`);
const res = await ai.models.embedContent({
  model: MODEL,
  contents: inputs,
  config: { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: DIMS },
});
const vectors = res.embeddings?.map((e) => e.values ?? []) ?? [];
if (vectors.length !== chunks.length || vectors.some((v) => v.length !== DIMS)) {
  throw new Error(`Expected ${chunks.length} embeddings of ${DIMS} dims, got ${vectors.length}`);
}

// --- 3) save ---
const out = {
  model: MODEL,
  dims: DIMS,
  createdAt: new Date().toISOString(),
  chunks: chunks.map((c, i): GuidelineChunk => ({
    ...c,
    // Non-default dimensions must be normalized for cosine similarity.
    embedding: normalize(vectors[i]).map((x) => Number(x.toFixed(6))),
  })),
};
writeFileSync(OUT_FILE, JSON.stringify(out) + "\n");
console.log(`\nSaved ${out.chunks.length} chunks × ${DIMS} dims → data/guidelines.json`);
