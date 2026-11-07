"use client";

import { useState } from "react";
import { JordanAvatar } from "../../components/JordanAvatar";
import {
  isJordanCaseId,
  JORDAN_SCENARIO_V2,
  TEMPERAMENT_LABELS,
  type ScenarioV2,
} from "../../lib/scenarios";
import type { Emotion } from "../../lib/types";
import { CustomPatientAvatar } from "./CustomPatientAvatar";

export interface PatientPortraitProps {
  emotion: Emotion;
  trust?: number;
  isSpeaking: boolean;
  audioLevel: number; // 0..1 normalized amplitude from Live audio or text speech pulse
  scenario?: ScenarioV2;
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
  trust = 50,
  isSpeaking,
  audioLevel,
  scenario = JORDAN_SCENARIO_V2,
}: PatientPortraitProps) {
  const [missingSlugs, setMissingSlugs] = useState<Record<string, boolean>>({});
  const isJordan = isJordanCaseId(scenario.id);
  const baseMeta = PORTRAIT_META[emotion] ?? PORTRAIT_META.neutral;

  const dynamicLabel =
    emotion === "irritable"
      ? trust < 20
        ? "Angry · Fed Up"
        : scenario.temperament === "hostile_volatile" && trust < 48
          ? "Hostile · Confrontational"
          : trust < 35
            ? "Angry · Frustrated"
            : "Irritable · Defensive"
      : emotion === "sad" && !isJordan
        ? "Low Mood · Weighed Down"
        : baseMeta.label;

  const meta = { ...baseMeta, label: dynamicLabel };
  const imgSrc = `/portraits/${meta.fileSlug}.png`;
  const useJordanFallbackSvg = Boolean(missingSlugs[meta.fileSlug]);
  const isAngry = emotion === "irritable";

  const effectivePulse = isSpeaking ? Math.max(0.28, Math.min(1, audioLevel)) : 0;
  const temperamentInfo = scenario.temperament
    ? TEMPERAMENT_LABELS[scenario.temperament]
    : undefined;
  const chiefComplaint = isJordan
    ? "Walk-in · “Trouble sleeping”"
    : `${scenario.briefing?.setting?.split("·")[0]?.trim() || "Clinic"} · “${
        scenario.briefing?.intake?.[0]?.value || scenario.title
      }”`;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b ${meta.bgGradient} p-4 shadow-lg transition-all duration-500 ${
        isSpeaking ? `ring-2 ${meta.accentRing}` : ""
      }`}
    >
      {/* Subtle speaking aura */}
      {isSpeaking && (
        <div
          className={`pointer-events-none absolute inset-0 rounded-2xl ${
            isAngry ? "bg-rose-500/10" : "bg-sky-400/5"
          } transition-opacity duration-150`}
          style={{ opacity: 0.25 + effectivePulse * 0.55 }}
        />
      )}

      <div className="relative mx-auto flex aspect-square w-full max-w-[224px] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#1A2640]">
        {isJordan ? (
          !useJordanFallbackSvg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={imgSrc}
              src={imgSrc}
              alt={`${scenario.patient.name} (${meta.label})`}
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
          )
        ) : (
          <CustomPatientAvatar
            look={scenario.avatar}
            patientName={scenario.patient.name}
            age={scenario.patient.age}
            emotion={emotion}
            talkLevel={effectivePulse}
            size={224}
            className="h-full w-full"
          />
        )}

        {/* AI-generated + Temperament pill in top-left for custom cases */}
        {scenario.isAiGenerated && temperamentInfo && (
          <span
            className={`absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${temperamentInfo.badgeColor}`}
          >
            {temperamentInfo.shortBadge}
          </span>
        )}

        {/* Voice waveform bars overlay when patient is speaking */}
        {isSpeaking && (
          <div
            className={`absolute bottom-2.5 right-2.5 flex items-end gap-0.5 rounded-full bg-[#0B1220]/85 px-2.5 py-1 backdrop-blur-sm border ${
              isAngry ? "border-rose-400/40" : "border-sky-400/30"
            }`}
          >
            {[0.55, 1, 0.75, 0.9, 0.5].map((mult, idx) => {
              const barHeight = Math.max(
                4,
                Math.round((4 + effectivePulse * 12) * mult),
              );
              return (
                <span
                  key={idx}
                  className={`w-1 rounded-full ${
                    isAngry ? "bg-rose-400" : "bg-sky-400"
                  } transition-all duration-75`}
                  style={{ height: `${barHeight}px` }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Patient identity + current expression badge */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[#E6EDF7]">
            {scenario.patient.name}, {scenario.patient.age}
          </div>
          <div className="truncate text-xs text-[#8593AA]">{chiefComplaint}</div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${meta.badgeClasses}`}
        >
          {meta.label}
        </span>
      </div>

      {/* Compact triage intake readout for AI-generated patients so students have chart context immediately */}
      {scenario.isAiGenerated && scenario.briefing?.intake?.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl border border-white/10 bg-[#0B1220]/70 p-2 text-[11px]">
          {scenario.briefing.intake.slice(0, 4).map((item, idx) => (
            <div key={idx} className="truncate">
              <span className="text-[#697892]">{item.label}: </span>
              <span className="font-medium text-[#C8D4E8]">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
