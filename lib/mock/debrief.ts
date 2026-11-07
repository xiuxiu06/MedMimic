// MOCK DATA for building the Debrief/Compare screens before Person A's engine is merged.
// Matches lib/types.ts. Replace with real engine output + /api/debrief after the H8 merge.
import type { Branch, Debrief } from "../types";

export const mockRun1: Branch = {
  id: "run-1",
  timeline: [
    { t: 0, kind: "event", label: "intro", quote: "Hi Jordan, I'm one of the student clinicians." },
    { t: 70, kind: "turn", label: "asked_onset", quote: "How long has that been going on?", trustDelta: 5 },
    { t: 125, kind: "checkpoint", label: "premature_reassurance", quote: "Lots of people go through rough patches. You'll be fine once you're sleeping again.", trustDelta: -25 },
    { t: 125, kind: "missed", label: "missed:asked_SI_directly" },
    { t: 400, kind: "event", label: "wants_to_leave" },
    { t: 485, kind: "action", label: "sleep_aid" },
  ],
  messages: [
    { role: "student", text: "Hi Jordan, I'm one of the student clinicians. What brings you in today?", t: 0 },
    { role: "patient", text: "I can't sleep. Like, at all. I just need something to knock me out.", t: 8 },
    { role: "student", text: "How long has that been going on?", t: 70 },
    { role: "patient", text: "Couple months. Since I lost my job, I guess. Everything's just... heavy.", t: 78 },
    { role: "student", text: "Lots of people go through rough patches. You'll be fine once you're sleeping again.", t: 125 },
    { role: "patient", text: "...Yeah. Sure. Can I just get the prescription?", t: 133 },
  ],
  finalState: {
    trust: 30,
    emotion: "withdrawn",
    unlocked: ["insomnia", "job_loss", "low_mood"],
    firedEvents: ["wants_to_leave"],
    actions: ["sleep_aid"],
    elapsedSec: 485,
  },
};

export const mockDebrief1: Debrief = {
  outcome: "Suicide risk not identified",
  scores: [
    { criterion: "rapport", score: 3 },
    { criterion: "mood_history", score: 5 },
    { criterion: "risk_assessment", score: 0 },
    { criterion: "disposition", score: 2 },
  ],
  feedback: [
    {
      kind: "communication",
      timelineRef: 2,
      quote: "Lots of people go through rough patches. You'll be fine once you're sleeping again.",
      feedback:
        "Reassurance before understanding read as dismissal. A reflection (\"It sounds like things have felt heavy since the job loss\") invites more disclosure.",
      citations: [{ sourceId: "oars-02", source: "SAMHSA TIP 35", section: "Reflective listening" }],
    },
    {
      kind: "missed",
      timelineRef: 3,
      feedback:
        "Low mood, insomnia, and a major loss warrant a direct suicide screen. Asking directly does not increase risk.",
      citations: [
        { sourceId: "cssrs-01", source: "C-SSRS Screener", section: "Q1–5" },
        { sourceId: "safet-03", source: "SAMHSA SAFE-T", section: "Step 3: Suicide inquiry" },
      ],
    },
    {
      kind: "unsafe",
      timelineRef: 5,
      feedback:
        "Recommending a 30-day sleep aid without a risk assessment may increase access to means. Counseling on lethal means is part of the plan.",
      citations: [{ sourceId: "safet-04", source: "SAMHSA SAFE-T", section: "Steps 4–5: Means counseling" }],
    },
    {
      kind: "strength",
      timelineRef: 0,
      feedback:
        "Warm introduction and an open first question. You uncovered the job loss within the first minute.",
      citations: [],
    },
  ],
};

// UI-only outcome details (not in types.ts yet — propose adding at the H8 merge).
export const mockOutcome1 = {
  tone: "bad" as const,
  detail: "Jordan was discharged with a sleep aid recommendation. No risk screen was done.",
  durationSec: 485,
};
