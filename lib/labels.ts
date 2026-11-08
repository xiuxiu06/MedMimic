// Human-readable text for machine labels in TimelineEvent / RubricScore / citations.
// Event ids must match Person A's engine: ENGINE_EVENTS + DEMO_CHECKPOINT_ID in lib/engine.ts.
import type { RubricScore } from "./types";

const EVENT_TEXT: Record<string, string> = {
  // turn labels (TurnLabel)
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
  other: "Other",
  // engine events (lib/engine.ts ENGINE_EVENTS). Both id sets are accepted because
  // the engine has used each at different times.
  shutdown: "Patient shut down",
  wants_to_leave: "Event: wants to leave",
  opens_up: "Patient opened up",
  patient_shuts_down: "Patient shut down",
  patient_asks_to_leave: "Event: wants to leave",
  patient_opens_up: "Patient opened up",
  si_denied_low_trust: "Denied suicidal thoughts (low trust)",
  // checkpoint (lib/engine.ts DEMO_CHECKPOINT_ID)
  "cp-heavy": "Checkpoint: “heavy”",
  // actions (ActionId)
  phq9: "PHQ-9 screen",
  cssrs: "C-SSRS screen",
  safety_plan: "Built safety plan",
  sleep_aid: "Recommended sleep aid",
  consult: "Consulted psychiatry",
  // missed (lib/engine.ts appendMissedEvents)
  "missed:asked_SI_directly": "Never asked about suicide",
  "missed:asked_plan": "Never asked about a plan",
  "missed:asked_support": "Never asked about support",
};

/** Positive engine events (shown green in the timeline). */
export const POSITIVE_EVENTS = new Set(["opens_up", "patient_opens_up"]);

export function eventText(label: string): string {
  return EVENT_TEXT[label] ?? label.replace(/[_:]/g, " ");
}

// Disclosure ids from data/scenario.jordan.json
const DISCLOSURE_TEXT: Record<string, string> = {
  insomnia: "Insomnia, 2 months",
  job_loss: "Job loss",
  low_mood: "Low mood (“heavy”)",
  hopelessness: "Hopelessness",
  suicidal_thoughts: "Suicidal thoughts",
  plan_and_means: "Plan / access to means",
  protective_factors: "Protective factors",
};

/**
 * Generated patients reuse the same disclosure ids with different meanings
 * (e.g. job_loss = "Divorce"), so pass that patient's label map when it isn't Jordan.
 */
export function disclosureText(id: string, labels?: Record<string, string>): string {
  return labels?.[id] ?? DISCLOSURE_TEXT[id] ?? id.replace(/_/g, " ");
}

export const TOTAL_DISCLOSURES = Object.keys(DISCLOSURE_TEXT).length;

export const CRITERION_TEXT: Record<RubricScore["criterion"], string> = {
  rapport: "Rapport & empathy (OARS)",
  mood_history: "Mood history",
  risk_assessment: "Suicide risk assessment",
  disposition: "Safe disposition",
};

// Short source names for citation tags (keys = data/raw file ids).
export const SOURCE_SHORT: Record<string, string> = {
  cssrs: "C-SSRS",
  safet: "SAMHSA SAFE-T",
  phq9: "PHQ-9",
  oars: "SAMHSA TIP 35 (MI)",
};

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
