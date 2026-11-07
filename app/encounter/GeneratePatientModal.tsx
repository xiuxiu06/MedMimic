"use client";

import { useState } from "react";
import {
  JORDAN_SCENARIO_V2,
  TEMPERAMENT_LABELS,
  type PatientTemperament,
  type ScenarioV2,
} from "../../lib/scenarios";

export interface GeneratePatientModalProps {
  open: boolean;
  onClose: () => void;
  activeScenarioId: string;
  savedScenarios: readonly ScenarioV2[];
  onSelectScenario: (scenario: ScenarioV2) => void;
  onGeneratedScenario: (scenario: ScenarioV2) => void;
}

const QUICK_PRESETS: ReadonlyArray<{
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  temperament: PatientTemperament | "random";
  conditionCategory: string;
  accent: string;
}> = [
  {
    id: "angry-pain",
    badge: "Short Fuse",
    title: "Angry & Confrontational Off the Bat",
    subtitle: "Arrives fed up over pain/med taper; snaps until de-escalated",
    temperament: "hostile_volatile",
    conditionCategory: "chronic_pain",
    accent: "border-rose-500/45 bg-rose-950/35 hover:border-rose-400/80 text-rose-100",
  },
  {
    id: "ptsd-volatile",
    badge: "Volatile",
    title: "PTSD Nightmares & Hair-Trigger Anger",
    subtitle: "Hypervigilant, exhausted, bristles at checklist questioning",
    temperament: "hostile_volatile",
    conditionCategory: "ptsd_anger",
    accent: "border-rose-500/40 bg-rose-950/25 hover:border-rose-400/75 text-rose-100",
  },
  {
    id: "panic-er",
    badge: "Pressured",
    title: "Agitated Panic & Somatic Crisis",
    subtitle: "Racing pulse, urgent speech, fears being brushed off again",
    temperament: "agitated_panicked",
    conditionCategory: "panic_somatic",
    accent: "border-amber-500/40 bg-amber-950/25 hover:border-amber-400/75 text-amber-100",
  },
  {
    id: "stoic-burnout",
    badge: "Closed-Off",
    title: "Stoic Minimizer in Silent Crisis",
    subtitle: "Downplays severe burnout & despair with dry, brief answers",
    temperament: "stoic_minimizer",
    conditionCategory: "burnout_caregiver",
    accent: "border-sky-500/40 bg-sky-950/25 hover:border-sky-400/75 text-sky-100",
  },
  {
    id: "suspicious-grief",
    badge: "Defensive",
    title: "Suspicious & Wary of Judgment",
    subtitle: "Questions why you are probing into grief & nighttime habits",
    temperament: "suspicious_defensive",
    conditionCategory: "bereavement_substance",
    accent: "border-purple-500/40 bg-purple-950/25 hover:border-purple-400/75 text-purple-100",
  },
  {
    id: "surprise-random",
    badge: "Gemini AI",
    title: "Surprise Me (Random Condition & Persona)",
    subtitle: "Dynamically invents a brand-new patient, voice & backstory",
    temperament: "random",
    conditionCategory: "random",
    accent: "border-emerald-500/40 bg-emerald-950/25 hover:border-emerald-400/75 text-emerald-100",
  },
];

const CONDITION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "random", label: "Surprise me (Any clinical presentation)" },
  { value: "chronic_pain", label: "Chronic Pain Flare & Medication Taper" },
  { value: "ptsd_anger", label: "PTSD Hyperarousal & Trauma Nightmares" },
  { value: "panic_somatic", label: "Recurrent Panic & Somatic Chest Tightness" },
  { value: "burnout_caregiver", label: "Caregiver / Shift-Work Burnout" },
  { value: "bereavement_substance", label: "Complicated Grief & Self-Medication" },
  { value: "bipolar_mixed", label: "Agitated Mixed-State Crash" },
  { value: "young_adult_crisis", label: "Academic / Early-Career Collapse" },
  { value: "chronic_illness", label: "Chronic Medical Illness & Loss of Autonomy" },
];

const TEMPERAMENT_OPTIONS: ReadonlyArray<{
  value: PatientTemperament | "random";
  label: string;
}> = [
  { value: "random", label: "Random Personality" },
  {
    value: "hostile_volatile",
    label: "Angry & Confrontational Off the Bat (Short Fuse)",
  },
  { value: "agitated_panicked", label: "Agitated, Restless & Panicked" },
  { value: "suspicious_defensive", label: "Suspicious & Defensive" },
  { value: "stoic_minimizer", label: "Stoic Minimizer (Downplays Distress)" },
  { value: "tearful_vulnerable", label: "Overwhelmed & Emotionally Fragile" },
  { value: "guarded_tired", label: "Guarded & Quietly Exhausted" },
];

