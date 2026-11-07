import jordanData from "../data/scenarios/jordan.json";
import type { ActionId, Disclosure, Emotion, Scenario } from "./types";

export type PatientTemperament =
  | "guarded_tired"
  | "hostile_volatile"
  | "agitated_panicked"
  | "stoic_minimizer"
  | "suspicious_defensive"
  | "tearful_vulnerable";

export type AvatarHairStyle = "short" | "long" | "bun" | "buzz" | "curly";

export interface PatientAvatarLook {
  skin: string;
  hair: string;
  hairStyle: AvatarHairStyle;
  top: string;
  facialHair?: "none" | "stubble" | "beard";
  glasses?: boolean;
}

export interface ScenarioV2 extends Scenario {
  title: string;
  difficulty: "core" | "advanced";
  contentNote: string;
  gender?: "male" | "female" | "nonbinary";
  voiceName?: string;
  temperament?: PatientTemperament;
  /** 1 = gentle/calm, 5 = combative/angry right off the bat */
  aggressionLevel?: 1 | 2 | 3 | 4 | 5;
  initialEmotion?: Emotion;
  patient: Scenario["patient"] & { personality: string };
  avatar: PatientAvatarLook;
  briefing: {
    setting: string;
    intake: { label: string; value: string }[];
    goal: string;
  };
  disclosures: (Disclosure & { label: string })[];
  checkpoint: {
    id: string;
    whenUnlocked: string;
    label: string;
    quote?: string;
    keyword?: string;
  };
  outcome: {
    riskDisclosure: string;
    safeActions: ActionId[];
    unsafeActions: ActionId[];
  };
  isAiGenerated?: boolean;
}

export interface CaseSummary {
  id: string;
  title: string;
  difficulty: ScenarioV2["difficulty"];
  contentNote: string;
  temperament?: PatientTemperament;
  isAiGenerated?: boolean;
  patient: { name: string; age: number };
}

export const DEFAULT_CASE_ID = "jordan";

export const JORDAN_SCENARIO_V2: ScenarioV2 = jordanData as ScenarioV2;

const BUILTIN_SCENARIOS: ScenarioV2[] = [JORDAN_SCENARIO_V2];

export const TEMPERAMENT_LABELS: Record<
  PatientTemperament,
  { label: string; shortBadge: string; badgeColor: string }
> = {
  guarded_tired: {
    label: "Guarded & Exhausted",
    shortBadge: "Guarded",
    badgeColor: "border-slate-600/60 bg-slate-800/80 text-slate-200",
  },
  hostile_volatile: {
    label: "Angry & Confrontational Off the Bat",
    shortBadge: "Volatile · Short Fuse",
    badgeColor: "border-rose-500/60 bg-rose-950/80 text-rose-200",
  },
  agitated_panicked: {
    label: "Agitated & Panicked",
    shortBadge: "Agitated · Pressured",
    badgeColor: "border-amber-500/60 bg-amber-950/80 text-amber-200",
  },
  stoic_minimizer: {
    label: "Stoic Minimizer",
    shortBadge: "Stoic · Closed-Off",
    badgeColor: "border-sky-500/50 bg-sky-950/80 text-sky-200",
  },
  suspicious_defensive: {
    label: "Suspicious & Defensive",
    shortBadge: "Suspicious · Guarded",
    badgeColor: "border-purple-500/50 bg-purple-950/80 text-purple-200",
  },
  tearful_vulnerable: {
    label: "Overwhelmed & Fragile",
    shortBadge: "Raw · Distressed",
    badgeColor: "border-cyan-500/50 bg-cyan-950/80 text-cyan-200",
  },
};

export function isJordanCaseId(id: string | null | undefined): boolean {
  return !id || id === "jordan" || id === "jordan-lee-mvp";
}

export function getScenario(
  id?: string | null,
  customScenarios: readonly ScenarioV2[] = [],
): ScenarioV2 {
  if (!id || isJordanCaseId(id)) {
    return JORDAN_SCENARIO_V2;
  }
  return (
    customScenarios.find((s) => s.id === id) ??
    BUILTIN_SCENARIOS.find((s) => s.id === id) ??
    JORDAN_SCENARIO_V2
  );
}

export function listCases(
  customScenarios: readonly ScenarioV2[] = [],
): CaseSummary[] {
  const combined = [
    ...BUILTIN_SCENARIOS,
    ...customScenarios.filter(
      (c) => !BUILTIN_SCENARIOS.some((b) => b.id === c.id),
    ),
  ];

  return combined.map(
    ({ id, title, difficulty, contentNote, temperament, isAiGenerated, patient }) => ({
      id,
      title,
      difficulty,
      contentNote,
      temperament,
      isAiGenerated,
      patient: { name: patient.name, age: patient.age },
    }),
  );
}

export function getDisclosureLabelMap(
  scenario: ScenarioV2,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of scenario.disclosures) {
    map[d.id] = d.label || d.id;
  }
  return map;
}

/**
 * Picks a verified Gemini Live `en-US` prebuilt voice matching gender and temperament.
 */
export function selectVoiceForPatient(
  gender: "male" | "female" | "nonbinary",
  temperament: PatientTemperament,
  age: number,
): string {
  if (gender === "female") {
    if (temperament === "hostile_volatile" || temperament === "suspicious_defensive") {
      return "Despina"; // Firm, direct, guarded female voice
    }
    if (temperament === "tearful_vulnerable") {
      return "Achernar"; // Soft, fragile higher-pitch female voice
    }
    if (age < 28) {
      return "Callirrhoe"; // Natural young-adult female voice
    }
    return "Aoede"; // Conversational medium-pitch female voice
  }

  if (gender === "nonbinary") {
    return temperament === "hostile_volatile" ? "Despina" : "Achird";
  }

  // Male voices
  if (temperament === "hostile_volatile") {
    return "Algenib"; // Gravelly, hard-hitting low male voice
  }
  if (temperament === "suspicious_defensive" || temperament === "stoic_minimizer") {
    return age >= 48 ? "Charon" : "Alnilam"; // Steady low or firm direct male voice
  }
  if (age >= 52) {
    return "Charon";
  }
  return "Achird";
}
