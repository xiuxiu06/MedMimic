import Link from "next/link";
import type { Branch, Citation, Debrief, FeedbackItem, TimelineEvent } from "@/lib/types";
import { CRITERION_TEXT, eventText, formatTime, POSITIVE_EVENTS } from "@/lib/labels";

export type OutcomeTone = "bad" | "warn" | "ok";

const TONE = {
  bad: { box: "border-bad-line bg-bad-bg", eyebrow: "text-bad", detail: "text-bad-fg" },
  warn: { box: "border-warn-line bg-warn-bg", eyebrow: "text-warn", detail: "text-warn-fg" },
  ok: { box: "border-ok-line bg-ok-bg", eyebrow: "text-ok", detail: "text-ok-fg" },
} as const;

function RewindIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

export function OutcomeBanner({
  title,
  detail,
  tone,
  canCompare = false,
}: {
  title: string;
  detail: string;
  tone: OutcomeTone;
  canCompare?: boolean;
}) {
  const t = TONE[tone];
  return (
    <section className={`flex flex-wrap items-center justify-between gap-5 rounded-[20px] border px-6 py-6 sm:px-7 ${t.box}`}>
      <div className="flex flex-col gap-1.5">
        <div className={`text-[13px] font-semibold tracking-widest ${t.eyebrow}`}>OUTCOME</div>
        <h1 className="font-display text-[32px] font-bold tracking-tight">{title}</h1>
        <p className={t.detail}>{detail}</p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Link href="/encounter" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-ok px-5 font-bold text-[#062012] hover:brightness-110">
          <RewindIcon />
          Rewind to checkpoint
        </Link>
        {canCompare && (
          <Link href="/compare" className="inline-flex min-h-12 items-center rounded-xl border border-line-2 px-5 font-semibold text-fg hover:bg-chip">
            Compare runs
          </Link>
        )}
      </div>
    </section>
  );
}

function markerFor(e: TimelineEvent) {
  if (e.kind === "checkpoint") {
    return (
      <div className="mt-1 flex h-9 w-9 rotate-45 items-center justify-center rounded-md bg-warn">
        <span className="-rotate-45 text-[#2a1a00]"><RewindIcon /></span>
      </div>
    );
  }
  if (e.kind === "missed") {
    return <div className="mt-[11px] h-[22px] w-[22px] rounded-full border-2 border-dashed border-bad" />;
  }
  const color =
    e.kind === "action" && e.label === "sleep_aid"
      ? "bg-bad"
      : e.kind === "event" && !POSITIVE_EVENTS.has(e.label)
        ? "bg-warn"
        : (e.trustDelta ?? 0) < 0
          ? "bg-warn"
          : "bg-ok";
  return <div className={`mt-[13px] h-[18px] w-[18px] rounded-full ${color}`} />;
}

function detailFor(e: TimelineEvent): { text: string; className: string } | null {
  if (e.kind === "missed") return { text: "Disclosures stayed locked", className: "text-bad" };
  if (e.trustDelta) {
    return {
      text: `Trust ${e.trustDelta > 0 ? "+" : "−"}${Math.abs(e.trustDelta)}%`,
      className: e.trustDelta > 0 ? "text-ok-fg" : "text-warn",
    };
  }
  if (e.kind === "action" && e.label === "sleep_aid") return { text: "Possible access to means", className: "text-bad" };
  return null;
}

const KEY_TURNS = new Set(["asked_SI_directly", "asked_plan", "asked_support"]);

/** Real runs have many turns; keep the decision points (max ~10). */
export function keyEvents(timeline: TimelineEvent[]): TimelineEvent[] {
  const keep = timeline.filter(
    (e) =>
      e.kind !== "turn" ||
      KEY_TURNS.has(e.label) ||
      Math.abs(e.trustDelta ?? 0) >= 10,
  );
  if (keep.length <= 10) return keep;
  // Too many: drop plain turns first, keep checkpoints/missed/events/actions.
  const essential = keep.filter((e) => e.kind !== "turn");
  return essential.length >= 10 ? essential.slice(0, 10) : keep.slice(0, 10);
}

export function DecisionTimeline({ timeline: fullTimeline }: { timeline: TimelineEvent[] }) {
  const timeline = keyEvents(fullTimeline);
  return (
    <section aria-label="Decision timeline" className="flex flex-col gap-5 rounded-[20px] border border-line bg-panel px-6 py-6 sm:px-7">
      <h2 className="text-[13px] font-semibold tracking-widest text-muted">DECISION TIMELINE</h2>
      <div className="overflow-x-auto">
        <div className="relative pt-2" style={{ minWidth: `${timeline.length * 140}px` }}>
        <div className="absolute left-6 right-6 top-[30px] h-0.5 bg-line" aria-hidden="true" />
        <ol
          className="relative grid gap-3"
          style={{ gridTemplateColumns: `repeat(${timeline.length}, minmax(128px, 1fr))` }}
        >
          {timeline.map((e, i) => {
            const d = detailFor(e);
            const isCheckpoint = e.kind === "checkpoint";
            return (
              <li key={i} className="relative flex flex-col items-center gap-2.5 text-center">
                {markerFor(e)}
                <div className={`font-mono text-xs ${isCheckpoint ? "text-warn" : "text-muted"}`}>
                  {e.kind === "missed" ? "—" : formatTime(e.t)}
                  {isCheckpoint && " · CHECKPOINT"}
                </div>
                <div className="text-sm font-semibold">{eventText(e.label)}</div>
                {d && <div className={`text-xs ${d.className}`}>{d.text}</div>}
              </li>
            );
          })}
        </ol>
        </div>
      </div>
    </section>
  );
}

function scoreColor(score: number) {
  if (score >= 7) return { bar: "bg-ok", text: "text-ok" };
  if (score >= 4) return { bar: "bg-warn", text: "text-warn" };
  return { bar: "bg-bad", text: "text-bad" };
}

export function RubricScores({ scores }: { scores: Debrief["scores"] }) {
  return (
    <section aria-label="Rubric scores" className="flex min-w-0 flex-[1_1_340px] flex-col gap-4.5 rounded-[20px] border border-line bg-panel px-6 py-6 sm:px-7">
      <h2 className="text-[13px] font-semibold tracking-widest text-muted">RUBRIC SCORES</h2>
      {scores.map((s) => {
        const c = scoreColor(s.score);
        return (
          <div key={s.criterion}>
            <div className="mb-2 flex justify-between text-[15px]">
              <span>{CRITERION_TEXT[s.criterion]}</span>
              <span className={`font-mono ${c.text}`}>{s.score}/10</span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-ink"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuenow={s.score}
              aria-label={CRITERION_TEXT[s.criterion]}
            >
              <div className={`h-full ${c.bar}`} style={{ width: `${Math.max(s.score * 10, 2)}%` }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function CitationTag({ c }: { c: Citation }) {
  const text = c.section ? `${c.source} · ${c.section}` : c.source;
  // TODO (Stage 3): open a popover with the retrieved passage from data/guidelines.json.
  return (
    <span title={c.url ?? c.sourceId} className="rounded-full bg-cite-bg px-2.5 py-1 text-xs font-semibold text-cite">
      {text}
    </span>
  );
}

const FEEDBACK_HEAD: Record<FeedbackItem["kind"], { label: string; className: string }> = {
  communication: { label: "Communication", className: "text-warn" },
  missed: { label: "Missed step", className: "text-bad" },
  unsafe: { label: "Unsafe decision", className: "text-bad" },
  strength: { label: "Done well", className: "text-ok" },
};

export function FeedbackList({ items, timeline }: { items: FeedbackItem[]; timeline: TimelineEvent[] }) {
  return (
    <section aria-label="Feedback with evidence" className="flex min-w-0 flex-[999_1_480px] flex-col gap-4 rounded-[20px] border border-line bg-panel px-6 py-6 sm:px-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-widest text-muted">FEEDBACK WITH EVIDENCE</h2>
        <span className="text-xs text-cite">Grounded in MedMimic guideline library</span>
      </div>
      {items.map((f, i) => {
        const head = FEEDBACK_HEAD[f.kind];
        const ref = f.timelineRef !== undefined ? timeline[f.timelineRef] : undefined;
        const isStrength = f.kind === "strength";
        return (
          <article
            key={i}
            className={`flex flex-col gap-2 rounded-2xl border px-4.5 py-4 ${isStrength ? "border-ok-line bg-ok-bg" : "border-line bg-ink"}`}
          >
            <div className={`font-mono text-xs ${head.className}`}>
              {f.quote && ref ? `${formatTime(ref.t)} · You said` : head.label}
            </div>
            {f.quote && <blockquote className="text-base italic">&ldquo;{f.quote}&rdquo;</blockquote>}
            {!f.quote && !isStrength && ref && (
              <div className="text-base font-semibold">{eventText(ref.label)}</div>
            )}
            <p className={`text-sm leading-relaxed ${isStrength ? "text-ok-fg" : "text-fg-2"}`}>{f.feedback}</p>
            {f.citations.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {f.citations.map((c) => (
                  <CitationTag key={c.sourceId} c={c} />
                ))}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

export function DebriefView({
  branch,
  debrief,
  outcome,
  canCompare = false,
}: {
  branch: Branch;
  debrief: Debrief;
  outcome: { tone: OutcomeTone; detail: string };
  canCompare?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <OutcomeBanner title={debrief.outcome} detail={outcome.detail} tone={outcome.tone} canCompare={canCompare} />
      <DecisionTimeline timeline={branch.timeline} />
      <div className="flex flex-wrap items-stretch gap-6">
        <RubricScores scores={debrief.scores} />
        <FeedbackList items={debrief.feedback} timeline={branch.timeline} />
      </div>
    </div>
  );
}
