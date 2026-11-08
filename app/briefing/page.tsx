"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CustomPatientAvatar } from "@/app/encounter/CustomPatientAvatar";
import { GeneratePatientModal } from "@/app/encounter/GeneratePatientModal";
import {
  loadCompletedBranches,
  loadGeneratedScenarios,
  saveGeneratedScenario,
} from "@/app/encounter/storage";
import { AppHeader } from "@/components/AppHeader";
import { JordanAvatar } from "@/components/JordanAvatar";
import { ContentNote, SafetyFooter } from "@/components/SafetyFooter";
import {
  loadActiveScenario,
  loadSelectableScenarios,
  switchActiveScenario,
} from "@/lib/activeScenario";
import { isJordanCaseId, JORDAN_SCENARIO_V2, type ScenarioV2 } from "@/lib/scenarios";

// Jordan keeps the hand-written intake card below; AI-generated patients use scenario.briefing.

const INTAKE = [
  { label: "Reason", value: "Insomnia", tone: "text-fg" },
  { label: "Sleep", value: "3–4 h", tone: "text-warn font-mono" },
  { label: "Duration", value: "~2 mo", tone: "text-fg font-mono" },
  { label: "Mood screen", value: "Left blank", tone: "text-muted" },
];

const STEPS = [
  {
    title: "Interview",
    body: "The patient discloses more as trust grows. Dismissiveness shuts the door.",
    color: "text-info",
    icon: (
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
      </>
    ),
  },
  {
    title: "Assess & decide",
    body: "Screen for risk, commit to a risk level, then choose a plan.",
    color: "text-warn",
    icon: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
  {
    title: "Rewind",
    body: "Go back to a critical moment, try again, and compare outcomes.",
    color: "text-ok",
    icon: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </>
    ),
  },
  {
    title: "Cited feedback",
    body: "Every feedback point links to a published framework: C-SSRS, SAFE-T, PHQ-9, OARS.",
    color: "text-cite",
    icon: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
        <path d="M4 19.5V21h16" />
      </>
    ),
  },
];

export default function BriefingPage() {
  const [scenario, setScenario] = useState<ScenarioV2>(JORDAN_SCENARIO_V2);
  const [saved, setSaved] = useState<ScenarioV2[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    // localStorage is client-only; read after mount to avoid a hydration mismatch
    queueMicrotask(() => {
      setScenario(loadActiveScenario());
      setSaved(loadGeneratedScenarios());
    });
    // Cases the instructor shared with the class (Supabase)
    void loadSelectableScenarios().then(setSaved);
  }, []);

  const choose = (next: ScenarioV2) => {
    if (
      next.id !== scenario.id &&
      loadCompletedBranches().length > 0 &&
      !window.confirm(`Switch to ${next.patient.name}? Runs saved for ${scenario.patient.name} will be cleared.`)
    ) {
      // Keep a freshly generated patient in the list even if the learner stays put
      if (!isJordanCaseId(next.id)) saveGeneratedScenario(next);
      void loadSelectableScenarios().then(setSaved);
      return;
    }
    switchActiveScenario(next);
    setScenario(next);
    void loadSelectableScenarios().then(setSaved);
  };

  const isJordan = isJordanCaseId(scenario.id);
  const { patient } = scenario;
  const intake = isJordan
    ? INTAKE
    : scenario.briefing.intake.slice(0, 4).map((item) => ({ ...item, tone: "text-fg" }));
  const setting = isJordan ? "WALK-IN CLINIC · ROOM 2 · 4:40 PM" : scenario.briefing.setting.toUpperCase();
  const goal = isJordan
    ? "Conduct a focused psychiatric interview, build rapport, assess risk, and choose a safe plan. Jordan will share more if you earn trust."
    : scenario.briefing.goal;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="briefing" />
      <ContentNote />

      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-wrap items-start gap-8 px-4 py-10 sm:px-6">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-7 rounded-[20px] border border-line bg-panel p-6 sm:p-8">
          <div className="flex items-center gap-2.5 font-mono text-[13px] tracking-wider text-info">
            <span className="h-2 w-2 rounded-full bg-info" />
            {setting}
          </div>

          <div className="flex flex-wrap items-center gap-7">
            {isJordan ? (
              <JordanAvatar emotion="withdrawn" size={160} className="shrink-0" />
            ) : (
              <CustomPatientAvatar
                look={scenario.avatar}
                patientName={patient.name}
                age={patient.age}
                emotion={scenario.initialEmotion ?? "withdrawn"}
                size={160}
                className="shrink-0"
              />
            )}
            <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5">
              <h1 className="font-display text-[40px] font-bold leading-tight tracking-tight">
                {patient.name}, {patient.age}
              </h1>
              <p className="text-xl italic text-fg-2">&ldquo;{patient.opening}&rdquo;</p>
              <p className="text-sm text-muted">
                {isJordan
                  ? "Logistics coordinator · came in alone · first visit to this clinic"
                  : `${scenario.title}${scenario.isAiGenerated ? " · AI-generated case" : ""}`}
              </p>
              <button
                type="button"
                onClick={() => {
                  void loadSelectableScenarios().then(setSaved);
                  setPickerOpen(true);
                }}
                className="mt-1 inline-flex min-h-11 w-fit items-center rounded-xl border border-line-2 px-4 text-sm font-semibold hover:bg-chip"
              >
                Choose a different patient
              </button>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-[13px] font-semibold tracking-widest text-muted">
              INTAKE FORM
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {intake.map((item) => (
                <div key={item.label} className="rounded-2xl border border-line bg-ink px-4 py-3.5">
                  <div className="text-xs text-muted">{item.label}</div>
                  <div className={`mt-1 text-lg font-semibold ${item.tone}`}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 rounded-2xl border border-ok-line bg-ok-bg px-5 py-4">
            <div className="text-[13px] font-semibold tracking-wider text-ok">YOUR GOAL</div>
            <p className="leading-relaxed">{goal}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/encounter"
              className="inline-flex min-h-11 items-center gap-2.5 rounded-xl bg-ok px-7 py-4 text-[17px] font-bold text-[#062012] hover:brightness-110"
            >
              Begin encounter
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <span className="text-sm text-muted">About 8 minutes · voice or text</span>
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <h2 className="font-display text-xl font-semibold">How this works</h2>
          {STEPS.map((step) => (
            <div key={step.title} className="flex gap-3.5 rounded-2xl border border-line bg-panel p-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-chip">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={step.color} aria-hidden="true">
                  {step.icon}
                </svg>
              </div>
              <div>
                <div className="mb-1 font-semibold">{step.title}</div>
                <p className="text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </div>
          ))}
        </aside>
      </main>

      <GeneratePatientModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        activeScenarioId={scenario.id}
        savedScenarios={saved}
        onSelectScenario={choose}
        onGeneratedScenario={choose}
      />

      <SafetyFooter />
    </div>
  );
}
