import "server-only";
import { gemini } from "./gemini";
import { MODELS } from "./models";
import type { Message, TurnLabel } from "./types";

export const VALID_TURN_LABELS: readonly TurnLabel[] = [
  "asked_mood",
  "asked_onset",
  "asked_hope",
  "asked_SI_directly",
  "asked_plan",
  "asked_support",
  "reflection",
  "empathy",
  "premature_reassurance",
  "dismissive",
  "closed_rapid",
  "other",
] as const;

const VALID_LABEL_SET = new Set<string>(VALID_TURN_LABELS);

const CLASSIFIER_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    labels: {
      type: "array",
      description:
        "All communication and clinical inquiry labels that apply to the student's utterance (1 to 4 labels).",
      items: {
        type: "string",
        enum: [...VALID_TURN_LABELS],
      },
      minItems: 1,
      maxItems: 4,
    },
  },
  required: ["labels"],
};

const CLASSIFIER_SYSTEM_PROMPT = `You are a clinical communication evaluator for a psychiatric standardized-patient interview simulation.
Classify ONLY the healthcare student's latest message into 1 to 4 labels from the allowed enum. Multiple labels MAY apply to a single utterance (for example, reflecting the patient's words AND asking directly about suicide -> ["reflection", "asked_SI_directly"]).

Label definitions:
- "asked_onset": Asks when sleep trouble or symptoms started, timeline/duration, or what life/work changes happened around onset.
- "asked_mood": Asks about emotional state, mood, sadness, depression, energy, or loss of interest/pleasure.
- "asked_hope": Asks about the future, hope, outlook, or whether things feel like they can get better.
- "asked_SI_directly": Explicitly and directly asks about suicidal thoughts, wanting to die, not wanting to wake up, ending their life, or self-harm. IMPORTANT: vague questions like "Are you safe?" or "Having any dark thoughts?" do NOT count as "asked_SI_directly"—it must be direct and unambiguous.
- "asked_plan": Asks about a specific suicide plan, method, preparation, or access to lethal means at home (e.g., pills, medications, weapons).
- "asked_support": Asks about support system, family, friends, people they care about, protective factors, or reasons for living.
- "reflection": Mirrors, paraphrases, or reflects the patient's own words or emotional experience (e.g., echoing the patient's word "heavy", or summarizing what the patient just shared).
- "empathy": Validates feelings, expresses genuine warmth/care, thanks the patient for sharing, or normalizes their struggle ("Many people going through a sudden layoff feel overwhelmed").
- "premature_reassurance": Offers cliché or premature reassurance before understanding ("You'll be fine", "Things will work out", "Don't worry, you'll find a new job soon").
- "dismissive": Minimizes feelings, judges, lectures, rushes, or brushes off the patient's distress ("Everyone loses sleep", "Just try relaxing", "You shouldn't feel that way").
- "closed_rapid": Stacks 3+ rapid-fire closed yes/no checklist questions in a single turn or interrogates mechanically without rapport.
- "other": Use ONLY when none of the specific labels above apply (e.g., simple greeting or logistical remark). Never pair "other" with specific labels.`;

export function resolveFastModelCandidates(): string[] {
  const configured: string = MODELS.classifier;
  const primary =
    !configured ||
    configured.startsWith("TODO") ||
    configured === "gemini-flash-latest"
      ? "gemini-3.5-flash"
      : configured;

  return Array.from(
    new Set([
      primary,
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
    ]),
  );
}

export function resolveFastModel(): string {
  return resolveFastModelCandidates()[0];
}

export function sanitizeTurnLabels(raw: unknown): TurnLabel[] {
  if (!Array.isArray(raw)) return ["other"];
  const valid = raw.filter(
    (item): item is TurnLabel =>
      typeof item === "string" && VALID_LABEL_SET.has(item),
  );
  if (valid.length === 0) return ["other"];
  const withoutRedundantOther =
    valid.length > 1 ? valid.filter((l) => l !== "other") : valid;
  return Array.from(new Set(withoutRedundantOther));
}

/**
 * Deterministic fallback classifier used only if all Gemini endpoints return 503/429
 * during a live demo spike.
 */
