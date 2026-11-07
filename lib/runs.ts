// Client-side helpers for reading completed runs saved by Person A's encounter
// (app/encounter/storage.ts — import only, never edit).
import { loadCompletedBranches, STORAGE_KEYS } from "@/app/encounter/storage";
import type { Branch } from "./types";

export function loadRuns(): { runs: Branch[]; currentId: string | null } {
  const runs = loadCompletedBranches();
  let currentId: string | null = null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.CURRENT_BRANCH);
    currentId = raw ? ((JSON.parse(raw) as Branch).id ?? null) : null;
  } catch {
    currentId = null;
  }
  return { runs, currentId: currentId ?? runs.at(-1)?.id ?? null };
}

export function runLabel(runs: Branch[], id: string): string {
  const i = runs.findIndex((r) => r.id === id);
  const run = runs[i];
  return `Run ${i + 1}${run?.parentCheckpoint ? " · rewound" : ""}`;
}

export function isMockMode(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("mock");
}
