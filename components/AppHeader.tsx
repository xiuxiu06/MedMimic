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

export function AppHeader({ active, right }: { active?: Step; right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-header px-4 py-4 sm:px-8">
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
      <div className="flex flex-wrap items-center gap-2.5">
        {right}
        <AuthHeaderChip />
      </div>
    </header>
  );
}
