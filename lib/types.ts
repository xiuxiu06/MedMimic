// SHARED CONTRACT between Person A (engine) and Person B (debrief/RAG).
// Change this file only via a small PR to `main`, and tell your teammate.

export type TurnLabel =
  | "asked_mood"
  | "asked_onset"
  | "asked_hope"
  | "asked_SI_directly"
  | "asked_plan"
  | "asked_support"
  | "reflection"
  | "empathy"
  | "premature_reassurance"
  | "dismissive"
  | "closed_rapid"
  | "other";

export type Emotion =
  | "neutral"
  | "withdrawn"
  | "sad"
  | "tearful"
  | "relieved"
  | "irritable";

export type RiskLevel = "low" | "moderate" | "high";

export type ActionId =
  | "phq9"
  | "cssrs"
  | "safety_plan"
  | "sleep_aid"
  | "consult";

export interface EngineState {
  trust: number; // 0–100
  emotion: Emotion;
  unlocked: string[]; // disclosure ids from the scenario
  firedEvents: string[];
  studentRisk?: RiskLevel;
  actions: ActionId[];
  elapsedSec: number;
}

export interface Message {
  role: "student" | "patient";
  text: string;
  t: number; // elapsed seconds
}

export interface TimelineEvent {
  t: number;
  kind: "turn" | "event" | "action" | "checkpoint" | "missed";
  label: string; // e.g. TurnLabel, event id, action id, or "missed:asked_SI_directly"
  quote?: string;
  trustDelta?: number;
}

export interface Checkpoint {
  id: string;
  engineState: EngineState;
  messages: Message[];
  timelineIndex: number;
}

export interface Branch {
  id: string;
  parentCheckpoint?: string;
  timeline: TimelineEvent[];
  messages: Message[];
  finalState: EngineState;
}

// ---- Scenario (data/scenario.*.json) ----

export interface Disclosure {
  id: string;
  fact: string; // what the patient may say once unlocked
  requires: {
    labels?: TurnLabel[]; // any of these labels in the student's turn
    minTrust?: number;
    unlocked?: string[]; // other disclosures that must be unlocked first
  };
}

export interface Scenario {
  id: string;
  patient: { name: string; age: number; opening: string; backstory: string };
  startTrust: number;
  trustDeltas: Partial<Record<TurnLabel, number>>;
  disclosures: Disclosure[];
}

// ---- Debrief (Person B) ----

export interface Citation {
  sourceId: string; // chunk id in data/guidelines.json
  source: string; // e.g. "C-SSRS Screener"
  section?: string;
  url?: string;
}

export interface FeedbackItem {
  kind: "strength" | "missed" | "unsafe" | "communication";
  timelineRef?: number; // index into Branch.timeline
  quote?: string;
  feedback: string;
  citations: Citation[];
}

export interface RubricScore {
  criterion: "rapport" | "mood_history" | "risk_assessment" | "disposition";
  score: number; // 0–10
}

export interface Debrief {
  outcome: string;
  scores: RubricScore[];
  feedback: FeedbackItem[];
}
