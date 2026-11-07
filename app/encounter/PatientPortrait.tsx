"use client";

import { useState } from "react";
import { JordanAvatar } from "../../components/JordanAvatar";
import type { Emotion } from "../../lib/types";

export interface PatientPortraitProps {
  emotion: Emotion;
  isSpeaking: boolean;
  audioLevel: number; // 0..1 normalized amplitude from Live audio or text speech pulse
}

const PORTRAIT_META: Record<
  Emotion,
  {
    label: string;
    fileSlug: string;
    accentRing: string;
    bgGradient: string;
    badgeClasses: string;
  }
> = {
  neutral: {
    label: "Tired · Guarded",
    fileSlug: "neutral",
    accentRing: "ring-sky-400/40",
    bgGradient: "from-[#152238] via-[#111A2E] to-[#0B1220]",
    badgeClasses: "bg-slate-800/90 text-slate-200 border-slate-600/60",
  },
  withdrawn: {
    label: "Withdrawn · Flat",
    fileSlug: "withdrawn",
    accentRing: "ring-amber-400/40",
    bgGradient: "from-[#1E2030] via-[#131726] to-[#0B1220]",
    badgeClasses: "bg-amber-950/80 text-amber-200 border-amber-700/60",
  },
  irritable: {
    label: "Tense · Guarded",
    fileSlug: "withdrawn",
    accentRing: "ring-rose-400/50",
    bgGradient: "from-[#2A1A28] via-[#161728] to-[#0B1220]",
    badgeClasses: "bg-rose-950/80 text-rose-200 border-rose-700/60",
  },
  sad: {
    label: "Low Mood · Heavy",
    fileSlug: "sad",
    accentRing: "ring-indigo-400/50",
    bgGradient: "from-[#17203A] via-[#10182C] to-[#0B1220]",
    badgeClasses: "bg-indigo-950/80 text-indigo-200 border-indigo-700/60",
  },
  tearful: {
    label: "Tearful · Vulnerable",
    fileSlug: "tearful",
    accentRing: "ring-cyan-400/60",
    bgGradient: "from-[#14293D] via-[#101D30] to-[#0B1220]",
    badgeClasses: "bg-cyan-950/80 text-cyan-200 border-cyan-700/60",
  },
  relieved: {
    label: "Steadier · Heard",
    fileSlug: "relieved",
    accentRing: "ring-emerald-400/60",
    bgGradient: "from-[#122D2B] via-[#101E28] to-[#0B1220]",
    badgeClasses: "bg-emerald-950/80 text-emerald-200 border-emerald-700/60",
  },
};

export function PatientPortrait({
  emotion,
  isSpeaking,
  audioLevel,
}: PatientPortraitProps) {
  const [missingSlugs, setMissingSlugs] = useState<Record<string, boolean>>({});
  const meta = PORTRAIT_META[emotion] ?? PORTRAIT_META.neutral;
  const imgSrc = `/portraits/${meta.fileSlug}.png`;
  const useFallbackSvg = Boolean(missingSlugs[meta.fileSlug]);

  const effectivePulse = isSpeaking ? Math.max(0.28, Math.min(1, audioLevel)) : 0;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b ${meta.bgGradient} p-4 shadow-lg transition-all duration-500 ${
        isSpeaking ? `ring-2 ${meta.accentRing}` : ""
      }`}
    >
      {/* Subtle speaking aura */}
      {isSpeaking && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl bg-sky-400/5 transition-opacity duration-150"
          style={{ opacity: 0.25 + effectivePulse * 0.55 }}
        />
      )}

      <div className="relative mx-auto flex aspect-square w-full max-w-[224px] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#1A2640]">
        {!useFallbackSvg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={imgSrc}
            src={imgSrc}
            alt={`Jordan Lee (${meta.label})`}
            className="h-full w-full object-cover transition-all duration-500"
            style={{
              transform: isSpeaking
                ? `scale(${1 + effectivePulse * 0.018})`
                : "scale(1)",
            }}
            onError={() =>
              setMissingSlugs((prev) => ({ ...prev, [meta.fileSlug]: true }))
            }
          />
        ) : (
          <JordanAvatar
            emotion={emotion}
            talkLevel={effectivePulse}
            size={224}
            className="h-full w-full"
          />
        )}

        {/* Voice waveform bars overlay when Jordan is speaking */}
        {isSpeaking && (
          <div className="absolute bottom-2.5 right-2.5 flex items-end gap-0.5 rounded-full bg-[#0B1220]/85 px-2.5 py-1 backdrop-blur-sm border border-sky-400/30">
            {[0.55, 1, 0.75, 0.9, 0.5].map((mult, idx) => {
              const barHeight = Math.max(
                4,
                Math.round((4 + effectivePulse * 12) * mult),
              );
              return (
                <span
                  key={idx}
                  className="w-1 rounded-full bg-sky-400 transition-all duration-75"
                  style={{ height: `${barHeight}px` }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Patient identity + current expression badge */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-[#E6EDF7]">
            Jordan Lee, 34
          </div>
          <div className="text-xs text-[#8593AA]">
            Walk-in · &ldquo;Trouble sleeping&rdquo;
          </div>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${meta.badgeClasses}`}
        >
          {meta.label}
        </span>
      </div>
    </div>
  );
}
