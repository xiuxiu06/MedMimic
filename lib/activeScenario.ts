// Client-side helpers for "which patient is the learner working with right now".
// Generated patients live in this browser's localStorage (and, once an instructor
// publishes them, in Supabase `scenarios`), so callers send the full ScenarioV2 to the
// API routes (turn / rewind / live-token / sessions).
import {
  loadActiveCaseId,
  loadGeneratedScenarios,
  resetAllEncounterStorage,
  saveActiveCaseId,
  saveGeneratedScenario,
} from "@/app/encounter/storage";
import { JORDAN_SCENARIO } from "./engine";
import {
  getDisclosureLabelMap,
  getScenario,
  isJordanCaseId,
  isPlayableScenario,
  type ScenarioV2,
} from "./scenarios";

export function loadActiveScenario(): ScenarioV2 {
  return getScenario(loadActiveCaseId(), loadGeneratedScenarios());
}

/** Look up the patient a saved run belongs to (runs from before multi-patient = Jordan). */
export function scenarioForCase(caseId: string | null | undefined): ScenarioV2 {
  return getScenario(caseId, loadGeneratedScenarios());
}

/**
 * Make `scenario` the active patient. Switching to a different patient clears the
 * previous patient's runs/checkpoints so Debrief/Compare never mix two patients.
 * Returns true when the active patient changed.
 */
export function switchActiveScenario(scenario: ScenarioV2): boolean {
  const previous = loadActiveScenario();
  if (!isJordanCaseId(scenario.id)) saveGeneratedScenario(scenario);
  saveActiveCaseId(scenario.id);
  const changed = previous.id !== scenario.id;
  if (changed) resetAllEncounterStorage();
  return changed;
}

export function firstName(scenario: ScenarioV2): string {
  return scenario.patient.name.split(/\s+/)[0] || scenario.patient.name;
}

export function disclosureLabels(scenario: ScenarioV2): Record<string, string> {
  return getDisclosureLabelMap(scenario);
}

/**
 * Id used for Supabase `scenarios.id` (FK of encounter_sessions/branches).
 * Jordan keeps the seeded DB id; published cases keep their DB id; other AI patients get
 * a content hash so two learners who both generate a "Maria Santos" never collide.
 */
export function cloudScenarioId(scenario: ScenarioV2): string {
  if (isJordanCaseId(scenario.id)) return JORDAN_SCENARIO.id;
  if (scenario.cloudId) return scenario.cloudId;
  const json = JSON.stringify(scenario);
  let h = 0;
  for (let i = 0; i < json.length; i++) h = (h * 31 + json.charCodeAt(i)) | 0;
  const base = scenario.id.replace(/^ai-/, "");
  return `ai-${base}-${(h >>> 0).toString(36)}`.slice(0, 80);
}

/** Cases instructors published to the class (Supabase), playable in the encounter. */
export async function fetchPublishedScenarios(): Promise<ScenarioV2[]> {
  try {
    const res = await fetch("/api/scenarios", { cache: "no-store" });
    const data = (await res.json()) as {
      scenarios?: { id: string; is_published?: boolean; scenario_json?: unknown }[];
    };
    return (data.scenarios ?? [])
      .filter((row) => row.is_published && isPlayableScenario(row.scenario_json))
      .map((row) => ({
        ...(row.scenario_json as ScenarioV2),
        cloudId: row.id,
      }))
      .filter((s) => !isJordanCaseId(s.id));
  } catch {
    return [];
  }
}

/** Local (this browser) + published (class) cases, newest local first, no duplicates. */
export async function loadSelectableScenarios(): Promise<ScenarioV2[]> {
  const local = loadGeneratedScenarios();
  const published = await fetchPublishedScenarios();
  const seen = new Set(local.map((s) => s.id));
  return [...local, ...published.filter((s) => !seen.has(s.id))];
}
