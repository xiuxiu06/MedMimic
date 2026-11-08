import Link from "next/link";
import type { ReactNode } from "react";
import { AuthHeaderChip } from "./AuthHeaderChip";

export type Step = "briefing" | "encounter" | "debrief" | "compare";

const STEPS: { id: Step; label: string; href: string }[] = [
  { id: "briefing", label: "1 Briefing", href: "/briefing" },
  { id: "encounter", label: "2 Encounter", href: "/encounter" },
  { id: "debrief", label: "3 Debrief", href: "/debrief" },
  { id: "compare", label: "4 Compare", href: "/compare" },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-ok"
        aria-hidden="true"
      >
        <polyline points="2 12 6 12 9 4 13 20 16 12 22 12" />
      </svg>
      <span className="font-display text-[22px] font-bold tracking-tight">
        MedMimic
      </span>
    </Link>
  );
}

/**
 * Shared top bar, pinned on every page. The main row is identical on all tabs
 * (logo · steps · account); page-specific controls go in `toolbar`, a second pinned row.
 * `right` is only for a short label/link next to the account chip.
 */
export function AppHeader({
  active,
  right,
  toolbar,
}: {
  active?: Step;
  right?: ReactNode;
  toolbar?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-header/95 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-8 lg:grid lg:grid-cols-[1fr_auto_1fr]">
      <Logo />
      <nav aria-label="Encounter steps" className="flex flex-wrap gap-1.5 text-sm">
        {STEPS.map((s) => (
          <Link
            key={s.id}
            href={s.href}
            aria-current={s.id === active ? "step" : undefined}
            className={
              s.id === active
                ? "rounded-full bg-chip px-3.5 py-2 font-semibold text-fg"
                : "rounded-full px-3.5 py-2 text-muted hover:text-fg"
            }
          >
            {s.label}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-2.5 lg:justify-self-end">
        {right}
        <AuthHeaderChip />
      </div>
      </div>
      {toolbar && (
        <div className="border-t border-line px-4 py-2 sm:px-8">{toolbar}</div>
      )}
    </header>
  );
}