export function heuristicClassifyTurn(
  studentText: string,
  lastPatientText?: string,
): TurnLabel[] {
  const lower = studentText.toLowerCase();
  const labels: TurnLabel[] = [];

  if (
    /\b(when did|how long|started|start|two months|changed|life change|what happened|laid off|job)\b/.test(
      lower,
    )
  ) {
    labels.push("asked_onset");
  }
  if (/\b(mood|feeling|sad|depress|down|enjoy|interest|energy)\b/.test(lower)) {
    labels.push("asked_mood");
  }
  if (/\b(future|hope|hopeless|ahead|better|outlook|point)\b/.test(lower)) {
    labels.push("asked_hope");
  }
  if (
    /\b(suicid|kill yourself|end your life|ending your life|hurt yourself|hurting yourself|want to die|not wake up|better off dead|take your life)\b/.test(
      lower,
    )
  ) {
    labels.push("asked_SI_directly");
  }
  if (
    /\b(plan|how would you|pills|medication|stockpile|cabinet|means|access to|weapons)\b/.test(
      lower,
    )
  ) {
    labels.push("asked_plan");
  }
  if (
    /\b(support|family|sister|friends|anyone|keep you going|reasons for living|corner|close to)\b/.test(
      lower,
    )
  ) {
    labels.push("asked_support");
  }
  if (
    /\b(heavy|sounds like you|you mentioned|hearing that|carrying)\b/.test(
      lower,
    ) ||
    (lastPatientText &&
      /\bheavy\b/i.test(lastPatientText) &&
      /\bheavy\b/i.test(studentText))
  ) {
    labels.push("reflection");
  }
  if (
    /\b(thank you for|sorry you're going through|really hard|understandable|many people|here with you|appreciate you sharing)\b/.test(
      lower,
    )
  ) {
    labels.push("empathy");
  }
  if (
    /\b(you'll be fine|you will be fine|don't worry|things will work out|everything happens for a reason|totally fine)\b/.test(
      lower,
    )
  ) {
    labels.push("premature_reassurance");
  }
  if (
    /\b(everyone loses sleep|stop dwelling|get over it|not a big deal|just relax)\b/.test(
      lower,
    )
  ) {
    labels.push("dismissive");
  }

  return labels.length > 0 ? Array.from(new Set(labels)) : ["other"];
}

export interface ClassifyTurnOptions {
  studentText: string;
  recentMessages?: readonly Message[];
}

/**
 * Classifies a student utterance into structured `TurnLabel[]` via Gemini Interactions API,
 * with automatic model fallback on 503/429 high-demand spikes.
 */
export async function classifyStudentTurn({
  studentText,
  recentMessages = [],
}: ClassifyTurnOptions): Promise<TurnLabel[]> {
  const trimmed = studentText.trim();
  if (!trimmed) return ["other"];

  const lastPatientMsg = [...recentMessages]
    .reverse()
    .find((m) => m.role === "patient");

  const promptInput = lastPatientMsg
    ? `Previous patient statement: "${lastPatientMsg.text}"\nStudent utterance to classify: "${trimmed}"`
    : `Student utterance to classify: "${trimmed}"`;

  for (const model of resolveFastModelCandidates()) {
    try {
      const interaction = await gemini().interactions.create({
        model,
        system_instruction: CLASSIFIER_SYSTEM_PROMPT,
        input: promptInput,
        store: false,
        generation_config: {
          temperature: 0,
          ...(model.startsWith("gemini-3")
            ? { thinking_level: "minimal" as const }
            : {}),
        },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: CLASSIFIER_RESPONSE_SCHEMA,
        },
        safety_settings: [
          { type: "dangerous_content", threshold: "block_only_high" },
          { type: "harassment", threshold: "block_only_high" },
          { type: "hate_speech", threshold: "block_only_high" },
          { type: "sexually_explicit", threshold: "block_only_high" },
        ],
      });

      const rawText = interaction.output_text?.trim();
      if (rawText) {
        const parsed = JSON.parse(rawText) as { labels?: unknown };
        return sanitizeTurnLabels(parsed.labels);
      }
    } catch {
      // Try next candidate model on 503/429
    }
  }

  return heuristicClassifyTurn(trimmed, lastPatientMsg?.text);
}
