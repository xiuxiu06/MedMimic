// Human-readable text for machine labels in TimelineEvent / RubricScore.
import type { RubricScore } from "./types";

const EVENT_TEXT: Record<string, string> = {
  // turn labels
  asked_mood: "Asked about mood",
  asked_onset: "Asked about onset",
  asked_hope: "Asked about hope / future",
  asked_SI_directly: "Asked directly about suicide",
  asked_plan: "Asked about a plan",
  asked_support: "Asked about support",
  reflection: "Reflected feelings",
  empathy: "Showed empathy",
  premature_reassurance: "Premature reassurance",
  dismissive: "Dismissive response",
  closed_rapid: "Rapid closed questions",
  // engine events
  intro: "Introduced self",
  shutdown: "Patient shut down",
  wants_to_leave: "Event: wants to leave",
  opens_up: "Patient opened up",
  // actions
  phq9: "PHQ-9 screen",
  cssrs: "C-SSRS screen",
  safety_plan: "Built safety plan",
  sleep_aid: "Recommended sleep aid",
  consult: "Consulted psychiatry",
  // missed
  "missed:asked_SI_directly": "Never asked about suicide",
  "missed:asked_plan": "Never asked about a plan",
  "missed:asked_support": "Never asked about support",
};

export function eventText(label: string): string {
  return EVENT_TEXT[label] ?? label.replace(/[_:]/g, " ");
}

export const CRITERION_TEXT: Record<RubricScore["criterion"], string> = {
  rapport: "Rapport & empathy (OARS)",
  mood_history: "Mood history",
  risk_assessment: "Suicide risk assessment",
  disposition: "Safe disposition",
};

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
