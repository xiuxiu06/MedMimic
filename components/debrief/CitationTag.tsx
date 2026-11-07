"use client";

import { useRef, useState } from "react";
import type { PassageView } from "@/lib/rag";
import type { Citation } from "@/lib/types";

// Passages never change at runtime, so cache them for the session.
const cache = new Map<string, PassageView>();

async function loadPassage(id: string): Promise<PassageView> {
  const hit = cache.get(id);
  if (hit) return hit;
  const res = await fetch(`/api/guidelines/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Passage ${id} not found`);
  const data = (await res.json()) as PassageView;
  cache.set(id, data);
  return data;
}

/**
 * Citation chip. Clicking opens a dialog with the verbatim guideline passage the
 * feedback was grounded in, so viewers can see the RAG source for themselves.
 */
export function CitationTag({ c }: { c: Citation }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [passage, setPassage] = useState<PassageView | null>(cache.get(c.sourceId) ?? null);
  const [error, setError] = useState(false);

  const open = async () => {
    dialogRef.current?.showModal();
    if (passage) return;
    try {
      setError(false);
      setPassage(await loadPassage(c.sourceId));
    } catch {
      setError(true);
    }
  };

  const label = c.section ? `${c.source} · ${c.section}` : c.source;
  const titleId = `passage-title-${c.sourceId}`;

  return (
    <>
      <button
        type="button"
        onClick={() => void open()}
        aria-haspopup="dialog"
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-cite-bg px-2.5 py-1 text-xs font-semibold text-cite hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cite"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
          <path d="M4 19.5V21h16" />
        </svg>
        {label}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(e) => {
          // Click on the backdrop (the dialog element itself) closes it.
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(640px,calc(100vw-32px))] rounded-[20px] border border-line bg-panel p-0 text-fg backdrop:bg-black/60"
      >
        <div className="flex max-h-[80vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-semibold tracking-widest text-cite">GUIDELINE PASSAGE · {c.sourceId}</span>
              <h2 id={titleId} className="font-display text-lg font-bold leading-snug">
                {passage ? passage.source : c.source}
              </h2>
              {passage && <p className="text-sm text-muted">{passage.section}</p>}
            </div>
            <form method="dialog">
              <button
                type="submit"
                aria-label="Close passage"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-chip hover:text-fg"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </form>
          </header>

          <div className="overflow-y-auto px-6 py-5">
            {error && <p className="text-bad-fg">Couldn&apos;t load this passage. Try again in a moment.</p>}
            {!error && !passage && (
              <div className="flex flex-col gap-2" aria-busy="true">
                <div className="h-4 w-full animate-pulse rounded bg-chip" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-chip" />
                <div className="h-4 w-4/6 animate-pulse rounded bg-chip" />
              </div>
            )}
            {passage && (
              <blockquote className="whitespace-pre-line border-l-0 text-[15px] leading-relaxed text-fg-2">
                {passage.text}
              </blockquote>
            )}
          </div>

          {passage && (
            <footer className="flex flex-col gap-1.5 border-t border-line px-6 py-4 text-xs text-muted">
              <span>Verbatim excerpt used to ground this feedback. Not a substitute for the full source.</span>
              {passage.attribution && <span className="text-faint">{passage.attribution}</span>}
              {passage.url && (
                <a href={passage.url} target="_blank" rel="noopener noreferrer" className="w-fit font-semibold">
                  Open the official source ↗
                </a>
              )}
            </footer>
          )}
        </div>
      </dialog>
    </>
  );
}
