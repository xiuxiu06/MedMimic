import { gemini } from "@/lib/gemini";
import { eventText } from "@/lib/labels";
import { MODELS } from "@/lib/models";
import { chunkById, retrieveForLabels, toCitation, type GuidelineChunk } from "@/lib/rag";
import { flaggedEvents, outcomeFor, scoreBranch, type FlaggedEvent } from "@/lib/scoring";
import type { Branch, Debrief, FeedbackItem } from "@/lib/types";

export const maxDuration = 60;

export type OutcomeTone = "ok" | "warn" | "bad";
export interface DebriefResponse {
  debrief: Debrief;
  outcome: { tone: OutcomeTone; detail: string };
  meta: { model: string | null; usedRetrievalFallback: boolean; usedFeedbackFallback: boolean };
}

const TONE = { pass: "ok", warn: "warn", fail: "bad" } as const;

const OUTCOME_TITLE = {
  risk_identified: "Risk identified",
  risk_underestimated: "Risk underestimated",
  risk_missed: "Suicide risk not identified",
} as const;

// Template feedback when Gemini is unavailable (429/503). Still cites retrieved passages.
const FALLBACK_TEXT: Record<FlaggedEvent["kind"], (label: string) => string> = {
  missed: (l) => `${eventText(l)}. Low mood, insomnia, and a major loss call for a direct, structured suicide inquiry.`,
  unsafe: () => "A sleep aid was recommended before risk was assessed, which can increase access to lethal means.",
  communication: (l) => `${eventText(l)} reduced trust. Reflect the patient's own words before moving on.`,
  strength: (l) => `${eventText(l)}: this moved the interview forward and supported disclosure.`,
};

const FEEDBACK_SCHEMA = {
  type: "object",
  properties: {
    feedback: {
      type: "array",
      items: {
        type: "object",
        properties: {
          flagIndex: { type: "integer", description: "Index into the FLAGS list" },
          feedback: { type: "string", description: "1–2 sentences, second person, specific and constructive" },
          citationIds: { type: "array", items: { type: "string" } },
        },
        required: ["flagIndex", "feedback", "citationIds"],
      },
    },
  },
  required: ["feedback"],
};

function buildPrompt(branch: Branch, flags: FlaggedEvent[], passages: Record<string, GuidelineChunk[]>): string {
  const flagLines = flags.map((f, i) => {
    const e = branch.timeline[f.index];
    const ids = (passages[f.label] ?? []).map((c) => c.id).join(", ") || "none";
    return `${i}. kind=${f.kind}; event="${eventText(f.label)}"${e?.quote ? `; student said: "${e.quote}"` : ""}; allowed citationIds: [${ids}]`;
  });
  const allChunks = [...new Map(Object.values(passages).flat().map((c) => [c.id, c])).values()];
  const passageText = allChunks.map((c) => `[${c.id}] ${c.source} — ${c.section}\n${c.text}`).join("\n\n");

  return `You are a clinical skills tutor debriefing a student after a SIMULATED psychiatric interview with a fictional patient (Jordan, 34, insomnia after job loss; hidden depression and suicidal thoughts). Education only.

Write one feedback item per FLAG below.
Rules:
- Base every statement ONLY on the PASSAGES. Do not add clinical facts that are not in them.
- Cite 1–2 passage ids per item, chosen ONLY from that flag's allowed citationIds. Strengths may cite nothing.
- 1–2 sentences, second person ("You..."), specific, constructive, no headings, no quotes of the student (the UI shows them).

FLAGS:
${flagLines.join("\n")}

PASSAGES:
${passageText}`;
}

export async function POST(request: Request) {
  let branch: Branch;
  try {
    branch = ((await request.json()) as { branch: Branch }).branch;
    if (!branch?.timeline || !branch?.finalState) throw new Error("missing branch");
  } catch {
    return Response.json({ error: "Body must be { branch: Branch }" }, { status: 400 });
  }

  const outcome = outcomeFor(branch);
  const scores = scoreBranch(branch);
  const flags = flaggedEvents(branch);
  const { results: passages, usedFallback: usedRetrievalFallback } = await retrieveForLabels(
    flags.map((f) => f.label),
  );

  // Gemini feedback (structured), validated against retrieved ids.
  type Generated = { flagIndex: number; feedback: string; citationIds: string[] }[];
  let generated = null as Generated | null;
  if (flags.length > 0) {
    try {
      const res = await gemini().models.generateContent({
        model: MODELS.debrief,
        contents: buildPrompt(branch, flags, passages),
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: FEEDBACK_SCHEMA,
          temperature: 0.3,
        },
      });
      const parsed = JSON.parse(res.text ?? "{}") as { feedback?: Generated };
      generated = Array.isArray(parsed.feedback) ? parsed.feedback : null;
    } catch {
      generated = null;
    }
  }

  const feedback: FeedbackItem[] = flags.map((f, i) => {
    const allowed = passages[f.label] ?? [];
    const allowedIds = new Set(allowed.map((c) => c.id));
    const g = generated?.find((x) => x.flagIndex === i);
    const ids = g ? g.citationIds.filter((id) => allowedIds.has(id)) : [];
    // Non-strength items must always carry a citation; fall back to the top retrieved passage.
    const finalIds = ids.length > 0 || f.kind === "strength" ? ids : allowed.slice(0, 1).map((c) => c.id);
    const event = branch.timeline[f.index];
    return {
      kind: f.kind,
      timelineRef: f.index,
      quote: event?.quote, // always from the timeline, never from the model
      feedback: g?.feedback?.trim() || FALLBACK_TEXT[f.kind](f.label),
      citations: finalIds
        .map((id) => chunkById(id))
        .filter((c): c is GuidelineChunk => Boolean(c))
        .map(toCitation),
    };
  });

  const body: DebriefResponse = {
    debrief: { outcome: OUTCOME_TITLE[outcome.code], scores, feedback },
    outcome: { tone: TONE[outcome.badge], detail: outcome.summary },
    meta: {
      model: generated ? MODELS.debrief : null,
      usedRetrievalFallback,
      usedFeedbackFallback: flags.length > 0 && !generated,
    },
  };
  return Response.json(body);
}
