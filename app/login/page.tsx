"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { SafetyFooter } from "../../components/SafetyFooter";
import { GeneratePatientModal } from "../encounter/GeneratePatientModal";
import { loadCompletedBranches } from "../encounter/storage";
import {
  loadActiveScenario,
  loadSelectableScenarios,
  switchActiveScenario,
} from "../../lib/activeScenario";
import {
  isPlayableScenario,
  JORDAN_SCENARIO_V2,
  type ScenarioV2,
} from "../../lib/scenarios";
import { clearLearnerLocalData } from "../../lib/localData";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import { hydrateLocalStorageFromCloudSession } from "../../lib/supabase/sync";
import type {
  EncounterSessionWithBranches,
  ScenarioRecord,
  TrainingRole,
  UserProfile,
} from "../../lib/supabase/types";

const ROLE_LABELS: Record<TrainingRole, string> = {
  medical_student: "Medical Student (MD / DO)",
  nursing_student: "Nursing Student (BSN / NP)",
  pa_student: "Physician Assistant Student",
  psych_trainee: "Psychiatry / Psychology Trainee",
  instructor: "Clinical Skills Instructor",
  other: "Other Learner",
};

const OUTCOME_PILL: Record<
  "risk_identified" | "risk_underestimated" | "risk_missed",
  { label: string; classes: string }
