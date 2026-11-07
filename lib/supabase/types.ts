import type {
  Branch,
  Debrief,
  EngineState,
  Message,
  RiskLevel,
  RubricScore,
  Scenario,
  TimelineEvent,
} from "../types";

export type TrainingRole =
  | "medical_student"
  | "nursing_student"
  | "pa_student"
  | "psych_trainee"
  | "instructor"
  | "other";

export interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  training_role: TrainingRole;
  institution: string | null;
  training_year: number | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScenarioRecord {
  id: string;
  slug: string;
  title: string;
  specialty: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  patient_name: string;
  patient_age: number;
  patient_gender: string | null;
  voice_name: string;
  chief_complaint: string;
  scenario_json: Scenario;
  intake_json: Array<{ label: string; value: string }>;
  avatar_config: Record<string, unknown>;
  is_ai_generated: boolean;
  generation_prompt: string | null;
  generation_model: string | null;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
}

export interface EncounterBranchSummary {
  id: string;
  session_id: string;
  scenario_id: string;
  client_branch_id: string;
  parent_checkpoint_id: string | null;
  outcome_code: "risk_identified" | "risk_underestimated" | "risk_missed";
  outcome_badge: "pass" | "warn" | "fail";
  final_trust: number;
  final_emotion: string;
  student_risk: RiskLevel | null;
  unlocked_disclosures: string[];
  actions_taken: string[];
  duration_sec: number;
  messages: Message[];
  timeline: TimelineEvent[];
  final_state: EngineState;
  rubric_scores: RubricScore[];
  debrief_json: Debrief | null;
  created_at: string;
}

export interface EncounterSessionWithBranches {
  id: string;
  scenario_id: string;
  status: "in_progress" | "completed";
  mode_used: "text" | "voice" | "mixed";
  best_outcome_code:
    | "risk_identified"
    | "risk_underestimated"
    | "risk_missed"
    | null;
  run_count: number;
  rewind_count: number;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
  scenarios?: {
    title: string;
    patient_name: string;
    patient_age: number;
    specialty: string;
    difficulty: string;
  } | null;
  encounter_branches: EncounterBranchSummary[];
}

export function rowToClientBranch(row: EncounterBranchSummary): Branch {
  return {
    id: row.client_branch_id,
    parentCheckpoint: row.parent_checkpoint_id ?? undefined,
    messages: row.messages ?? [],
    timeline: row.timeline ?? [],
    finalState: row.final_state,
  };
}
