import "server-only";
import library from "@/data/guidelines.json";
import { gemini } from "./gemini";
import { SOURCE_SHORT } from "./labels";
import { MODELS } from "./models";
import type { Citation } from "./types";

// RAG over the guideline library built by scripts/embed-guidelines.mts.
// Query settings must match the library: same model, RETRIEVAL_QUERY, same dims, normalized.

export interface GuidelineChunk {
  id: string;
  sourceId: string;
  source: string;
  section: string;
  text: string;
  url?: string;
  embedding: number[];
}

const LIB = library as { model: string; dims: number; chunks: GuidelineChunk[] };
const BY_ID = new Map(LIB.chunks.map((c) => [c.id, c]));

// Flag label (lib/scoring.ts) → retrieval query. Verified with scripts/search-guidelines.mts.
export const QUERY_FOR_LABEL: Record<string, string> = {
  "missed:asked_SI_directly": "how to ask directly about suicidal thoughts and ideation",
  "missed:asked_plan": "asking about a suicide plan, method, intent, and preparation",
  "missed:asked_support": "protective factors, social support, reasons for living",
  premature_reassurance: "avoid premature reassurance; use reflective listening and empathy",
  dismissive: "avoid premature reassurance; use reflective listening and empathy",
  closed_rapid: "too many closed questions, interrogation, question-and-answer trap",
  si_denied_low_trust: "building trust with reflective listening before asking about suicide",
  sleep_aid: "access to lethal means, safety planning, means counseling",
  asked_SI_directly: "how to ask directly about suicidal thoughts and ideation",
  asked_plan: "asking about a suicide plan, method, intent, and preparation",
  asked_support: "protective factors, social support, reasons for living",
  reflection: "reflective listening, empathy, trust",
  empathy: "reflective listening, empathy, trust",
};

// Used when the embedding call fails, so feedback never loses its citations.
// Top results from the verified retrieval tests.
const FALLBACK_CHUNKS: Record<string, string[]> = {
  "missed:asked_SI_directly": ["safet-03", "cssrs-01"],
  "missed:asked_plan": ["safet-03", "cssrs-01"],
  "missed:asked_support": ["safet-02"],
  premature_reassurance: ["oars-02", "oars-04"],
  dismissive: ["oars-02", "oars-04"],
  closed_rapid: ["oars-04", "oars-01"],
  si_denied_low_trust: ["oars-02", "safet-03"],
  sleep_aid: ["safet-04", "safet-02"],
  asked_SI_directly: ["safet-03", "cssrs-01"],
  asked_plan: ["safet-03", "cssrs-01"],
  asked_support: ["safet-02"],
  reflection: ["oars-02"],
  empathy: ["oars-02"],
};

export function chunkById(id: string): GuidelineChunk | undefined {
  return BY_ID.get(id);
}

export function toCitation(c: GuidelineChunk): Citation {
  // Short section label: text before the first ":" or " — " in the heading.
  const section = c.section.split(/:| — /)[0].trim();
  return { sourceId: c.id, source: SOURCE_SHORT[c.sourceId] ?? c.source, section, url: c.url };
}

function normalize(v: number[]): number[] {
  const n = Math.hypot(...v);
  return n ? v.map((x) => x / n) : v;
}

function rank(queryVec: number[], k: number): GuidelineChunk[] {
  return LIB.chunks
    .map((c) => ({ c, score: c.embedding.reduce((s, x, j) => s + x * queryVec[j], 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r) => r.c);
}

/**
 * Retrieve top-k chunks for each label in one batched embedding call.
 * Returns label → chunks. Falls back to FALLBACK_CHUNKS if embedding fails.
 */
export async function retrieveForLabels(
  labels: string[],
  k = 2,
): Promise<{ results: Record<string, GuidelineChunk[]>; usedFallback: boolean }> {
  const unique = [...new Set(labels)].filter((l) => QUERY_FOR_LABEL[l]);
  const results: Record<string, GuidelineChunk[]> = {};
  if (unique.length === 0) return { results, usedFallback: false };

  try {
    const res = await gemini().models.embedContent({
      model: MODELS.embedding,
      contents: unique.map((l) => QUERY_FOR_LABEL[l]),
      config: { taskType: "RETRIEVAL_QUERY", outputDimensionality: LIB.dims },
    });
    unique.forEach((label, i) => {
      const values = res.embeddings?.[i]?.values;
      if (!values || values.length !== LIB.dims) throw new Error("bad embedding");
      results[label] = rank(normalize(values), k);
    });
    return { results, usedFallback: false };
  } catch {
    for (const label of unique) {
      results[label] = (FALLBACK_CHUNKS[label] ?? [])
        .map((id) => BY_ID.get(id))
        .filter((c): c is GuidelineChunk => Boolean(c))
        .slice(0, k);
    }
    return { results, usedFallback: true };
  }
}
