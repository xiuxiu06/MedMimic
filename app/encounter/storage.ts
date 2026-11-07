import type { ScenarioV2 } from "../../lib/scenarios";
import type {
  Branch,
  Checkpoint,
  EngineState,
  Message,
  TimelineEvent,
} from "../../lib/types";

export const STORAGE_KEYS = {
  ACTIVE_SESSION: "medmimic:activeSession",
  CHECKPOINTS: "medmimic:checkpoints",
  BRANCHES: "medmimic:branches",
  CURRENT_BRANCH: "medmimic:currentBranch",
  CLOUD_SESSION_ID: "medmimic:cloudSessionId",
  GENERATED_SCENARIOS: "medmimic:generatedScenarios",
  ACTIVE_CASE_ID: "medmimic:activeCaseId",
} as const;

export interface StoredActiveSession {
  caseId?: string;
  branchId: string;
  parentCheckpoint?: string;
  state: EngineState;
  messages: Message[];
  timeline: TimelineEvent[];
  updatedAt: number;
}

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

export function saveActiveSession(session: StoredActiveSession): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEYS.ACTIVE_SESSION,
      JSON.stringify(session),
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadActiveSession(): StoredActiveSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
    if (!raw) return null;
    return JSON.parse(raw) as StoredActiveSession;
  } catch {
    return null;
  }
}

export function clearActiveSession(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
  } catch {
    // Ignore
  }
}

export function saveCheckpointItem(checkpoint: Checkpoint): Checkpoint[] {
  if (!isBrowser()) return [checkpoint];
  try {
    const existing = loadCheckpoints();
    const filtered = existing.filter((cp) => cp.id !== checkpoint.id);
    const next = [...filtered, checkpoint];
    window.localStorage.setItem(STORAGE_KEYS.CHECKPOINTS, JSON.stringify(next));
    return next;
  } catch {
    return [checkpoint];
  }
}

export function loadCheckpoints(): Checkpoint[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.CHECKPOINTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Checkpoint[]) : [];
  } catch {
    return [];
  }
}

export function saveCompletedBranch(branch: Branch): Branch[] {
  if (!isBrowser()) return [branch];
  try {
    const existing = loadCompletedBranches();
    const filtered = existing.filter((b) => b.id !== branch.id);
    const next = [...filtered, branch];
    window.localStorage.setItem(STORAGE_KEYS.BRANCHES, JSON.stringify(next));
    window.localStorage.setItem(
      STORAGE_KEYS.CURRENT_BRANCH,
      JSON.stringify(branch),
    );
    return next;
  } catch {
    return [branch];
  }
}

export function loadCompletedBranches(): Branch[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.BRANCHES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Branch[]) : [];
  } catch {
    return [];
  }
}

export function loadGeneratedScenarios(): ScenarioV2[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.GENERATED_SCENARIOS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScenarioV2[]) : [];
  } catch {
    return [];
  }
}

export function saveGeneratedScenario(scenario: ScenarioV2): ScenarioV2[] {
  if (!isBrowser()) return [scenario];
  try {
    const existing = loadGeneratedScenarios();
    const filtered = existing.filter((s) => s.id !== scenario.id);
    const next = [scenario, ...filtered].slice(0, 15);
    window.localStorage.setItem(
      STORAGE_KEYS.GENERATED_SCENARIOS,
      JSON.stringify(next),
    );
    return next;
  } catch {
    return [scenario];
  }
}

export function saveActiveCaseId(caseId: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.ACTIVE_CASE_ID, caseId);
  } catch {
    // Ignore
  }
}

export function loadActiveCaseId(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(STORAGE_KEYS.ACTIVE_CASE_ID);
  } catch {
    return null;
  }
}

export function resetAllEncounterStorage(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
    window.localStorage.removeItem(STORAGE_KEYS.CHECKPOINTS);
    window.localStorage.removeItem(STORAGE_KEYS.BRANCHES);
    window.localStorage.removeItem(STORAGE_KEYS.CURRENT_BRANCH);
    window.localStorage.removeItem(STORAGE_KEYS.CLOUD_SESSION_ID);
  } catch {
    // Ignore
  }
}