export function GeneratePatientModal({
  open,
  onClose,
  activeScenarioId,
  savedScenarios,
  onSelectScenario,
  onGeneratedScenario,
}: GeneratePatientModalProps) {
  const [temperament, setTemperament] = useState<PatientTemperament | "random">(
    "random",
  );
  const [conditionCategory, setConditionCategory] = useState<string>("random");
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const runGeneration = async (opts: {
    temperament: PatientTemperament | "random";
    conditionCategory: string;
    prompt?: string;
    presetId?: string;
  }) => {
    if (isGenerating) return;
    setIsGenerating(true);
    setActivePresetId(opts.presetId ?? "custom");
    setError(null);

    try {
      const avoidNames = savedScenarios.map((s) => s.patient.name);
      const res = await fetch("/api/patients/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          temperament: opts.temperament,
          conditionCategory: opts.conditionCategory,
          prompt: opts.prompt?.trim() || undefined,
          avoidNames,
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        scenario?: ScenarioV2;
        error?: string;
      };

      if (!data.ok || !data.scenario) {
        throw new Error(data.error ?? "Failed to generate patient scenario.");
      }

      onGeneratedScenario(data.scenario);
      setCustomPrompt("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
      setActivePresetId(null);
    }
  };

  const allPatients: ScenarioV2[] = [
    JORDAN_SCENARIO_V2,
    ...savedScenarios.filter((s) => s.id !== JORDAN_SCENARIO_V2.id),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/15 bg-[#0F182B] p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-950/50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300">
              <span>✨ Powered by Gemini Structured Generation</span>
            </div>
            <h2 className="mt-2 text-lg font-bold text-[#E6EDF7]">
              Request a New Standardized Patient
            </h2>
            <p className="mt-0.5 text-xs text-[#9AA8BF]">
              Generate a brand-new fictional patient with custom clinical conditions,
              matched Gemini Live voice, animated avatar, and distinct personality
              (including volatile patients who start angry right off the bat).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="rounded-lg border border-white/10 bg-[#16233E] px-2.5 py-1 text-xs text-[#9AA8BF] hover:text-white disabled:opacity-40 cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        {/* One-Click Presets */}
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9AA8BF]">
            1-Click Patient Archetypes
          </h3>
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {QUICK_PRESETS.map((preset) => {
              const busy = isGenerating && activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={isGenerating}
                  onClick={() =>
                    void runGeneration({
                      temperament: preset.temperament,
                      conditionCategory: preset.conditionCategory,
                      presetId: preset.id,
                    })
                  }
                  className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all disabled:opacity-50 cursor-pointer ${preset.accent}`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-xs font-bold">{preset.title}</span>
                    <span className="shrink-0 rounded-full border border-white/20 bg-black/25 px-2 py-0.5 text-[10px] font-semibold">
                      {busy ? "Generating…" : preset.badge}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#C8D4E8]/85">
                    {preset.subtitle}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Builder Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runGeneration({
              temperament,
              conditionCategory,
              prompt: customPrompt,
              presetId: "custom",
            });
          }}
          className="mt-5 rounded-xl border border-white/10 bg-[#0B1220] p-4"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9AA8BF]">
            Or Customize Condition &amp; Personality
          </h3>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-medium text-[#B8C7E0]">
                Baseline Personality / Aggression
              </label>
              <select
                value={temperament}
                onChange={(e) =>
                  setTemperament(e.target.value as PatientTemperament | "random")
                }
                disabled={isGenerating}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#111A2E] px-3 py-2 text-xs text-[#E6EDF7] focus:border-sky-400 focus:outline-none"
              >
                {TEMPERAMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#B8C7E0]">
                Clinical Presentation
              </label>
              <select
                value={conditionCategory}
                onChange={(e) => setConditionCategory(e.target.value)}
                disabled={isGenerating}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#111A2E] px-3 py-2 text-xs text-[#E6EDF7] focus:border-sky-400 focus:outline-none"
              >
                {CONDITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-[11px] font-medium text-[#B8C7E0]">
              Optional Custom Scenario Request
            </label>
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              disabled={isGenerating}
              placeholder="e.g., 49-year-old construction foreman furious about waiting 2 hours with migraines and back pain…"
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#111A2E] px-3 py-2 text-xs text-[#E6EDF7] placeholder-[#697892] focus:border-sky-400 focus:outline-none"
            />
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#8593AA]">
              {isGenerating
                ? "Designing clinical disclosures, trust rules, voice & avatar with Gemini…"
                : "Starts a fresh encounter with the generated patient immediately."}
            </span>
            <button
              type="submit"
              disabled={isGenerating}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isGenerating && activePresetId === "custom" ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-slate-950 animate-ping" />
                  <span>Generating Patient…</span>
                </>
              ) : (
                <span>✨ Generate Custom Patient</span>
              )}
            </button>
          </div>
        </form>

        {/* Switch Between Existing / Previously Generated Patients */}
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9AA8BF]">
            Available Patients ({allPatients.length})
          </h3>
          <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {allPatients.map((sc) => {
              const isSelected = sc.id === activeScenarioId;
              const tempBadge = sc.temperament
                ? TEMPERAMENT_LABELS[sc.temperament]
                : undefined;
              return (
                <button
                  key={sc.id}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => {
                    onSelectScenario(sc);
                    onClose();
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? "border-sky-400/60 bg-[#17284A] text-white"
                      : "border-white/10 bg-[#111A2E] text-[#C8D4E8] hover:border-white/25"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {sc.patient.name}, {sc.patient.age}
                      </span>
                      {!sc.isAiGenerated && (
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-[#9AA8BF]">
                          Default Case
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-[#8593AA]">
                      {sc.title} · &ldquo;{sc.patient.opening}&rdquo;
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {tempBadge && (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${tempBadge.badgeColor}`}
                      >
                        {tempBadge.shortBadge}
                      </span>
                    )}
                    {isSelected && (
                      <span className="text-[11px] font-bold text-sky-300">
                        Active
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
