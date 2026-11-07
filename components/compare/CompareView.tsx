import Link from "next/link";
import { disclosureText, eventText, TOTAL_DISCLOSURES } from "@/lib/labels";
import { outcomeFor } from "@/lib/scoring";
import type { Branch } from "@/lib/types";

const CHECKPOINT_ID = "cp-heavy"; // lib/engine.ts DEMO_CHECKPOINT_ID

function checkpointTime(b: Branch): number | null {
  return b.timeline.find((e) => e.kind === "checkpoint" && e.label === CHECKPOINT_ID)?.t ?? null;
}

/** The first thing the student said after the checkpoint: the "one sentence" that diverged. */
function divergingLine(b: Branch): string | null {
  const cp = checkpointTime(b);
  const turn = b.timeline.find((e) => e.kind === "turn" && e.quote && (cp === null || e.t > cp));
  return turn?.quote ?? null;
}

function summarize(b: Branch, other: Branch) {
  const outcome = outcomeFor(b);
  const s = b.finalState;
  const otherUnlocked = new Set(other.finalState.unlocked);
  return {
    outcome,
    line: divergingLine(b),
    trust: s.trust,
    disclosures: s.unlocked.length,
    risk: s.studentRisk ?? null,
    actions: s.actions,
    onlyHere: s.unlocked.filter((id) => !otherUnlocked.has(id)),
    events: b.timeline.filter((e) => e.kind === "event").map((e) => e.label),
  };
}

const TONE = {
  pass: { border: "border-ok-line", head: "bg-ok-bg", badge: "text-ok-fg", text: "text-ok", stroke: "#4ADE80" },
  warn: { border: "border-warn-line", head: "bg-warn-bg", badge: "text-warn-fg", text: "text-warn", stroke: "#F5B544" },
  fail: { border: "border-bad-line", head: "bg-bad-bg", badge: "text-bad-fg", text: "text-bad", stroke: "#F87171" },
} as const;

const OUTCOME_SHORT = {
  risk_identified: "Risk identified",
  risk_underestimated: "Risk underestimated",
  risk_missed: "Risk missed",
} as const;

function Stat({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="rounded-xl bg-ink px-4 py-3.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 font-mono text-xl font-bold ${className}`}>{value}</div>
    </div>
  );
}

