"use client";

// Runs, checkpoints and the active session live in this browser's localStorage so guests
// can use the whole app. That data must not outlive a signed-in user on a shared computer.
import { resetAllEncounterStorage } from "@/app/encounter/storage";

const OWNER_KEY = "medmimic:localOwner";
const DEBRIEF_CACHE_PREFIX = "medmimic:debrief:";

/** Remove this browser's encounter runs/checkpoints and cached debriefs. */
export function clearLearnerLocalData(): void {
  resetAllEncounterStorage();
  try {
    window.localStorage.removeItem(OWNER_KEY);
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(DEBRIEF_CACHE_PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing to clear
  }
}

/**
 * Record which signed-in user the local runs belong to. Returns true when the data
 * belonged to a different user and was cleared (caller should reload the page).
 * Guest → sign-in keeps the guest's runs (they sync to the new account from here on).
 */
export function claimLocalDataFor(userId: string): boolean {
  try {
    const owner = window.localStorage.getItem(OWNER_KEY);
    if (owner && owner !== userId) {
      clearLearnerLocalData();
      window.localStorage.setItem(OWNER_KEY, userId);
      return true;
    }
    if (owner !== userId) window.localStorage.setItem(OWNER_KEY, userId);
  } catch {
    // ignore
  }
  return false;
}
