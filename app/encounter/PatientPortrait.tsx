"use client";

import { useState } from "react";
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
  const mouthOpen = 2 + Math.round(effectivePulse * 9);

  // Facial geometry tweaks per emotion for the fallback clinical portrait
  const browSlope =
    emotion === "irritable"
      ? 5
      : emotion === "sad" || emotion === "tearful"
        ? -5
        : emotion === "withdrawn"
          ? -2
          : 0;

  const eyeOpenHalf =
    emotion === "withdrawn"
      ? 2.2
      : emotion === "sad" || emotion === "tearful"
        ? 3.2
        : 4;

  const mouthCurve =
    emotion === "relieved"
      ? 5
      : emotion === "sad" || emotion === "tearful"
        ? -5
        : emotion === "withdrawn" || emotion === "irritable"
          ? -3
          : -1;

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

      <div className="relative mx-auto flex aspect-[4/3] w-full max-w-[260px] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#0D1526]">
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
          <svg
            viewBox="0 0 220 180"
            className="h-full w-full select-none"
            role="img"
            aria-label={`Jordan Lee expression: ${meta.label}`}
          >
            <defs>
              <radialGradient id="roomGlow" cx="50%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#1E3354" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#0B1220" stopOpacity="1" />
              </radialGradient>
            </defs>
            <rect width="220" height="180" fill="url(#roomGlow)" />

            {/* Shoulders / hoodie */}
            <path
              d="M36 180 C44 136, 74 124, 110 124 C146 124, 176 136, 184 180 Z"
              fill="#24344D"
            />
            <path
              d="M84 125 L110 152 L136 125"
              fill="none"
              stroke="#182438"
              strokeWidth="5"
              strokeLinecap="round"
            />

            {/* Neck & head */}
            <rect x="97" y="102" width="26" height="28" rx="10" fill="#C99A7B" />
            <ellipse cx="110" cy="76" rx="34" ry="41" fill="#D7A98B" />

            {/* Hair */}
            <path
              d="M75 72 C73 40, 92 27, 112 28 C133 29, 147 42, 145 72 C140 54, 128 46, 110 46 C91 46, 80 55, 75 72 Z"
              fill="#1E2430"
            />

            {/* Under-eye fatigue circles */}
            <path
              d="M88 77 Q96 81 103 77"
              fill="none"
              stroke="#9C7158"
              strokeWidth="1.6"
              opacity="0.65"
            />
            <path
              d="M117 77 Q124 81 132 77"
              fill="none"
              stroke="#9C7158"
              strokeWidth="1.6"
              opacity="0.65"
            />

            {/* Eyebrows */}
            <line
              x1="86"
              y1={63 - browSlope}
              x2="103"
              y2={63 + browSlope}
              stroke="#202632"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <line
              x1="117"
              y1={63 + browSlope}
              x2="134"
              y2={63 - browSlope}
              stroke="#202632"
              strokeWidth="2.6"
              strokeLinecap="round"
            />

            {/* Eyes */}
            <ellipse
              cx="95"
              cy="72"
              rx="5.5"
              ry={eyeOpenHalf}
              fill="#1B2230"
            />
            <ellipse
              cx="125"
              cy="72"
              rx="5.5"
              ry={eyeOpenHalf}
              fill="#1B2230"
            />
            {emotion !== "withdrawn" && (
              <>
                <circle cx="96.5" cy="71" r="1.2" fill="#E6EDF7" />
                <circle cx="126.5" cy="71" r="1.2" fill="#E6EDF7" />
              </>
            )}

            {/* Tear glint when tearful */}
            {emotion === "tearful" && (
              <>
                <ellipse
                  cx="92"
                  cy="81"
                  rx="2"
                  ry="3.4"
                  fill="#7DD3FC"
                  opacity="0.85"
                />
                <ellipse
                  cx="128"
                  cy="83"
                  rx="1.8"
                  ry="3"
                  fill="#7DD3FC"
                  opacity="0.75"
                />
              </>
            )}

            {/* Nose */}
            <path
              d="M110 73 L107 88 L113 89"
              fill="none"
              stroke="#AD7E61"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Voice-driven mouth */}
            {isSpeaking ? (
              <ellipse
                cx="110"
                cy="101"
                rx={7 + effectivePulse * 2}
                ry={mouthOpen * 0.45}
                fill="#5A2E2E"
                stroke="#8C5347"
                strokeWidth="1.5"
              />
            ) : (
              <path
                d={`M100 101 Q110 ${101 + mouthCurve} 120 101`}
                fill="none"
                stroke="#7D493E"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            )}
          </svg>
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
