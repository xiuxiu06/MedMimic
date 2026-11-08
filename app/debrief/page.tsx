"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DebriefResponse } from "@/app/api/debrief/route";
import { AppHeader } from "@/components/AppHeader";
import { DebriefView } from "@/components/debrief/DebriefView";
import { SafetyFooter } from "@/components/SafetyFooter";
import { formatTime } from "@/lib/labels";
import { mockDebrief1, mockOutcome1, mockRun1, mockRun2 } from "@/lib/mock/debrief";
import { firstName, scenarioForCase } from "@/lib/activeScenario";
import { isMockMode, loadRuns, runLabel } from "@/lib/runs";
import { isJordanCaseId } from "@/lib/scenarios";
import type { Branch } from "@/lib/types";

const CACHE_PREFIX = "medmimic:debrief:";

/**
 * Cache key = run id + a hash of the run's content. Run ids are reused
 * ("Reset Demo" starts again at run-1), so the id alone would serve a stale debrief.
 */
function cacheKey(branch: Branch): string {
  const content = JSON.stringify([branch.timeline, branch.finalState]);
  let h = 5381;
  for (let i = 0; i < content.length; i++) h = ((h << 5) + h + content.charCodeAt(i)) | 0;
  return `${CACHE_PREFIX}${branch.id}:${(h >>> 0).toString(36)}`;
}

/** One-line patient description for the debrief prompt; undefined = server default (Jordan). */
function patientSummary(branch: Branch): string | undefined {
  if (isJordanCaseId(branch.caseId)) return undefined;
  const s = scenarioForCase(branch.caseId);
  const reason = s.briefing?.intake?.[0]?.value ?? s.title;
  return `${firstName(s)}, ${s.patient.age}, ${reason}; hidden depression and suicidal thoughts`;
}

async function fetchDebrief(branch: Branch): Promise<DebriefResponse> {
  const key = cacheKey(branch);
  try {
    const cached = window.sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached) as DebriefResponse;
  } catch {
    // ignore
  }
  const res = await fetch("/api/debrief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch, patient: patientSummary(branch) }),
  });
  if (!res.ok) throw new Error(`Debrief failed (${res.status})`);
  const data = (await res.json()) as DebriefResponse;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore
  }
  return data;
}

type Status = "loading" | "empty" | "ready" | "error";

export default function DebriefPage() {
  const [runs, setRuns] = useState<Branch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<DebriefResponse | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  // Load saved runs (or mock data with ?mock=1).
  useEffect(() => {
    const load = async () => {
      if (isMockMode()) {
        setRuns([mockRun1, mockRun2]);
        setSelectedId(mockRun1.id);
        setResult({
          debrief: mockDebrief1,
          outcome: mockOutcome1,
          meta: { model: null, usedRetrievalFallback: false, usedFeedbackFallback: false },
        });
        setStatus("ready");
        return;
      }
      const { runs: saved, currentId } = loadRuns();
      setRuns(saved);
      setSelectedId(currentId);
      if (saved.length === 0) setStatus("empty");
    };
    void load();
  }, []);

  // Fetch the debrief for the selected run.
  useEffect(() => {
    if (!selectedId || isMockMode()) return;
    const branch = runs.find((r) => r.id === selectedId);
    if (!branch) return;
    let cancelled = false;
    const run = async () => {
      setStatus("loading");
      try {
        const data = await fetchDebrief(branch);
        if (!cancelled) {
          setResult(data);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedId, runs]);

  const branch = runs.find((r) => r.id === selectedId);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        active="debrief"
        right={
          branch ? (
            <span className="text-sm text-muted">
              {runLabel(runs, branch.id)} · {formatTime(branch.finalState.elapsedSec)}
            </span>
          ) : undefined
        }
      />
      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        {runs.length > 1 && (
          <div role="tablist" aria-label="Runs" className="flex flex-wrap gap-2">
            {runs.map((r) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={r.id === selectedId}
                onClick={() => setSelectedId(r.id)}
                className={
                  r.id === selectedId
                    ? "min-h-11 rounded-full bg-chip px-4 text-sm font-semibold text-fg"
                    : "min-h-11 rounded-full border border-line px-4 text-sm text-muted hover:text-fg"
                }
              >
                {runLabel(runs, r.id)}
              </button>
            ))}
          </div>
        )}

        {status === "empty" && (
          <section className="flex flex-col items-center gap-4 rounded-[20px] border border-line bg-panel px-6 py-16 text-center">
            <h1 className="font-display text-2xl font-bold">No completed run yet</h1>
            <p className="max-w-md text-muted">Finish an encounter to see your debrief here.</p>
            <Link href="/encounter" className="inline-flex min-h-11 items-center rounded-xl bg-ok px-6 font-bold text-[#062012]">
              Start the encounter
            </Link>
          </section>
        )}

        {status === "loading" && (
          <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading debrief">
            <div className="h-32 animate-pulse rounded-[20px] bg-panel" />
            <div className="h-48 animate-pulse rounded-[20px] bg-panel" />
            <p className="text-center text-sm text-muted">Retrieving guidelines and writing cited feedback…</p>
          </div>
        )}

        {status === "error" && (
          <section className="rounded-[20px] border border-bad-line bg-bad-bg px-6 py-6 text-bad-fg">
            Couldn&apos;t generate the debrief. Check your connection and reload the page.
          </section>
        )}

        {status === "ready" && branch && result && (
          <>
            <DebriefView
              branch={branch}
              debrief={result.debrief}
              outcome={result.outcome}
              canCompare={runs.length >= 2}
            />
            {(result.meta.usedFeedbackFallback || result.meta.usedRetrievalFallback) && (
              <p className="text-center text-xs text-faint">
                Gemini was busy, so some feedback uses templates. Citations still come from the guideline library.
              </p>
            )}
          </>
        )}
      </main>
      <SafetyFooter />
    </div>
  );
}
