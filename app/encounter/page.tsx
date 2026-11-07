"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createCheckpoint, finalizeBranch } from "../../lib/checkpoints";
import {
  applyStudentAction,
  createInitialEngineState,
  DEMO_CHECKPOINT_ID,
  DISCLOSURE_LABELS,
  ENGINE_EVENTS,
  evaluateOutcome,
  getEncounterHints,
  JORDAN_SCENARIO,
  setStudentRisk,
  type EncounterOutcome,
} from "../../lib/engine";
import type {
  ActionId,
  Branch,
  Checkpoint,
  EngineState,
  Message,
  RiskLevel,
  TimelineEvent,
  TurnLabel,
} from "../../lib/types";
import { PatientPortrait } from "./PatientPortrait";
import {
  clearActiveSession,
  loadActiveSession,
  loadCheckpoints,
  loadCompletedBranches,
  resetAllEncounterStorage,
  saveActiveSession,
  saveCheckpointItem,
  saveCompletedBranch,
} from "./storage";
import { useGeminiLive } from "./useGeminiLive";

const ACTION_OPTIONS: ReadonlyArray<{
  id: ActionId;
  label: string;
  subtitle: string;
  tone: "neutral" | "safe" | "caution";
}> = [
  {
    id: "phq9",
    label: "Administer PHQ-9",
    subtitle: "Standardized 9-item depression severity screen",
    tone: "neutral",
  },
  {
    id: "cssrs",
    label: "Run C-SSRS Screener",
    subtitle: "Columbia-Suicide Severity Rating Scale",
    tone: "neutral",
  },
  {
    id: "safety_plan",
    label: "Complete Safety Plan",
    subtitle: "Stanley-Brown collaborative crisis & lethal-means plan",
    tone: "safe",
  },
  {
    id: "consult",
    label: "Urgent Psychiatric Consult",
    subtitle: "Same-day psychiatric evaluation & warm handoff",
    tone: "safe",
  },
  {
    id: "sleep_aid",
    label: "Recommend sleep aid",
    subtitle: "Discharge home with sleep medication recommendation",
    tone: "caution",
  },
];

const ACTION_TITLES: Record<ActionId, string> = {
  phq9: "PHQ-9 Administered",
  cssrs: "C-SSRS Screener Logged",
  safety_plan: "Safety Plan Completed",
  consult: "Urgent Psych Consult Ordered",
  sleep_aid: "Recommended Sleep Aid",
};

