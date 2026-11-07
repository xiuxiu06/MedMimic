// Deterministic rubric scoring + feedback flagging. Pure: no API calls, safe on client or server.
// Uses Person A's evaluateOutcome (import only — do not edit lib/engine.ts here).
import { evaluateOutcome, type EncounterOutcome } from "./engine";
import type { Branch, RubricScore, TimelineEvent } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n)));

function turnLabels(timeline: TimelineEvent[]): Set<string> {
  return new Set(timeline.filter((e) => e.kind === "turn").map((e) => e.label));
}

function countTurns(timeline: TimelineEvent[], labels: string[]): number {
  return timeline.filter((e) => e.kind === "turn" && labels.includes(e.label)).length;
}

export function outcomeFor(branch: Branch): EncounterOutcome {
  return evaluateOutcome(branch.finalState, branch.timeline);
}

export function scoreBranch(branch: Branch): RubricScore[] {
  const { timeline, finalState: s } = branch;
  const asked = turnLabels(timeline);
  const unlocked = new Set(s.unlocked);
  const outcome = outcomeFor(branch);

  // Rapport: warmth minus dismissiveness, nudged by final trust.
  const warm = countTurns(timeline, ["reflection", "empathy"]);
  const cold = countTurns(timeline, ["premature_reassurance", "dismissive", "closed_rapid"]);
  const rapport = 3 + warm * 1.5 - cold * 2 + (s.trust - 50) / 12;

  // Mood history: explored onset, mood, and hope; got the patient to share.
  const mood =
    (asked.has("asked_onset") ? 2 : 0) +
    (asked.has("asked_mood") ? 3 : 0) +
    (asked.has("asked_hope") ? 2 : 0) +
    (unlocked.has("low_mood") ? 1.5 : 0) +
    (unlocked.has("hopelessness") ? 1.5 : 0);

  // Risk assessment: asked directly, followed up on plan, used a structured screen, committed to a level.
  const risk =
    (asked.has("asked_SI_directly") ? 3.5 : 0) +
    (asked.has("asked_plan") ? 2 : 0) +
    (asked.has("asked_support") ? 1 : 0) +
    (s.actions.includes("cssrs") ? 1.5 : 0) +
    (unlocked.has("suicidal_thoughts") ? 1 : 0) +
    (s.studentRisk ? 1 : 0);

  // Disposition: anchored on the engine's outcome.
  const base = outcome.badge === "pass" ? 8 : outcome.badge === "warn" ? 4.5 : 1.5;
  const disposition =
    base +
    (s.actions.includes("safety_plan") ? 1 : 0) +
    (s.actions.includes("consult") ? 1 : 0) -
    (s.actions.includes("sleep_aid") ? 2 : 0);

  return [
    { criterion: "rapport", score: clamp(rapport) },
    { criterion: "mood_history", score: clamp(mood) },
    { criterion: "risk_assessment", score: clamp(risk) },
    { criterion: "disposition", score: clamp(disposition) },
  ];
}

export type FlagKind = "missed" | "unsafe" | "communication" | "strength";

export interface FlaggedEvent {
  index: number; // into branch.timeline
  kind: FlagKind;
  label: string; // retrieval key (see lib/rag.ts QUERY_FOR_LABEL)
}

const NEGATIVE_TURNS = new Set(["premature_reassurance", "dismissive", "closed_rapid"]);
const STRENGTH_TURNS = new Set(["asked_SI_directly", "reflection", "empathy", "asked_plan", "asked_support"]);

/** Timeline events worth feedback, most important first (max ~5). */
export function flaggedEvents(branch: Branch): FlaggedEvent[] {
  const flags: FlaggedEvent[] = [];
  const seen = new Set<string>();
  const add = (f: FlaggedEvent) => {
    const key = `${f.kind}:${f.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      flags.push(f);
    }
  };

  branch.timeline.forEach((e, index) => {
    if (e.kind === "missed") add({ index, kind: "missed", label: e.label });
    else if (e.kind === "action" && e.label === "sleep_aid") add({ index, kind: "unsafe", label: "sleep_aid" });
    else if (e.kind === "event" && e.label === "si_denied_low_trust") add({ index, kind: "communication", label: e.label });
    else if (e.kind === "turn" && NEGATIVE_TURNS.has(e.label)) add({ index, kind: "communication", label: e.label });
  });

  // Up to two strengths, so feedback is never only negative.
  let strengths = 0;
  branch.timeline.forEach((e, index) => {
    if (strengths < 2 && e.kind === "turn" && STRENGTH_TURNS.has(e.label) && (e.trustDelta ?? 0) >= 0) {
      add({ index, kind: "strength", label: e.label });
      strengths = flags.filter((f) => f.kind === "strength").length;
    }
  });

  const order: Record<FlagKind, number> = { unsafe: 0, missed: 1, communication: 2, strength: 3 };
  return flags.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 5);
}
