"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { CompareView } from "@/components/compare/CompareView";
import { SafetyFooter } from "@/components/SafetyFooter";
import { mockRun1, mockRun2 } from "@/lib/mock/debrief";
import { isMockMode, loadRuns, runLabel } from "@/lib/runs";
import type { Branch } from "@/lib/types";

/** Default pair: latest original run vs latest rewound run. */
function defaultPair(runs: Branch[]): [string | null, string | null] {
  const rewound = [...runs].reverse().find((r) => r.parentCheckpoint);
  const original = [...runs].reverse().find((r) => !r.parentCheckpoint && r.id !== rewound?.id);
  if (rewound && original) return [original.id, rewound.id];
  if (runs.length >= 2) return [runs.at(-2)!.id, runs.at(-1)!.id];
  return [null, null];
}

function RunSelect({
  label,
  runs,
  value,
  onChange,
}: {
  label: string;
  runs: Branch[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const id = `select-${label.replace(/\s/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-muted">
      {label}
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 rounded-lg border border-line bg-panel px-3 text-fg"
      >
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {runLabel(runs, r.id)}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ComparePage() {
  const [runs, setRuns] = useState<Branch[] | null>(null);
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const saved = isMockMode() ? [mockRun1, mockRun2] : loadRuns().runs;
      const [a, b] = defaultPair(saved);
      setRuns(saved);
      setLeftId(a);
      setRightId(b);
    };
    void load();
  }, []);

  const left = runs?.find((r) => r.id === leftId);
  const right = runs?.find((r) => r.id === rightId);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        active="compare"
        right={
          <Link href="/briefing" className="inline-flex min-h-11 items-center rounded-xl border border-line-2 px-4 text-sm font-semibold hover:bg-chip">
            New case
          </Link>
        }
      />
      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        {runs === null && <div className="h-64 animate-pulse rounded-[20px] bg-panel" aria-busy="true" />}

        {runs !== null && runs.length < 2 && (
          <section className="flex flex-col items-center gap-4 rounded-[20px] border border-line bg-panel px-6 py-16 text-center">
            <h1 className="font-display text-2xl font-bold">Nothing to compare yet</h1>
            <p className="max-w-md text-muted">
              Finish a run, then rewind from the “heavy” checkpoint and try a different approach. Both runs will
              appear here side by side.
            </p>
            <Link href="/encounter" className="inline-flex min-h-11 items-center rounded-xl bg-ok px-6 font-bold text-[#062012]">
              Go to the encounter
            </Link>
          </section>
        )}

        {runs !== null && runs.length >= 2 && (
          <>
            {runs.length > 2 && (
              <div className="flex flex-wrap gap-4">
                <RunSelect label="Original" runs={runs} value={leftId} onChange={setLeftId} />
                <RunSelect label="Rewound" runs={runs} value={rightId} onChange={setRightId} />
              </div>
            )}
            {left && right && <CompareView original={left} rewound={right} />}
          </>
        )}
      </main>
      <SafetyFooter />
    </div>
  );
}
