"use client";

import type { EncounterSessionWithBranches } from "./types";
import { rowToClientBranch } from "./types";
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
): Promise<void> {
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: getStoredCloudSessionId(),
        scenarioId,
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
): Promise<void> {
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: getStoredCloudSessionId(),
        scenarioId,
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
  const branches = sortedRows.map(rowToClientBranch);
  if (branches.length === 0) return [];

  try {
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