> = {
  risk_identified: {
    label: "Risk identified",
    classes: "border-ok-line bg-ok-bg text-ok-fg",
  },
  risk_underestimated: {
    label: "Risk underestimated",
    classes: "border-warn-line bg-warn-bg text-warn-fg",
  },
  risk_missed: {
    label: "Risk missed",
    classes: "border-bad-line bg-bad-bg text-bad-fg",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured();

  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    tone: "ok" | "bad" | "info";
    text: string;
  } | null>(null);

  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [isInstructor, setIsInstructor] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<EncounterSessionWithBranches[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);

  // Patient picker / Gemini case creation (instructors), shared with encounter + briefing
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCases, setPickerCases] = useState<ScenarioV2[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string>(JORDAN_SCENARIO_V2.id);

  const refreshDashboard = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setIsLoadingSession(true);
    }
    try {
      const [sessRes, scenRes] = await Promise.all([
        fetch("/api/sessions"),
        fetch("/api/scenarios"),
      ]);
      const sessJson = (await sessRes.json()) as {
        authenticated?: boolean;
        user?: { email: string | null; name?: string | null; isInstructor?: boolean };
        profile?: UserProfile | null;
        sessions?: EncounterSessionWithBranches[];
      };
      const scenJson = (await scenRes.json()) as {
        scenarios?: ScenarioRecord[];
      };

      if (sessJson.authenticated) {
        setAuthedEmail(sessJson.user?.email ?? sessJson.user?.name ?? "Signed in");
        setIsInstructor(Boolean(sessJson.user?.isInstructor));
        setProfile(sessJson.profile ?? null);
        setSessions(sessJson.sessions ?? []);
      } else {
        setAuthedEmail(null);
        setProfile(null);
        setSessions([]);
      }

      if (scenJson.scenarios) {
        setScenarios(scenJson.scenarios);
      }
    } catch {
      // Ignore network hiccup
    } finally {
      setIsLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const initialLoad = async () => {
      if (!active) return;
      await refreshDashboard(false);
    };
    void initialLoad();
    return () => {
      active = false;
    };
  }, [refreshDashboard]);

  // Auth0: sign-in / sign-up / sign-out are hosted routes mounted by proxy.ts.

  const handleOpenSavedSession = (
    session: EncounterSessionWithBranches,
    target: "/debrief" | "/compare",
  ) => {
    const hydrated = hydrateLocalStorageFromCloudSession(session);
    if (hydrated.length > 0) {
      router.push(target);
    }
  };

  /** Make a case the active patient and go to its briefing. */
  const practiceCase = (next: ScenarioV2) => {
    if (
      next.id !== loadActiveScenario().id &&
      loadCompletedBranches().length > 0 &&
      !window.confirm(
        `Practice ${next.patient.name}? Your current local runs will be cleared (saved runs stay in your history).`,
      )
    ) {
      return;
    }
    switchActiveScenario(next);
    router.push("/briefing");
  };

  const openCasePicker = () => {
    setActiveCaseId(loadActiveScenario().id);
    void loadSelectableScenarios().then(setPickerCases);
    setPickerOpen(true);
  };

  /** Playable cases in the catalog: Jordan + ScenarioV2 cases (old V1 rows can't run). */
  const playableCases = useMemo(
    () =>
      scenarios.flatMap((row) => {
        if (row.id === "jordan-lee-mvp") return [{ row, scenario: JORDAN_SCENARIO_V2 }];
        return isPlayableScenario(row.scenario_json)
          ? [{ row, scenario: { ...row.scenario_json, cloudId: row.id } }]
          : [];
      }),
    [scenarios],
  );

  const stats = useMemo(() => {
    let totalRuns = 0;
    let totalRewinds = 0;
    let passedRuns = 0;
    let scoreSum = 0;
    let scoreCount = 0;

    for (const s of sessions) {
      for (const b of s.encounter_branches ?? []) {
        totalRuns += 1;
        if (b.parent_checkpoint_id) totalRewinds += 1;
        if (b.outcome_code === "risk_identified") passedRuns += 1;
        for (const r of b.rubric_scores ?? []) {
          scoreSum += r.score;
          scoreCount += 1;
        }
      }
    }

    const avgRubric =
      scoreCount > 0 ? (scoreSum / scoreCount).toFixed(1) : "—";
    return { totalRuns, totalRewinds, passedRuns, avgRubric };
  }, [sessions]);

  const isSignedIn = Boolean(authedEmail);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        {!configured && (
          <section className="rounded-2xl border border-warn-line bg-warn-bg px-5 py-4 text-sm text-warn-fg">
            <div className="font-semibold text-warn">
              Supabase connection pending environment variables
            </div>
            <p className="mt-1 leading-relaxed">
              Run <code className="font-mono text-xs">supabase/schema.sql</code>{" "}
              in your Supabase SQL Editor, then add{" "}
              <code className="font-mono text-xs">
                NEXT_PUBLIC_SUPABASE_URL
              </code>{" "}
              and{" "}
              <code className="font-mono text-xs">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{" "}
              to <code className="font-mono text-xs">.env.local</code> and your
              Vercel project settings. Guest / Demo mode still works right now!
            </p>
          </section>
        )}

        {feedbackMsg && (
          <div
            className={`rounded-2xl border px-5 py-3.5 text-sm ${
              feedbackMsg.tone === "ok"
                ? "border-ok-line bg-ok-bg text-ok-fg"
                : feedbackMsg.tone === "bad"
                  ? "border-bad-line bg-bad-bg text-bad-fg"
                  : "border-line-2 bg-panel-2 text-fg"
            }`}
          >
            {feedbackMsg.text}
          </div>
        )}

        {isLoadingSession ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="h-80 animate-pulse rounded-[20px] bg-panel" />
            <div className="h-80 animate-pulse rounded-[20px] bg-panel" />
          </div>
        ) : !isSignedIn ? (
          /* ================= SIGNED-OUT LOGIN / REGISTER VIEW ================= */
          <div className="flex flex-wrap items-start gap-8">
            <section className="flex min-w-0 flex-[999_1_460px] flex-col gap-6 rounded-[20px] border border-line bg-panel p-6 sm:p-8">
              <div>
                <div className="font-mono text-xs tracking-widest text-info">
                  LEARNER &amp; INSTRUCTOR PORTAL · SECURED BY AUTH0
                </div>
                <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
                  Sign in to MedMimic
                </h1>
                <p className="mt-1.5 text-sm text-muted">
                  Save encounter transcripts, decision checkpoints, rubric
                  scores, and patient cases across devices.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {/* Plain <a>: Auth0 routes must not be prefetched */}
                <a
                  href="/auth/login?returnTo=/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-ok px-5 font-bold text-[#062012] hover:brightness-110"
                >
                  Sign in with Auth0
                </a>
                <a
                  href="/auth/login?screen_hint=signup&returnTo=/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line-2 px-5 font-semibold text-fg hover:bg-chip"
                >
                  Create a learner account
                </a>
                <p className="text-xs leading-relaxed text-muted">
                  Google, passwordless email code, or email + password. Instructor
                  accounts are assigned by the course team and require MFA.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
                <span className="text-muted">
                  Just testing or judging the demo?
                </span>
                <Link
                  href="/briefing"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line-2 px-4 text-xs font-semibold text-fg hover:bg-chip"
                >
                  Continue as Guest →
                </Link>
              </div>
            </section>

            {/* Right Sidebar: Database Architecture & Capabilities */}
            <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
              <h2 className="font-display text-xl font-semibold">
                What syncing unlocks
              </h2>
              {[
                {
                  title: "Longitudinal OSCE Tracking",
                  body: "Every encounter run, trust curve, unlocked disclosure, and rubric score (Rapport, Mood History, Risk Assessment, Safe Disposition) is stored per learner.",
                },
                {
                  title: "Branch & Rewind Persistence",
                  body: "Reopen any past Run 1 vs. Rewound Run 2 comparison or RAG-cited debrief directly from your history without re-running Gemini calls.",
                },
                {
                  title: "Multi-Patient & AI Case Library",
                  body: "Built on a scenario-agnostic PostgreSQL schema ready for curated and Gemini-generated standardized patients across specialties.",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-2xl border border-line bg-panel p-5"
                >
                  <div className="font-semibold text-fg">{card.title}</div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {card.body}
                  </p>
                </div>
              ))}
            </aside>
          </div>
        ) : (
          /* ================= SIGNED-IN LEARNER DASHBOARD ================= */
          <div className="flex flex-col gap-8">
            {/* Profile Banner */}
            <section className="flex flex-wrap items-center justify-between gap-5 rounded-[20px] border border-line bg-panel p-6 sm:p-7">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ok text-xl font-bold text-[#062012]">
                  {(profile?.display_name || authedEmail || "L")
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div>
                  <h1 className="font-display text-2xl font-bold">
                    {profile?.display_name || authedEmail}
                  </h1>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{authedEmail}</span>
                    {(isInstructor || profile?.training_role) && (
                      <>
                        <span>·</span>
                        <span className="rounded-full bg-chip px-2.5 py-0.5 font-semibold text-fg-2">
                          {isInstructor
                            ? ROLE_LABELS.instructor
                            : profile?.training_role
                              ? (ROLE_LABELS[profile.training_role] ??
                                profile.training_role)
                              : null}
                        </span>
                      </>
                    )}
                    {profile?.institution && (
                      <>
                        <span>·</span>
                        <span>{profile.institution}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  href="/briefing"
                  className="inline-flex min-h-11 items-center rounded-xl bg-ok px-5 text-sm font-bold text-[#062012] hover:brightness-110"
                >
                  Start / Resume Encounter →
                </Link>
                <a
                  href="/auth/logout"
                  onClick={clearLearnerLocalData}
                  className="inline-flex min-h-11 items-center rounded-xl border border-line-2 px-4 text-sm font-semibold text-muted hover:bg-chip hover:text-fg"
                >
                  Sign Out
                </a>
              </div>
            </section>

            {/* Summary Metrics */}
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                {
                  label: "Total Runs Saved",
                  value: String(stats.totalRuns),
                  tone: "text-fg",
                },
                {
                  label: "Decision Rewinds",
                  value: String(stats.totalRewinds),
                  tone: "text-info",
                },
                {
                  label: "Risks Identified",
                  value: String(stats.passedRuns),
                  tone: "text-ok",
                },
                {
                  label: "Avg Rubric Score",
                  value:
                    stats.avgRubric === "—" ? "—" : `${stats.avgRubric}/10`,
                  tone: "text-warn",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-line bg-panel px-5 py-4"
                >
                  <div className="text-xs text-muted">{stat.label}</div>
                  <div
                    className={`mt-1 font-mono text-2xl font-bold ${stat.tone}`}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </section>

            {/* Saved Encounter History */}
            <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-panel p-6 sm:p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[13px] font-semibold tracking-widest text-muted">
                  SAVED ENCOUNTER SESSIONS
                </h2>
                <span className="text-xs text-faint">
                  Synced with Supabase PostgreSQL
                </span>
              </div>

              {sessions.length === 0 ? (
                <div className="rounded-2xl border border-line bg-ink px-6 py-10 text-center">
                  <p className="text-sm text-muted">
                    No completed encounter runs saved yet. Complete an interview
                    and click{" "}
                    <strong className="text-fg">End Encounter</strong> to sync
                    your first run!
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {sessions.map((s) => {
                    const branches = s.encounter_branches ?? [];
                    const latest = branches[branches.length - 1];
                    const pill = s.best_outcome_code
                      ? OUTCOME_PILL[s.best_outcome_code]
                      : null;

                    return (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-ink px-5 py-4"
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-fg">
                              {s.scenarios?.patient_name ?? "Jordan Lee"},{" "}
                              {s.scenarios?.patient_age ?? 34}
                            </span>
                            <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] text-muted capitalize">
                              {s.scenarios?.specialty ?? "psychiatry"}
                            </span>
                            {pill && (
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${pill.classes}`}
                              >
                                {pill.label}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted">
                            {branches.length} run
                            {branches.length === 1 ? "" : "s"} (
                            {s.rewind_count} rewind
                            {s.rewind_count === 1 ? "" : "s"})
                            {latest && (
                              <>
                                {" "}
                                · Final trust {latest.final_trust}% ·
                                Disclosures{" "}
                                {latest.unlocked_disclosures?.length ?? 0}
                              </>
                            )}{" "}
                            · {new Date(s.updated_at).toLocaleString()}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {branches.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenSavedSession(s, "/debrief")
                              }
                              className="rounded-xl border border-line-2 px-3.5 py-2 text-xs font-semibold text-fg hover:bg-chip cursor-pointer"
                            >
                              Open Debrief →
                            </button>
                          )}
                          {branches.length >= 2 && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenSavedSession(s, "/compare")
                              }
                              className="rounded-xl bg-ok px-3.5 py-2 text-xs font-bold text-[#062012] hover:brightness-110 cursor-pointer"
                            >
                              Compare Runs →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Case catalog (playable) + instructor case creation */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="flex flex-col gap-4 rounded-[20px] border border-line bg-panel p-6 lg:col-span-7">
                <div className="text-[13px] font-semibold tracking-widest text-muted">
                  CASES FOR YOUR CLASS ({playableCases.length})
                </div>
                <div className="flex flex-col gap-3">
                  {playableCases.map(({ row, scenario }) => (
                    <div
                      key={row.id}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-ink px-4 py-3.5"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-fg">
                            {scenario.patient.name}, {scenario.patient.age}
                          </span>
                          <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] text-muted">
                            {scenario.title}
                          </span>
                          {row.is_ai_generated && (
                            <span className="rounded-full bg-cite-bg px-2 py-0.5 text-[11px] font-semibold text-cite">
                              AI Generated
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs italic text-fg-2">
                          &ldquo;{scenario.patient.opening}&rdquo;
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => practiceCase(scenario)}
                        className="shrink-0 rounded-lg bg-ok px-3 py-1.5 text-xs font-bold text-[#062012] hover:brightness-110 cursor-pointer"
                      >
                        Practice →
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {isInstructor ? (
                <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-panel p-6 lg:col-span-5">
                  <div className="font-mono text-xs tracking-widest text-cite">INSTRUCTOR · AUTH0 RBAC</div>
                  <h2 className="font-display text-xl font-semibold">Create a case with Gemini</h2>
                  <p className="text-sm leading-relaxed text-muted">
                    Pick a temperament and presentation; Gemini writes the history, hidden
                    disclosures, voice and avatar. Every case you create is shared with your
                    class right away.
                  </p>
                  <button
                    type="button"
                    onClick={openCasePicker}
                    className="inline-flex min-h-11 w-fit items-center rounded-xl bg-ok px-5 text-sm font-bold text-[#062012] hover:brightness-110 cursor-pointer"
                  >
                    ✨ Create a patient
                  </button>
                </section>
              ) : (
                <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-panel p-6 lg:col-span-5">
                  <div className="font-mono text-xs tracking-widest text-cite">INSTRUCTOR ONLY · AUTH0 RBAC</div>
                  <h2 className="font-display text-xl font-semibold">AI case generator</h2>
                  <p className="text-sm leading-relaxed text-muted">
                    Generating new patient cases with Gemini is limited to instructors, so every case
                    learners see has been reviewed. Ask your course team for the instructor role.
                  </p>
                </section>
              )}
            </section>

            <GeneratePatientModal
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              activeScenarioId={activeCaseId}
              savedScenarios={pickerCases}
              onSelectScenario={practiceCase}
              onGeneratedScenario={(created) => {
                setFeedbackMsg({
                  tone: "ok",
                  text: created.cloudId
                    ? `${created.patient.name} is ready and shared with your class.`
                    : `${created.patient.name} is ready (saved on this device only).`,
                });
                void refreshDashboard(false);
                practiceCase(created);
              }}
            />
          </div>
        )}
      </main>

      <SafetyFooter />
    </div>
  );
}