function RunCard({ title, run, other }: { title: string; run: Branch; other: Branch }) {
  const s = summarize(run, other);
  const t = TONE[s.outcome.badge];
  return (
    <section aria-label={title} className={`flex flex-col overflow-hidden rounded-[20px] border bg-panel ${t.border}`}>
      <div className={`flex items-center justify-between gap-3 px-6 py-4 ${t.head}`}>
        <h2 className="text-base font-bold">{title}</h2>
        <span className={`text-sm font-semibold ${t.badge}`}>{OUTCOME_SHORT[s.outcome.code]}</span>
      </div>
      <div className="flex flex-col gap-4 p-6">
        <blockquote className="rounded-xl bg-ink px-4 py-3.5 text-base italic leading-relaxed">
          {s.line ? `“${s.line}”` : "No student turn after the checkpoint."}
        </blockquote>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Trust" value={`${s.trust}%`} className={s.trust >= 60 ? "text-ok" : s.trust >= 40 ? "text-warn" : "text-bad"} />
          <Stat label="Disclosures" value={`${s.disclosures} / ${TOTAL_DISCLOSURES}`} className={t.text} />
          <Stat label="Your risk level" value={s.risk ?? "not set"} className={s.risk ? "text-fg" : "text-faint"} />
          <Stat label="Actions" value={s.actions.length ? s.actions.map(eventText).join(", ") : "none"} className="text-fg text-sm! font-semibold" />
        </div>
        <p className="text-sm leading-relaxed text-fg-2">{s.outcome.summary}</p>
        {s.onlyHere.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold tracking-widest text-muted">ONLY REVEALED IN THIS RUN</div>
            <ul className="flex flex-wrap gap-1.5">
              {s.onlyHere.map((id) => (
                <li key={id} className="rounded-full bg-chip px-2.5 py-1 text-xs font-semibold text-fg">
                  {disclosureText(id)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {s.events.length > 0 && (
          <p className="text-xs text-muted">Events: {s.events.map(eventText).join(" · ")}</p>
        )}
      </div>
    </section>
  );
}

function takeaway(a: Branch, b: Branch): string {
  const oa = outcomeFor(a);
  const ob = outcomeFor(b);
  const dTrust = b.finalState.trust - a.finalState.trust;
  const dDisc = b.finalState.unlocked.length - a.finalState.unlocked.length;
  const parts: string[] = [];
  if (dTrust !== 0) parts.push(`trust ${dTrust > 0 ? "rose" : "fell"} by ${Math.abs(dTrust)} points`);
  if (dDisc !== 0) parts.push(`${Math.abs(dDisc)} ${dDisc > 0 ? "more" : "fewer"} disclosure${Math.abs(dDisc) === 1 ? "" : "s"}`);
  const change = oa.code === ob.code ? `the outcome stayed “${OUTCOME_SHORT[ob.code]}”` : `the outcome changed from “${OUTCOME_SHORT[oa.code]}” to “${OUTCOME_SHORT[ob.code]}”`;
  return parts.length ? `After the checkpoint, ${parts.join(" and ")}, and ${change}.` : `After the checkpoint, ${change}.`;
}

export function BranchDiagram({ a, b }: { a: Branch; b: Branch }) {
  const top = TONE[outcomeFor(b).badge].stroke;
  const bottom = TONE[outcomeFor(a).badge].stroke;
  return (
    <section aria-label="Branch diagram" className="overflow-x-auto rounded-[20px] border border-line bg-panel px-6 py-5">
      <svg
        viewBox="0 0 1000 120"
        preserveAspectRatio="none"
        role="img"
        aria-label="Both runs share the start, then split at the checkpoint"
        className="block h-[120px] w-full min-w-[560px]"
        fill="none"
      >
        <path d="M20 60 H360" stroke="#9AA8BF" strokeWidth="3" />
        <path d="M360 60 C 440 60, 460 22, 540 22 H980" stroke={top} strokeWidth="3" />
        <path d="M360 60 C 440 60, 460 98, 540 98 H980" stroke={bottom} strokeWidth="3" strokeDasharray="8 6" />
        <rect x="348" y="48" width="24" height="24" rx="4" fill="#F5B544" transform="rotate(45 360 60)" />
        <circle cx="980" cy="22" r="8" fill={top} />
        <circle cx="980" cy="98" r="8" fill={bottom} />
      </svg>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>Start</span>
        <span className="text-warn">Checkpoint: “heavy”</span>
        <span>Top: rewound run · Bottom: original run</span>
      </div>
    </section>
  );
}

export function CompareView({ original, rewound }: { original: Branch; rewound: Branch }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <div className="font-mono text-[13px] tracking-wider text-warn">BRANCHED AT THE “HEAVY” CHECKPOINT</div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Same patient. One sentence. Different outcome.
        </h1>
      </div>

      <BranchDiagram a={original} b={rewound} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <RunCard title="Original run" run={original} other={rewound} />
        <RunCard title="Rewound run" run={rewound} other={original} />
      </div>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-line bg-panel px-6 py-5">
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-1.5">
          <div className="text-[13px] font-semibold tracking-widest text-muted">KEY TAKEAWAY</div>
          <p className="leading-relaxed">{takeaway(original, rewound)}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/debrief" className="inline-flex min-h-12 items-center rounded-xl border border-line-2 px-5 font-semibold hover:bg-chip">
            See debriefs
          </Link>
          <Link href="/encounter" className="inline-flex min-h-12 items-center rounded-xl bg-ok px-5 font-bold text-[#062012] hover:brightness-110">
            Try another path
          </Link>
        </div>
      </section>
    </div>
  );
}