const LABEL_DISPLAY: Record<TurnLabel, string> = {
  asked_mood: "Asked mood",
  asked_onset: "Asked onset",
  asked_hope: "Asked hope/future",
  asked_SI_directly: "Asked suicide directly",
  asked_plan: "Asked plan/means",
  asked_support: "Asked support",
  reflection: "Reflection",
  empathy: "Empathy",
  premature_reassurance: "Premature reassurance",
  dismissive: "Dismissive",
  closed_rapid: "Rapid closed Qs",
  other: "General turn",
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface TurnApiResponse {
  ok: boolean;
  error?: string;
  labels: TurnLabel[];
  trustDelta: number;
  newlyUnlocked: string[];
  newlyFiredEvents: string[];
  state: EngineState;
  timeline: TimelineEvent[];
  messages: Message[];
  patientReply?: string;
  patientPrompt: string;
  shouldSaveCheckpoint?: { id: string; reason: string };
  checkpoint?: Checkpoint;
  outcome: EncounterOutcome;
}

interface RewindApiResponse {
  ok: boolean;
  error?: string;
  completedBranch?: Branch;
  completedOutcome?: EncounterOutcome;
  restored: {
    branchId: string;
    parentCheckpoint: string;
    engineState: EngineState;
    messages: Message[];
    timeline: TimelineEvent[];
  };
  patientPrompt: string;
}

function createDefaultMessages(): Message[] {
  return [{ role: "patient", text: JORDAN_SCENARIO.patient.opening, t: 0 }];
}

function EncounterWorkspace() {
  const searchParams = useSearchParams();
  const rewindParam = searchParams.get("rewind");

  const [branchId, setBranchId] = useState<string>("run-1");
  const [parentCheckpoint, setParentCheckpoint] = useState<string | undefined>(
    undefined,
  );
  const [engineState, setEngineState] = useState<EngineState>(() =>
    createInitialEngineState(),
  );
  const [messages, setMessages] = useState<Message[]>(() =>
    createDefaultMessages(),
  );
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [completedBranches, setCompletedBranches] = useState<Branch[]>([]);

  const [inputText, setInputText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hintsEnabled, setHintsEnabled] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [showContentNote, setShowContentNote] = useState(true);
  const [voiceStreamingReply, setVoiceStreamingReply] = useState("");
  const [textSpeechPulse, setTextSpeechPulse] = useState(false);
  const [lastTurnFeedback, setLastTurnFeedback] = useState<{
    labels: TurnLabel[];
    trustDelta: number;
    newlyUnlocked: string[];
  } | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [endedSummary, setEndedSummary] = useState<{
    branch: Branch;
    outcome: EncounterOutcome;
  } | null>(null);

  // Refs for latest state inside Live API async callbacks
  const stateRef = useRef(engineState);
  const messagesRef = useRef(messages);
  const timelineRef = useRef(timeline);
  const elapsedRef = useRef(engineState.elapsedSec);
  const pendingVoiceCheckpointRef = useRef<string | null>(null);
  const pendingVoiceUnlockFollowupRef = useRef<{
    unlocked: string[];
    patientPrompt: string;
  } | null>(null);
  const followupSentRef = useRef<boolean>(false);

  useEffect(() => {
    stateRef.current = engineState;
    elapsedRef.current = engineState.elapsedSec;
  }, [engineState]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

  // Hydrate persisted session/checkpoints/branches on mount (and honor ?rewind=...)
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const savedCheckpoints = loadCheckpoints();
    const savedBranches = loadCompletedBranches();
    const savedActive = loadActiveSession();

    const targetCheckpoint = rewindParam
      ? savedCheckpoints.find((cp) => cp.id === rewindParam) ??
        savedCheckpoints[savedCheckpoints.length - 1]
      : undefined;

    if (targetCheckpoint) {
      const baseTimeline =
        savedBranches[savedBranches.length - 1]?.timeline ??
        savedActive?.timeline ??
        [];
      const nextId = `run-${savedBranches.length + 1}`;
      queueMicrotask(() => {
        setCheckpoints(savedCheckpoints);
        setCompletedBranches(savedBranches);
        setBranchId(nextId);
        setParentCheckpoint(targetCheckpoint.id);
        setEngineState({
          ...targetCheckpoint.engineState,
          unlocked: [...targetCheckpoint.engineState.unlocked],
          firedEvents: [...targetCheckpoint.engineState.firedEvents],
          actions: [...targetCheckpoint.engineState.actions],
        });
        setMessages(targetCheckpoint.messages.map((m) => ({ ...m })));
        setTimeline(
          baseTimeline
            .slice(0, targetCheckpoint.timelineIndex)
            .map((e) => ({ ...e })),
        );
      });
      return;
    }

    queueMicrotask(() => {
      if (savedCheckpoints.length > 0) setCheckpoints(savedCheckpoints);
      if (savedBranches.length > 0) setCompletedBranches(savedBranches);
      if (savedActive) {
        setBranchId(savedActive.branchId);
        setParentCheckpoint(savedActive.parentCheckpoint);
        setEngineState(savedActive.state);
        setMessages(savedActive.messages);
        setTimeline(savedActive.timeline);
      }
    });
  }, [rewindParam]);

  // Persist active session on updates
  useEffect(() => {
    if (!hydratedRef.current || endedSummary) return;
    saveActiveSession({
      branchId,
      parentCheckpoint,
      state: engineState,
      messages,
      timeline,
      updatedAt: Date.now(),
    });
  }, [branchId, parentCheckpoint, engineState, messages, timeline, endedSummary]);

  // Elapsed encounter timer (1s tick while encounter is open)
  useEffect(() => {
    if (endedSummary) return;
    const timer = window.setInterval(() => {
      setEngineState((prev) => ({
        ...prev,
        elapsedSec: prev.elapsedSec + 1,
      }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [endedSummary]);

  // Auto-scroll chat feed
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, voiceStreamingReply, isSubmitting]);

  // Close Actions menu when clicking outside
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!actionsMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        actionsMenuRef.current &&
        !actionsMenuRef.current.contains(e.target as Node)
      ) {
        setActionsMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [actionsMenuOpen]);

  // Live API callbacks
  const liveRef = useRef<ReturnType<typeof useGeminiLive> | null>(null);

  const handleLiveStudentTranscript = useCallback(async (transcript: string) => {
    const clean = transcript.trim();
    if (!clean) return;

    const studentMsg: Message = {
      role: "student",
      text: clean,
      t: elapsedRef.current,
    };
    const prevMessages = messagesRef.current;
    setMessages((curr) => [...curr, studentMsg]);

    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "voice",
          studentText: clean,
          state: stateRef.current,
          messages: prevMessages,
          timeline: timelineRef.current,
          elapsedSec: elapsedRef.current,
        }),
      });
      const data = (await res.json()) as TurnApiResponse;
      if (!data.ok) return;

      setEngineState(data.state);
      setTimeline(data.timeline);
      setLastTurnFeedback({
        labels: data.labels,
        trustDelta: data.trustDelta,
        newlyUnlocked: data.newlyUnlocked,
      });

      if (data.shouldSaveCheckpoint) {
        pendingVoiceCheckpointRef.current = data.shouldSaveCheckpoint.id;
      }

      liveRef.current?.injectEngineStatePrompt(data.patientPrompt);

      if (
        data.newlyUnlocked.includes("suicidal_thoughts") ||
        data.newlyUnlocked.includes("low_mood") ||
        data.newlyUnlocked.includes("plan_and_means")
      ) {
        pendingVoiceUnlockFollowupRef.current = {
          unlocked: data.newlyUnlocked,
          patientPrompt: data.patientPrompt,
        };
        followupSentRef.current = false;
      }
    } catch {
      // Keep voice conversation flowing even if background classification hiccups
    }
  }, []);

  const handleLivePatientComplete = useCallback((finalTranscript: string) => {
    setVoiceStreamingReply("");
    if (!finalTranscript) return;

    const patientMsg: Message = {
      role: "patient",
      text: finalTranscript,
      t: elapsedRef.current,
    };

    const nextMsgs = [...messagesRef.current, patientMsg];
    messagesRef.current = nextMsgs;
    setMessages(nextMsgs);

    // Check if a spoken race condition caused Jordan to deflect right before a critical disclosure unlocked
    const pendingUnlock = pendingVoiceUnlockFollowupRef.current;
    if (pendingUnlock && !followupSentRef.current) {
      const missedSI =
        pendingUnlock.unlocked.includes("suicidal_thoughts") &&
        /^(no\b|nope|nothing like that)/i.test(finalTranscript.trim());
      const missedHeavy =
        pendingUnlock.unlocked.includes("low_mood") &&
        !/\bheavy\b/i.test(finalTranscript);

      if (missedSI) {
        followupSentRef.current = true;
        pendingVoiceUnlockFollowupRef.current = null;
        liveRef.current?.triggerUnlockedFollowup(
          pendingUnlock.patientPrompt,
          'Pause for a beat, then quietly admit what you were holding back—starting naturally like "Actually… wait. I haven\'t told anyone that…"',
        );
        return;
      }
      if (missedHeavy) {
        followupSentRef.current = true;
        pendingVoiceUnlockFollowupRef.current = null;
        liveRef.current?.triggerUnlockedFollowup(
          pendingUnlock.patientPrompt,
          'Add one quiet sentence capturing how your mood feels using the exact word "heavy", e.g., "Everything\'s just… heavy."',
        );
        return;
      }
      pendingVoiceUnlockFollowupRef.current = null;
    }

    // Save voice-mode checkpoint once Jordan's "heavy" turn lands in messages[]
    const shouldSaveId =
      pendingVoiceCheckpointRef.current ??
      (/\bheavy\b/i.test(finalTranscript) ? DEMO_CHECKPOINT_ID : null);

    if (shouldSaveId) {
      pendingVoiceCheckpointRef.current = null;
      const cp = createCheckpoint(
        shouldSaveId,
        stateRef.current,
        nextMsgs,
        timelineRef.current.length,
      );
      const updated = saveCheckpointItem(cp);
      setCheckpoints(updated);
    }
  }, []);

  const live = useGeminiLive({
    onStudentTranscriptFinal: handleLiveStudentTranscript,
    onPatientTranscriptUpdate: (partial) => setVoiceStreamingReply(partial),
    onPatientTurnComplete: handleLivePatientComplete,
  });

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  // Brief portrait animation pulse when a text-mode reply arrives
  const triggerBriefTextPulse = useCallback(() => {
    setTextSpeechPulse(true);
    window.setTimeout(() => setTextSpeechPulse(false), 1800);
  }, []);

  const submitStudentMessage = useCallback(
    async (rawText?: string) => {
      const text = (rawText ?? inputText).trim();
      if (!text || isSubmitting) return;

      setInputText("");
      setUiError(null);
      setIsSubmitting(true);

      const optimisticStudentMsg: Message = {
        role: "student",
        text,
        t: engineState.elapsedSec,
      };
      const priorMessages = messages;
      setMessages((curr) => [...curr, optimisticStudentMsg]);

      const useVoiceOutput = live.status === "connected";

      try {
        const res = await fetch("/api/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: useVoiceOutput ? "voice" : "text",
            studentText: text,
            state: engineState,
            messages: priorMessages,
            timeline,
            elapsedSec: engineState.elapsedSec,
          }),
        });

        const data = (await res.json()) as TurnApiResponse;
        if (!data.ok) {
          throw new Error(data.error ?? "Failed to process turn");
        }

        setEngineState(data.state);
        setTimeline(data.timeline);
        setLastTurnFeedback({
          labels: data.labels,
          trustDelta: data.trustDelta,
          newlyUnlocked: data.newlyUnlocked,
        });

        if (useVoiceOutput) {
          if (data.shouldSaveCheckpoint) {
            pendingVoiceCheckpointRef.current = data.shouldSaveCheckpoint.id;
          }
          const sentToLive = live.sendTextForVoiceReply(
            data.patientPrompt,
            text,
          );
          if (!sentToLive) {
            throw new Error("Live session disconnected; switch to Text Mode or reconnect.");
          }
        } else {
          setMessages(data.messages);
          triggerBriefTextPulse();

          if (data.checkpoint) {
            const updatedCps = saveCheckpointItem(data.checkpoint);
            setCheckpoints(updatedCps);
          }
        }
      } catch (err) {
        setUiError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      engineState,
      inputText,
      isSubmitting,
      live,
      messages,
      timeline,
      triggerBriefTextPulse,
    ],
  );

  const handleSelectRisk = useCallback(
    (risk: RiskLevel) => {
      const updated = setStudentRisk(engineState, risk);
      setEngineState(updated);
    },
    [engineState],
  );

  const handleSelectAction = useCallback(
    (action: ActionId) => {
      setActionsMenuOpen(false);
      const result = applyStudentAction(
        engineState,
        timeline,
        action,
        engineState.elapsedSec,
      );
      setEngineState(result.state);
      setTimeline(result.timeline);
    },
    [engineState, timeline],
  );

  const handleManualCheckpoint = useCallback(() => {
    const id =
      checkpoints.some((c) => c.id === DEMO_CHECKPOINT_ID)
        ? `cp-${formatDuration(engineState.elapsedSec).replace(":", "m")}s`
        : DEMO_CHECKPOINT_ID;
    const cp = createCheckpoint(id, engineState, messages, timeline.length);
    const updated = saveCheckpointItem(cp);
    setCheckpoints(updated);
  }, [checkpoints, engineState, messages, timeline.length]);

  const handleRewind = useCallback(
    async (checkpointToRestore?: Checkpoint) => {
      const target =
        checkpointToRestore ??
        checkpoints.find((c) => c.id === DEMO_CHECKPOINT_ID) ??
        checkpoints[checkpoints.length - 1];

      if (!target) return;

      const wasLiveConnected = live.status === "connected";
      if (wasLiveConnected) {
        live.disconnect();
      }

      setUiError(null);
      setEndedSummary(null);

      try {
        const nextRunNumber = completedBranches.length + 2;
        const res = await fetch("/api/rewind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkpoint: target,
            currentBranch: {
              id: branchId,
              parentCheckpoint,
              engineState,
              messages,
              timeline,
            },
            nextBranchId: `run-${nextRunNumber}`,
          }),
        });

        const data = (await res.json()) as RewindApiResponse;
        if (!data.ok) {
          throw new Error(data.error ?? "Failed to rewind checkpoint");
        }

        if (data.completedBranch) {
          const allBranches = saveCompletedBranch(data.completedBranch);
          setCompletedBranches(allBranches);
        }

        setBranchId(data.restored.branchId);
        setParentCheckpoint(data.restored.parentCheckpoint);
        setEngineState(data.restored.engineState);
        setMessages(data.restored.messages);
        setTimeline(data.restored.timeline);
        setLastTurnFeedback(null);
        setVoiceStreamingReply("");

        // Open a brand-new Live session seeded with the restored conversation if Live was active
        if (wasLiveConnected) {
          await live.connect(
            data.restored.engineState,
            data.restored.messages,
          );
        }
      } catch (err) {
        setUiError(err instanceof Error ? err.message : String(err));
      }
    },
    [
      branchId,
      checkpoints,
      completedBranches.length,
      engineState,
      live,
      messages,
      parentCheckpoint,
      timeline,
    ],
  );

  const handleEndEncounter = useCallback(() => {
    if (live.status === "connected") {
      live.disconnect();
    }
    const branch = finalizeBranch({
      id: branchId,
      parentCheckpoint,
      engineState,
      messages,
      timeline,
    });
    const outcome = evaluateOutcome(branch.finalState, branch.timeline);
    const updatedBranches = saveCompletedBranch(branch);
    clearActiveSession();
    setCompletedBranches(updatedBranches);
    setEndedSummary({ branch, outcome });
  }, [branchId, engineState, live, messages, parentCheckpoint, timeline]);

  const handleResetSimulation = useCallback(() => {
    live.disconnect();
    resetAllEncounterStorage();
    setBranchId("run-1");
    setParentCheckpoint(undefined);
    setEngineState(createInitialEngineState());
    setMessages(createDefaultMessages());
    setTimeline([]);
    setCheckpoints([]);
    setCompletedBranches([]);
    setLastTurnFeedback(null);
    setEndedSummary(null);
    setUiError(null);
  }, [live]);

  const hints = useMemo(() => getEncounterHints(engineState), [engineState]);
  const primaryCheckpoint =
    checkpoints.find((c) => c.id === DEMO_CHECKPOINT_ID) ??
    checkpoints[checkpoints.length - 1];

  const trustBarColor =
    engineState.trust < 35
      ? "bg-rose-500"
      : engineState.trust < 60
        ? "bg-amber-400"
        : "bg-emerald-400";

  const trustStatusLabel =
    engineState.trust < 35
      ? "Shut Down (<35%)"
      : engineState.trust < 60
        ? "Guarded"
        : "Open Rapport";

  // Find message index where checkpoint was saved so we can show an inline timeline marker
  const checkpointMsgCount = primaryCheckpoint?.messages.length;

  return (
    <div className="flex min-h-screen flex-col bg-[#0B1220] text-[#E6EDF7]">
      {/* Top Clinical Workstation Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B1220]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/briefing"
              className="text-lg font-bold tracking-tight text-[#E6EDF7] hover:text-sky-300 transition-colors"
            >
              MedMimic
            </Link>
            <span className="hidden sm:inline-flex items-center rounded-full border border-amber-400/30 bg-amber-950/40 px-2.5 py-0.5 text-[11px] font-medium text-amber-200">
              For education only · Not for clinical decision-making
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#131E35] px-2.5 py-0.5 text-xs font-mono text-[#9AA8BF]">
              <span>{branchId.toUpperCase()}</span>
              {parentCheckpoint && (
                <span className="text-sky-300">· Rewound</span>
              )}
              <span>· {formatDuration(engineState.elapsedSec)}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Gemini Live Voice Toggle */}
            {live.status === "connected" ? (
              <button
                type="button"
                onClick={() => live.disconnect()}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/60 transition-colors cursor-pointer"
                title="Click to switch back to Text Mode"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Live · Gemini
              </button>
            ) : (
              <button
                type="button"
                disabled={live.status === "connecting"}
                onClick={() => void live.connect(engineState, messages)}
                className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-[#13203B] px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-[#192B4E] disabled:opacity-50 transition-colors cursor-pointer"
              >
                <span className="h-2 w-2 rounded-full bg-sky-400/70" />
                {live.status === "connecting"
                  ? "Connecting Live · Gemini…"
                  : "Enable Live · Gemini"}
              </button>
            )}

            {/* Checkpoint & Rewind Controls */}
            {primaryCheckpoint ? (
              <button
                type="button"
                onClick={() => void handleRewind(primaryCheckpoint)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-400/50 bg-violet-950/60 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-900/70 transition-colors cursor-pointer"
                title="Save current run and rewind to checkpoint"
              >
                <span>↺</span>
                <span>Rewind to Checkpoint</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleManualCheckpoint}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#111A2E] px-2.5 py-1.5 text-xs text-[#9AA8BF] hover:border-white/25 hover:text-[#E6EDF7] transition-colors cursor-pointer"
                title="Manually mark a decision checkpoint"
              >
                <span>⚑</span>
                <span>Mark Checkpoint</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleEndEncounter}
              className="rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer"
            >
              End Encounter →
            </button>
          </div>
        </div>
      </header>

      {/* Main 3-Column Clinical Workspace */}
      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-12">
        {/* LEFT COLUMN: Portrait, Trust Meter & Disclosure Tracker */}
        <section className="flex flex-col gap-4 lg:col-span-3">
          <PatientPortrait
            emotion={engineState.emotion}
            isSpeaking={live.isSpeaking || textSpeechPulse}
            audioLevel={live.isSpeaking ? live.audioLevel : textSpeechPulse ? 0.45 : 0}
          />

          {/* Trust Meter Card */}
          <div className="rounded-2xl border border-white/10 bg-[#111A2E] p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wider text-[#9AA8BF]">
                Patient Trust
              </span>
              <span
                className={`font-mono font-semibold ${
                  engineState.trust < 35
                    ? "text-rose-300"
                    : engineState.trust < 60
                      ? "text-amber-200"
                      : "text-emerald-300"
                }`}
              >
                {engineState.trust}% · {trustStatusLabel}
              </span>
            </div>

            <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-[#0B1220] border border-white/5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${trustBarColor}`}
                style={{ width: `${engineState.trust}%` }}
              />
            </div>

            {lastTurnFeedback && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {lastTurnFeedback.trustDelta !== 0 && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                      lastTurnFeedback.trustDelta > 0
                        ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700/50"
                        : "bg-rose-950/80 text-rose-300 border border-rose-700/50"
                    }`}
                  >
                    {lastTurnFeedback.trustDelta > 0
                      ? `+${lastTurnFeedback.trustDelta}`
                      : lastTurnFeedback.trustDelta}
                  </span>
                )}
                {lastTurnFeedback.labels.map((lbl) => (
                  <span
                    key={lbl}
                    className="rounded-md border border-white/10 bg-[#17233D] px-2 py-0.5 text-[11px] text-[#C8D4E8]"
                  >
                    {LABEL_DISPLAY[lbl] ?? lbl}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Disclosure Tracker (locked items strictly show "??? · locked") */}
          <div className="flex-1 rounded-2xl border border-white/10 bg-[#111A2E] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9AA8BF]">
                Clinical Disclosures
              </h2>
              <span className="font-mono text-xs text-sky-300">
                {engineState.unlocked.length} / {JORDAN_SCENARIO.disclosures.length}
              </span>
            </div>

            <ul className="mt-3 space-y-2">
              {JORDAN_SCENARIO.disclosures.map((d) => {
                const isUnlocked = engineState.unlocked.includes(d.id);
                const isJustUnlocked =
                  lastTurnFeedback?.newlyUnlocked.includes(d.id) ?? false;

                return (
                  <li
                    key={d.id}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs transition-all duration-300 ${
                      isUnlocked
                        ? isJustUnlocked
                          ? "border-emerald-400/60 bg-emerald-950/40 text-emerald-100"
                          : "border-sky-400/25 bg-[#16233E] text-[#E6EDF7]"
                        : "border-white/5 bg-[#0D1526]/70 text-[#697892]"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        isUnlocked
                          ? "bg-emerald-500/25 text-emerald-300"
                          : "bg-white/5 text-[#697892]"
                      }`}
                    >
                      {isUnlocked ? "✓" : "?"}
                    </span>
                    <span className="truncate font-medium">
                      {isUnlocked
                        ? DISCLOSURE_LABELS[d.id] ?? d.id
                        : "??? · locked"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* CENTER COLUMN: Conversation Feed, Hints Toggle & Voice/Text Input */}
        <section className="flex flex-col rounded-2xl border border-white/10 bg-[#111A2E] lg:col-span-6 overflow-hidden min-h-[540px]">
          {/* Dismissible Simulation Content Note */}
          {showContentNote && (
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#16233D] px-4 py-2 text-xs text-[#B8C7E0]">
              <span>
                <strong className="text-sky-300">Content note:</strong> Fictional
                psychiatric interview depicting depression &amp; suicidal ideation.
              </span>
              <button
                type="button"
                onClick={() => setShowContentNote(false)}
                className="shrink-0 text-[#8593AA] hover:text-white cursor-pointer"
                aria-label="Dismiss content note"
              >
                ✕
              </button>
            </div>
          )}

          {/* Engine Event Alert Strip */}
          {engineState.firedEvents.includes(ENGINE_EVENTS.SHUTDOWN) &&
            engineState.trust < 35 && (
              <div className="border-b border-rose-500/30 bg-rose-950/50 px-4 py-2 text-xs text-rose-200">
                ⚠ <strong>Patient shutting down:</strong> Trust fell below 35%.
                Jordan has become guarded and flat—consider empathetic reflection
                or rewinding to your checkpoint.
              </div>
            )}

          {/* Messages Scroll Area */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4 max-h-[56vh] lg:max-h-[60vh]">
            {messages.map((msg, idx) => {
              const isStudent = msg.role === "student";
              const showCheckpointBannerAfter =
                checkpointMsgCount !== undefined && idx + 1 === checkpointMsgCount;

              return (
                <div key={`${msg.role}-${idx}-${msg.t}`} className="space-y-3">
                  <div
                    className={`flex flex-col ${
                      isStudent ? "items-end" : "items-start"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 px-1 text-[11px] text-[#8593AA]">
                      <span className="font-medium">
                        {isStudent ? "You (Clinician)" : "Jordan Lee"}
                      </span>
                      <span className="font-mono">{formatDuration(msg.t)}</span>
                    </div>
                    <div
                      className={`max-w-[86%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        isStudent
                          ? "bg-sky-500 text-slate-950 font-medium rounded-br-sm"
                          : "bg-[#182642] text-[#E6EDF7] border border-white/10 rounded-bl-sm"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>

                  {showCheckpointBannerAfter && (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-violet-400/35 bg-violet-950/35 px-3 py-2 text-xs text-violet-200">
                      <span>
                        ⚑ <strong>Checkpoint saved:</strong> Critical moment
                        (&ldquo;Everything&apos;s just… heavy.&rdquo;)
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRewind(primaryCheckpoint)}
                        className="shrink-0 rounded-md border border-violet-400/40 bg-violet-900/50 px-2 py-0.5 text-[11px] font-semibold hover:bg-violet-800/60 cursor-pointer"
                      >
                        ↺ Rewind here
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live Interim Student Voice Preview */}
            {live.liveInputPreview && (
              <div className="flex flex-col items-end opacity-80">
                <span className="mb-1 px-1 text-[11px] text-sky-300">
                  Speaking…
                </span>
                <div className="max-w-[85%] rounded-2xl border border-sky-400/40 bg-sky-950/50 px-4 py-2 text-sm text-sky-100 italic">
                  {live.liveInputPreview}
                </div>
              </div>
            )}

            {/* Live Streaming Jordan Audio Transcript */}
            {voiceStreamingReply && (
              <div className="flex flex-col items-start">
                <span className="mb-1 px-1 text-[11px] text-emerald-300">
                  Jordan Lee · Live · Gemini
                </span>
                <div className="max-w-[86%] rounded-2xl border border-emerald-400/30 bg-[#182642] px-4 py-2.5 text-sm text-[#E6EDF7]">
                  {voiceStreamingReply}
                </div>
              </div>
            )}

            {isSubmitting && !voiceStreamingReply && (
              <div className="flex items-center gap-2 text-xs text-[#8593AA] px-1">
                <span className="h-2 w-2 rounded-full bg-sky-400 animate-ping" />
                <span>Jordan is responding…</span>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Hints Toggle Bar (off for practice, on for demo) */}
          <div className="border-t border-white/10 bg-[#0E1729] px-4 py-2.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setHintsEnabled((v) => !v)}
                className="inline-flex items-center gap-2 text-xs font-medium text-[#9AA8BF] hover:text-[#E6EDF7] cursor-pointer"
              >
                <span
                  className={`inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                    hintsEnabled ? "bg-sky-500" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`h-3 w-3 rounded-full bg-white transition-transform ${
                      hintsEnabled ? "translate-x-3" : "translate-x-0"
                    }`}
                  />
                </span>
                <span>Hints {hintsEnabled ? "(On · Demo)" : "(Off)"}</span>
              </button>

              {(uiError || live.error) && (
                <span className="truncate max-w-[65%] text-xs text-rose-300">
                  {uiError ?? live.error}
                </span>
              )}
            </div>

            {hintsEnabled && (
              <div className="mt-2.5 flex flex-col gap-1.5">
                {hints.map((hint, i) => {
                  const cleanQuote = hint.replace(/^"|"$/g, "");
                  const isQuote = hint.startsWith('"');
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!isQuote || isSubmitting}
                      onClick={() => {
                        if (isQuote) {
                          setInputText(cleanQuote);
                        }
                      }}
                      className={`text-left rounded-lg border border-sky-400/20 bg-[#14223C] px-3 py-1.5 text-xs text-sky-100 transition-colors ${
                        isQuote
                          ? "hover:border-sky-400/50 hover:bg-[#192B4D] cursor-pointer"
                          : "opacity-80 cursor-default"
                      }`}
                    >
                      💡 {hint}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Voice Push-to-Talk + Text Input Composer */}
          <div className="border-t border-white/10 bg-[#111A2E] p-3">
            {live.status === "connected" && (
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-emerald-950/25 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    {live.isMicStreaming
                      ? "Listening on mic… release or tap Stop when finished"
                      : "Live · Gemini voice active (use headphones to avoid echo)"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onMouseDown={() => void live.startMicCapture()}
                    onMouseUp={() => live.stopMicCapture(true)}
                    onTouchStart={() => void live.startMicCapture()}
                    onTouchEnd={() => live.stopMicCapture(true)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer select-none ${
                      live.isMicStreaming
                        ? "bg-rose-500 text-white ring-2 ring-rose-300"
                        : "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                    }`}
                  >
                    {live.isMicStreaming ? "● Speaking…" : "🎙 Hold to Talk"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      live.isMicStreaming
                        ? live.stopMicCapture(true)
                        : void live.startMicCapture()
                    }
                    className="rounded-lg border border-white/15 bg-[#16233E] px-2.5 py-1.5 text-xs text-[#C8D4E8] hover:bg-[#1E2F52] cursor-pointer"
                  >
                    {live.isMicStreaming ? "Stop Mic" : "Open Mic"}
                  </button>
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitStudentMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isSubmitting}
                placeholder={
                  live.status === "connected"
                    ? "Hold to Talk above, or type a question for Jordan to answer aloud…"
                    : "Interview Jordan (e.g., ask about sleep onset, mood, support, safety)…"
                }
                className="flex-1 rounded-xl border border-white/15 bg-[#0B1220] px-3.5 py-2.5 text-sm text-[#E6EDF7] placeholder-[#697892] focus:border-sky-400 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isSubmitting}
                className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-40 transition-colors cursor-pointer"
              >
                Send
              </button>
            </form>
          </div>
        </section>

        {/* RIGHT COLUMN: Student Risk Assessment & Single Consolidated Actions Menu */}
        <section className="flex flex-col gap-4 lg:col-span-3">
          {/* Student Risk Selector (Student fills in; debrief grades it) */}
          <div className="rounded-2xl border border-white/10 bg-[#111A2E] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9AA8BF]">
                Your Risk Assessment
              </h2>
              {!engineState.studentRisk && (
                <span className="text-[11px] text-amber-300">Required</span>
              )}
            </div>
            <p className="mt-1 text-xs text-[#8593AA]">
              Select your clinical estimate of Jordan&apos;s acute suicide risk
              before ending the encounter.
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["low", "moderate", "high"] as const).map((level) => {
                const selected = engineState.studentRisk === level;
                const activeStyle =
                  level === "low"
                    ? "border-emerald-400 bg-emerald-950/70 text-emerald-200"
                    : level === "moderate"
                      ? "border-amber-400 bg-amber-950/70 text-amber-200"
                      : "border-rose-400 bg-rose-950/70 text-rose-200";

                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => handleSelectRisk(level)}
                    className={`rounded-xl border px-2.5 py-2 text-xs font-semibold capitalize transition-all cursor-pointer ${
                      selected
                        ? activeStyle
                        : "border-white/10 bg-[#0D1526] text-[#9AA8BF] hover:border-white/25 hover:text-white"
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Consolidated Single "Actions" Dropdown Menu */}
          <div
            ref={actionsMenuRef}
            className="relative rounded-2xl border border-white/10 bg-[#111A2E] p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9AA8BF]">
                  Clinical Orders &amp; Tools
                </h2>
                <p className="mt-0.5 text-xs text-[#8593AA]">
                  Screeners, safety planning &amp; disposition
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActionsMenuOpen((open) => !open)}
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-sky-400/35 bg-[#162440] px-3.5 py-2.5 text-xs font-semibold text-[#E6EDF7] hover:bg-[#1C2E52] transition-colors cursor-pointer"
            >
              <span>Actions ({engineState.actions.length} selected)</span>
              <span>{actionsMenuOpen ? "▴" : "▾"}</span>
            </button>

            {actionsMenuOpen && (
              <div className="absolute left-4 right-4 z-20 mt-2 overflow-hidden rounded-xl border border-white/15 bg-[#0E172A] shadow-2xl">
                {ACTION_OPTIONS.map((opt) => {
                  const alreadyDone = engineState.actions.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectAction(opt.id)}
                      className="flex w-full items-start justify-between gap-2 border-b border-white/5 px-3.5 py-2.5 text-left hover:bg-[#172542] last:border-b-0 cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-semibold text-[#E6EDF7]">
                          {opt.label}
                        </div>
                        <div className="text-[11px] text-[#8593AA]">
                          {opt.subtitle}
                        </div>
                      </div>
                      {alreadyDone && (
                        <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          ✓ Done
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Logged Actions & Clinical Instrument Readouts */}
            <div className="mt-3 space-y-2">
              {engineState.actions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-center text-xs text-[#697892]">
                  No clinical actions recorded yet.
                </div>
              ) : (
                engineState.actions.map((act) => (
                  <div
                    key={act}
                    className={`rounded-xl border px-3 py-2 text-xs ${
                      act === "sleep_aid"
                        ? "border-amber-400/40 bg-amber-950/30 text-amber-100"
                        : "border-emerald-400/30 bg-emerald-950/25 text-emerald-100"
                    }`}
                  >
                    <div className="font-semibold">
                      ✓ {ACTION_TITLES[act]}
                    </div>
                    {act === "phq9" && (
                      <div className="mt-1 text-[11px] text-[#B8C7E0]">
                        Score: 19/27 (Moderately severe depressive symptoms;
                        Item 9 requires direct verbal follow-up).
                      </div>
                    )}
                    {act === "cssrs" && (
                      <div className="mt-1 text-[11px] text-[#B8C7E0]">
                        {engineState.unlocked.includes("suicidal_thoughts")
                          ? "Positive screen: active ideation uncovered—verify specific plan/means and initiate safety plan."
                          : "Patient guarded on self-report—build rapport and ask directly in your own words."}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Saved Runs / Compare Quick Card */}
          <div className="rounded-2xl border border-white/10 bg-[#111A2E] p-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold uppercase tracking-wider text-[#9AA8BF]">
                Branch History
              </span>
              <span className="font-mono text-[#8593AA]">
                {completedBranches.length} saved
              </span>
            </div>
            <p className="mt-1.5 text-[#8593AA]">
              {primaryCheckpoint
                ? 'Checkpoint "heavy" is active. You can finish this run and rewind to compare outcomes side by side.'
                : 'Uncover Jordan\'s mood ("heavy") to unlock the automatic decision checkpoint.'}
            </p>
            {completedBranches.length >= 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/debrief"
                  className="rounded-lg border border-white/15 bg-[#16233E] px-2.5 py-1.5 font-medium text-sky-200 hover:bg-[#1E2F52]"
                >
                  View Debrief
                </Link>
                {completedBranches.length >= 2 && (
                  <Link
                    href="/compare"
                    className="rounded-lg border border-violet-400/40 bg-violet-950/50 px-2.5 py-1.5 font-medium text-violet-200 hover:bg-violet-900/60"
                  >
                    Compare Runs ({completedBranches.length})
                  </Link>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* End-of-Encounter Outcome & Handoff Modal */}
      {endedSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#111A2E] p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs uppercase text-[#8593AA]">
                Encounter Complete · {endedSummary.branch.id}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  endedSummary.outcome.badge === "pass"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                    : endedSummary.outcome.badge === "warn"
                      ? "bg-amber-500/20 text-amber-200 border border-amber-400/40"
                      : "bg-rose-500/20 text-rose-300 border border-rose-400/40"
                }`}
              >
                {endedSummary.outcome.badge === "pass"
                  ? "Risk Identified"
                  : endedSummary.outcome.badge === "warn"
                    ? "Risk Underestimated"
                    : "Risk Missed"}
              </span>
            </div>

            <h3 className="mt-3 text-lg font-bold text-[#E6EDF7]">
              {endedSummary.outcome.summary}
            </h3>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-[#0B1220] p-3 text-center text-xs">
              <div>
                <div className="text-[#8593AA]">Final Trust</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-[#E6EDF7]">
                  {endedSummary.branch.finalState.trust}%
                </div>
              </div>
              <div>
                <div className="text-[#8593AA]">Disclosures</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-sky-300">
                  {endedSummary.branch.finalState.unlocked.length} /{" "}
                  {JORDAN_SCENARIO.disclosures.length}
                </div>
              </div>
              <div>
                <div className="text-[#8593AA]">Your Risk Call</div>
                <div className="mt-0.5 font-mono text-sm font-bold capitalize text-[#E6EDF7]">
                  {endedSummary.branch.finalState.studentRisk ?? "Not set"}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
              {primaryCheckpoint && (
                <button
                  type="button"
                  onClick={() => void handleRewind(primaryCheckpoint)}
                  className="rounded-xl border border-violet-400/50 bg-violet-950/70 px-4 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-900/80 cursor-pointer"
                >
                  ↺ Rewind to &ldquo;heavy&rdquo; Checkpoint
                </button>
              )}
              {completedBranches.length >= 2 && (
                <Link
                  href="/compare"
                  className="rounded-xl border border-sky-400/40 bg-[#162544] px-4 py-2 text-xs font-semibold text-sky-200 hover:bg-[#1E3158]"
                >
                  Compare Runs →
                </Link>
              )}
              <Link
                href="/debrief"
                className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400"
              >
                Open Cited Debrief →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Safety & 988 Lifeline Footer (Non-Negotiable) */}
      <footer className="border-t border-white/10 bg-[#080E1A] px-4 py-3 text-xs text-[#8593AA]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div>
            <strong className="text-[#B8C7E0]">
              For education only. Not for clinical decision-making.
            </strong>{" "}
            All patient personas and clinical histories in MedMimic are
            fictional.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span>
              In crisis? Call or text{" "}
              <strong className="text-sky-300">988</strong> (Suicide &amp; Crisis
              Lifeline · 24/7 free &amp; confidential)
            </span>
            <button
              type="button"
              onClick={handleResetSimulation}
              className="underline hover:text-[#E6EDF7] cursor-pointer"
            >
              Reset Demo
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function EncounterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0B1220] text-sm text-[#9AA8BF]">
          Loading clinical encounter…
        </div>
      }
    >
      <EncounterWorkspace />
    </Suspense>
  );
}
