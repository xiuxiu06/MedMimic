"use client";

import type { EncounterSessionWithBranches } from "./types";
import { rowToClientBranch } from "./types";
import {
  resetAllEncounterStorage,
  saveActiveCaseId,
  saveGeneratedScenario,
} from "../../app/encounter/storage";
import {
  DEFAULT_CASE_ID,
  isJordanCaseId,
  isPlayableScenario,
  type ScenarioV2,
} from "../scenarios";
import type { Branch, Checkpoint } from "../types";

export const CLOUD_SESSION_STORAGE_KEY = "medmimic:cloudSessionId";
export const ACTIVE_SCENARIO_STORAGE_KEY = "medmimic:activeScenarioId";

function getStoredCloudSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CLOUD_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredCloudSessionId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLOUD_SESSION_STORAGE_KEY, id);
  } catch {
    // Ignore quota errors
  }
}

export function clearStoredCloudSessionId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CLOUD_SESSION_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Non-blocking background sync of a saved decision checkpoint to Supabase.
 */
export async function syncCheckpointToCloud(
  checkpoint: Checkpoint,
  scenarioId: string = "jordan-lee-mvp",
  /** Full payload for AI-generated patients so the server can register the case row. */
  scenario?: ScenarioV2,
): Promise<void> {
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: getStoredCloudSessionId(),
        scenarioId,
        scenario,
        checkpoint,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; sessionId?: string };
    if (data.ok && data.sessionId) {
      setStoredCloudSessionId(data.sessionId);
    }
  } catch {
    // Offline / guest fallback — local encounter state remains intact
  }
}

/**
 * Non-blocking background sync of a finalized encounter run (`Branch`) to Supabase.
 */
export async function syncCompletedBranchToCloud(
  completedBranch: Branch,
  modeUsed: "text" | "voice" | "mixed" = "mixed",
  scenarioId: string = "jordan-lee-mvp",
  scenario?: ScenarioV2,
): Promise<void> {
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: getStoredCloudSessionId(),
        scenarioId,
        scenario,
        modeUsed,
        completedBranch,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; sessionId?: string };
    if (data.ok && data.sessionId) {
      setStoredCloudSessionId(data.sessionId);
    }
  } catch {
    // Offline / guest fallback
  }
}

/**
 * Hydrates browser storage from a saved Supabase `EncounterSessionWithBranches`
 * so clicking "View Debrief" or "Compare Runs" from `/login` opens seamlessly.
 */
export function hydrateLocalStorageFromCloudSession(
  session: EncounterSessionWithBranches,
): Branch[] {
  if (typeof window === "undefined") return [];

  const sortedRows = [...(session.encounter_branches ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  // Which patient these runs were with: AI cases carry their ScenarioV2 in scenario_json.
  const rawScenario = session.scenarios?.scenario_json;
  const scenario: ScenarioV2 | null = isPlayableScenario(rawScenario)
    ? { ...rawScenario, cloudId: session.scenario_id }
    : null;
  const caseId = scenario && !isJordanCaseId(scenario.id) ? scenario.id : DEFAULT_CASE_ID;

  const branches = sortedRows.map((row) => ({ ...rowToClientBranch(row), caseId }));
  if (branches.length === 0) return [];

  try {
    // Start clean so another patient's active session / checkpoints never leak in.
    resetAllEncounterStorage();
    if (scenario && caseId !== DEFAULT_CASE_ID) saveGeneratedScenario(scenario);
    saveActiveCaseId(caseId);
    window.localStorage.setItem("medmimic:branches", JSON.stringify(branches));
    window.localStorage.setItem(
      "medmimic:currentBranch",
      JSON.stringify(branches[branches.length - 1]),
    );
    setStoredCloudSessionId(session.id);
  } catch {
    // Ignore storage errors
  }

  return branches;
}
