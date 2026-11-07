// MOCK DATA for design previews only (/debrief?mock=1, /compare?mock=1).
// Shaped like real output of Person A's engine (lib/engine.ts + lib/checkpoints.ts finalizeBranch).
import type { Branch, Debrief } from "../types";

export const mockRun1: Branch = {
  id: "branch-mock-1",
  timeline: [
    { t: 0, kind: "turn", label: "other", quote: "Hi Jordan, I'm one of the student clinicians. What brings you in today?" },
    { t: 70, kind: "turn", label: "asked_onset", quote: "How long has that been going on?", trustDelta: 5 },
    { t: 78, kind: "checkpoint", label: "cp-heavy" },
    { t: 125, kind: "turn", label: "premature_reassurance", quote: "Lots of people go through rough patches. You'll be fine once you're sleeping again.", trustDelta: -25 },
    { t: 400, kind: "event", label: "wants_to_leave" },
    { t: 485, kind: "action", label: "sleep_aid" },
    { t: 485, kind: "missed", label: "missed:asked_SI_directly" },
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

export const mockRun2: Branch = {
  id: "branch-mock-2",
  parentCheckpoint: "cp-heavy",
  timeline: [
    ...mockRun1.timeline.slice(0, 3),
    { t: 120, kind: "turn", label: "reflection", quote: "“Heavy” sounds really hard. Can you tell me more about that?", trustDelta: 10 },
    { t: 150, kind: "turn", label: "asked_hope", quote: "How do you see things going from here?", trustDelta: 3 },
    { t: 190, kind: "turn", label: "asked_SI_directly", quote: "Sometimes when people feel this way, they think about ending their life. Have you?", trustDelta: 5 },
    { t: 196, kind: "event", label: "opens_up" },
    { t: 240, kind: "turn", label: "asked_plan", quote: "Have you thought about how you might do it?", trustDelta: 2 },
    { t: 300, kind: "turn", label: "asked_support", quote: "Who do you have in your corner right now?", trustDelta: 4 },
    { t: 360, kind: "action", label: "cssrs" },
    { t: 420, kind: "action", label: "safety_plan" },
    { t: 450, kind: "action", label: "consult" },
  ],
  messages: [
    ...mockRun1.messages.slice(0, 4),
    { role: "student", text: "“Heavy” sounds really hard. Can you tell me more about that?", t: 120 },
    { role: "patient", text: "I haven't told anyone that. Some nights I think everyone would be better off.", t: 196 },
  ],
  finalState: {
    trust: 75,
    emotion: "relieved",
    unlocked: ["insomnia", "job_loss", "low_mood", "hopelessness", "suicidal_thoughts", "plan_and_means", "protective_factors"],
    firedEvents: ["opens_up"],
    studentRisk: "high",
    actions: ["cssrs", "safety_plan", "consult"],
    elapsedSec: 460,
  },
};

export const mockDebrief1: Debrief = {
  outcome: "Risk missed",
  scores: [
    { criterion: "rapport", score: 3 },
    { criterion: "mood_history", score: 5 },
    { criterion: "risk_assessment", score: 0 },
    { criterion: "disposition", score: 1 },
  ],
  feedback: [
    {
      kind: "communication",
      timelineRef: 3,
      quote: "Lots of people go through rough patches. You'll be fine once you're sleeping again.",
      feedback:
        "Reassurance before understanding read as dismissal. A reflection (\"It sounds like things have felt heavy since the job loss\") invites more disclosure.",
      citations: [{ sourceId: "oars-02", source: "SAMHSA TIP 35 (MI)", section: "Reflective listening" }],
    },
    {
      kind: "missed",
      timelineRef: 6,
      feedback:
        "Low mood, insomnia, and a major loss warrant a direct suicide screen. Asking directly does not increase risk.",
      citations: [
        { sourceId: "cssrs-01", source: "C-SSRS", section: "Q1–5" },
        { sourceId: "safet-03", source: "SAMHSA SAFE-T", section: "Step 3: Suicide inquiry" },
      ],
    },
    {
      kind: "unsafe",
      timelineRef: 5,
      feedback:
        "Recommending a sleep aid without a risk assessment may increase access to means. Counseling on lethal means is part of the plan.",
      citations: [{ sourceId: "safet-04", source: "SAMHSA SAFE-T", section: "Steps 4–5: Means counseling" }],
    },
    {
      kind: "strength",
      timelineRef: 1,
      feedback: "Open first question. You uncovered the job loss within the first minute.",
      citations: [],
    },
  ],
};

export const mockOutcome1 = {
  tone: "bad" as const,
  detail: "Risk missed: sleep aid recommended and patient discharged with access to lethal means",
};
