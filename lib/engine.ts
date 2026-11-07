import scenarioData from "../data/scenario.jordan.json";
import type {
  ActionId,
  Disclosure,
  Emotion,
  EngineState,
  RiskLevel,
  Scenario,
  TimelineEvent,
  TurnLabel,
} from "./types";

export const JORDAN_SCENARIO: Scenario = scenarioData as Scenario;

/**
 * Human-readable labels for the 7 disclosures.
 * NOTE: During the active encounter, locked items MUST be rendered as "??? · locked"
 * so they never give away hidden clinical facts. Reveal these labels only once
 * unlocked or on the Debrief / Compare screens.
 */
export const DISCLOSURE_LABELS: Record<string, string> = {
  insomnia: "Insomnia (2 months)",
  job_loss: "Recent job loss (stressor)",
  low_mood: 'Depressed mood ("heavy")',
  hopelessness: "Hopelessness about the future",
  suicidal_thoughts: "Suicidal ideation",
  plan_and_means: "Specific plan & access to pills at home",
  protective_factors: "Protective factor (younger sister Maya)",
};

export const ENGINE_EVENTS = {
  SHUTDOWN: "patient_shuts_down",
  ASKS_TO_LEAVE: "patient_asks_to_leave",
  OPENS_UP: "patient_opens_up",
  SI_DENIED_LOW_TRUST: "si_denied_low_trust",
} as const;

export const DEMO_CHECKPOINT_ID = "cp-heavy";

export type OutcomeCode =
  | "risk_identified"
  | "risk_underestimated"
  | "risk_missed";

export interface EncounterOutcome {
  code: OutcomeCode;
  summary: string;
  badge: "pass" | "warn" | "fail";
}

export interface StepTurnInput {
  state: EngineState;
  timeline: TimelineEvent[];
  labels: TurnLabel[];
  quote: string;
  elapsedSec: number;
  scenario?: Scenario;
}

export interface StepTurnResult {
  state: EngineState;
  timeline: TimelineEvent[];
  trustDelta: number;
  newlyUnlocked: string[];
  newlyFiredEvents: string[];
  shouldSaveCheckpoint?: {
    id: string;
    reason: string;
  };
}

const MAX_TURN_TRUST_GAIN = 18;
const MAX_TURN_TRUST_DROP = -25;
const SHUTDOWN_TRUST_THRESHOLD = 35;
const LEAVE_TIME_SEC = 360;
const LEAVE_TRUST_THRESHOLD = 45;

function clampTrust(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isAlwaysAvailable(disclosure: Disclosure): boolean {
  const { labels, minTrust, unlocked } = disclosure.requires;
  return (
    (!labels || labels.length === 0) &&
    minTrust === undefined &&
    (!unlocked || unlocked.length === 0)
  );
}

export function createInitialEngineState(
  scenario: Scenario = JORDAN_SCENARIO,
): EngineState {
  const initialUnlocked = scenario.disclosures
    .filter(isAlwaysAvailable)
    .map((d) => d.id);

  return {
    trust: clampTrust(scenario.startTrust),
    emotion: "neutral",
    unlocked: initialUnlocked,
    firedEvents: [],
    actions: [],
    elapsedSec: 0,
  };
}

function canUnlockDisclosure(
  disclosure: Disclosure,
  trust: number,
  unlocked: Set<string>,
  turnLabels: Set<TurnLabel>,
): boolean {
  if (unlocked.has(disclosure.id)) return false;

  const {
    labels,
    minTrust,
    unlocked: requiredUnlocked,
  } = disclosure.requires;

  if (minTrust !== undefined && trust < minTrust) {
    return false;
  }

  if (labels && labels.length > 0) {
    const matchedLabel = labels.some((label) => turnLabels.has(label));
    if (!matchedLabel) return false;
  }

  if (requiredUnlocked && requiredUnlocked.length > 0) {
    const hasPrereqs = requiredUnlocked.every((id) => unlocked.has(id));
    if (!hasPrereqs) return false;
  }

  return true;
}

export function deriveEmotion(
  trust: number,
  unlocked: ReadonlySet<string>,
  actions: readonly ActionId[],
  turnLabels: ReadonlySet<TurnLabel>,
  newlyUnlocked: ReadonlySet<string>,
): Emotion {
  if (trust < SHUTDOWN_TRUST_THRESHOLD) {
    return turnLabels.has("dismissive") ? "irritable" : "withdrawn";
  }

  if (
    turnLabels.has("dismissive") ||
    turnLabels.has("premature_reassurance") ||
    trust < 42
  ) {
    return "withdrawn";
  }

  if (
    unlocked.has("suicidal_thoughts") &&
    (actions.includes("safety_plan") ||
      (unlocked.has("protective_factors") && trust >= 70))
  ) {
    return "relieved";
  }

  if (
    newlyUnlocked.has("suicidal_thoughts") ||
    newlyUnlocked.has("plan_and_means") ||
    unlocked.has("suicidal_thoughts")
  ) {
    return "tearful";
  }

  if (
    unlocked.has("hopelessness") ||
    unlocked.has("low_mood") ||
    unlocked.has("job_loss")
  ) {
    return "sad";
  }

  return "neutral";
}

/**
 * Pure turn reducer: applies trust deltas FIRST, then evaluates disclosures
 * (so an empathetic reflection + direct SI question in the same turn works),
 * fires engine events, updates emotion, and flags checkpoints.
 */
export function applyStudentTurn({
  state,
  timeline,
  labels,
  quote,
  elapsedSec,
  scenario = JORDAN_SCENARIO,
}: StepTurnInput): StepTurnResult {
  const dedupedLabels: TurnLabel[] =
    labels.length > 0 ? Array.from(new Set(labels)) : ["other"];
  const labelSet = new Set<TurnLabel>(dedupedLabels);
  const nextElapsedSec = Math.max(state.elapsedSec, Math.round(elapsedSec));

  // 1. Compute trust delta from unique labels in this turn
  const rawDelta = dedupedLabels.reduce(
    (sum, label) => sum + (scenario.trustDeltas[label] ?? 0),
    0,
  );
  const clampedDelta = Math.max(
    MAX_TURN_TRUST_DROP,
    Math.min(MAX_TURN_TRUST_GAIN, rawDelta),
  );
  const nextTrust = clampTrust(state.trust + clampedDelta);
  const actualTrustDelta = nextTrust - state.trust;

  // 2. Log turn label(s) to timeline
  const nextTimeline: TimelineEvent[] = [...timeline];
  const meaningfulLabels =
    dedupedLabels.length > 1
      ? dedupedLabels.filter((l) => l !== "other")
      : dedupedLabels;
  const labelsToLog: TurnLabel[] =
    meaningfulLabels.length > 0 ? meaningfulLabels : ["other"];

  labelsToLog.forEach((label, idx) => {
    const labelDelta = scenario.trustDeltas[label] ?? 0;
    nextTimeline.push({
      t: nextElapsedSec,
      kind: "turn",
      label,
      quote: idx === 0 ? quote : undefined,
      trustDelta:
        labelsToLog.length === 1
          ? actualTrustDelta
          : labelDelta !== 0
            ? labelDelta
            : undefined,
    });
  });

  // 3. Evaluate newly unlocked disclosures against updated trust
  const unlockedSet = new Set<string>(state.unlocked);
  const newlyUnlocked: string[] = [];

  let changed = true;
  while (changed) {
    changed = false;
    for (const disclosure of scenario.disclosures) {
      if (canUnlockDisclosure(disclosure, nextTrust, unlockedSet, labelSet)) {
        unlockedSet.add(disclosure.id);
        newlyUnlocked.push(disclosure.id);
        changed = true;
      }
    }
  }

  // 4. Fire engine events
  const firedSet = new Set<string>(state.firedEvents);
  const newlyFiredEvents: string[] = [];

  const fireOnce = (eventId: string) => {
    if (!firedSet.has(eventId)) {
      firedSet.add(eventId);
      newlyFiredEvents.push(eventId);
      nextTimeline.push({
        t: nextElapsedSec,
        kind: "event",
        label: eventId,
      });
    }
  };

  // Track if student asked directly about SI while trust was too low (< 60)
  if (
    labelSet.has("asked_SI_directly") &&
    !unlockedSet.has("suicidal_thoughts")
  ) {
    // Always notify this turn's prompt so Jordan guardedly denies on this turn,
    // while keeping firedEvents deduplicated on EngineState.
    if (!newlyFiredEvents.includes(ENGINE_EVENTS.SI_DENIED_LOW_TRUST)) {
      newlyFiredEvents.push(ENGINE_EVENTS.SI_DENIED_LOW_TRUST);
    }
    if (!firedSet.has(ENGINE_EVENTS.SI_DENIED_LOW_TRUST)) {
      firedSet.add(ENGINE_EVENTS.SI_DENIED_LOW_TRUST);
      nextTimeline.push({
        t: nextElapsedSec,
        kind: "event",
        label: ENGINE_EVENTS.SI_DENIED_LOW_TRUST,
        quote,
      });
    }
  }

  if (nextTrust < SHUTDOWN_TRUST_THRESHOLD) {
    fireOnce(ENGINE_EVENTS.SHUTDOWN);
  }

  if (
    nextElapsedSec >= LEAVE_TIME_SEC &&
    nextTrust < LEAVE_TRUST_THRESHOLD
  ) {
    fireOnce(ENGINE_EVENTS.ASKS_TO_LEAVE);
  }

  if (newlyUnlocked.includes("suicidal_thoughts")) {
    fireOnce(ENGINE_EVENTS.OPENS_UP);
  }

  // 5. Mark demo checkpoint when "low_mood" ("Everything's just... heavy.") unlocks
  let shouldSaveCheckpoint: StepTurnResult["shouldSaveCheckpoint"];
  const alreadyHasHeavyCheckpoint = nextTimeline.some(
    (ev) => ev.kind === "checkpoint" && ev.label === DEMO_CHECKPOINT_ID,
  );
  if (newlyUnlocked.includes("low_mood") && !alreadyHasHeavyCheckpoint) {
    nextTimeline.push({
      t: nextElapsedSec,
      kind: "checkpoint",
      label: DEMO_CHECKPOINT_ID,
    });
    shouldSaveCheckpoint = {
      id: DEMO_CHECKPOINT_ID,
      reason: 'Jordan mentions feeling "heavy"',
    };
  }

  // 6. Derive updated emotion
  const nextEmotion = deriveEmotion(
    nextTrust,
    unlockedSet,
    state.actions,
    labelSet,
    new Set(newlyUnlocked),
  );

  const nextState: EngineState = {
    ...state,
    trust: nextTrust,
    emotion: nextEmotion,
    unlocked: Array.from(unlockedSet),
    firedEvents: Array.from(firedSet),
    elapsedSec: nextElapsedSec,
  };

  return {
    state: nextState,
    timeline: nextTimeline,
    trustDelta: actualTrustDelta,
    newlyUnlocked,
    newlyFiredEvents,
    shouldSaveCheckpoint,
  };
}

export function applyStudentAction(
  state: EngineState,
  timeline: TimelineEvent[],
  action: ActionId,
  elapsedSec: number = state.elapsedSec,
): { state: EngineState; timeline: TimelineEvent[] } {
  const nextElapsedSec = Math.max(state.elapsedSec, Math.round(elapsedSec));
  const nextActions = state.actions.includes(action)
    ? state.actions
    : [...state.actions, action];

  const nextTimeline: TimelineEvent[] = [
    ...timeline,
    {
      t: nextElapsedSec,
      kind: "action",
      label: action,
    },
  ];

  const unlockedSet = new Set(state.unlocked);
  const nextEmotion = deriveEmotion(
    state.trust,
    unlockedSet,
    nextActions,
    new Set(),
    new Set(),
  );

  return {
    state: {
      ...state,
      actions: nextActions,
      emotion: nextEmotion,
      elapsedSec: nextElapsedSec,
    },
    timeline: nextTimeline,
  };
}

export function setStudentRisk(
  state: EngineState,
  risk: RiskLevel,
): EngineState {
  return {
    ...state,
    studentRisk: risk,
  };
}

/**
 * Appends "missed:*" events at the end of an encounter so Person B's RAG debrief
 * can directly retrieve guidelines for missed clinical steps.
 */
export function appendMissedEvents(
  state: EngineState,
  timeline: TimelineEvent[],
): TimelineEvent[] {
  const nextTimeline = [...timeline];
  const existingMissed = new Set(
    nextTimeline.filter((e) => e.kind === "missed").map((e) => e.label),
  );
  const turnLabels = new Set(
    nextTimeline.filter((e) => e.kind === "turn").map((e) => e.label),
  );

  const addMissed = (label: string) => {
    if (!existingMissed.has(label)) {
      existingMissed.add(label);
      nextTimeline.push({
        t: state.elapsedSec,
        kind: "missed",
        label,
      });
    }
  };

  if (!turnLabels.has("asked_SI_directly")) {
    addMissed("missed:asked_SI_directly");
  }

  if (state.unlocked.includes("suicidal_thoughts")) {
    if (!turnLabels.has("asked_plan")) {
      addMissed("missed:asked_plan");
    }
    if (!turnLabels.has("asked_support")) {
      addMissed("missed:asked_support");
    }
  }

  if (
    !state.actions.includes("safety_plan") &&
    !state.actions.includes("consult")
  ) {
    addMissed("missed:safety_plan");
  }

  return nextTimeline;
}

export function evaluateOutcome(
  state: EngineState,
  timeline: TimelineEvent[],
): EncounterOutcome {
  const siUnlocked = state.unlocked.includes("suicidal_thoughts");
  const askedSIDirectly = timeline.some(
    (e) => e.kind === "turn" && e.label === "asked_SI_directly",
  );
  const didSafetyPlan = state.actions.includes("safety_plan");
  const didConsult = state.actions.includes("consult");
  const recommendedSleepAid = state.actions.includes("sleep_aid");

  if (siUnlocked && (didSafetyPlan || didConsult) && !recommendedSleepAid) {
    return {
      code: "risk_identified",
      summary:
        "Risk identified: safety plan completed with urgent psychiatric evaluation",
      badge: "pass",
    };
  }

  if (!askedSIDirectly || (!siUnlocked && recommendedSleepAid)) {
    return {
      code: "risk_missed",
      summary: recommendedSleepAid
        ? "Risk missed: sleep aid recommended and patient discharged with access to lethal means"
        : "Risk missed: suicide risk never directly assessed before closing encounter",
      badge: "fail",
    };
  }

  return {
    code: "risk_underestimated",
    summary: !siUnlocked
      ? "Patient denied suicidal thoughts due to low rapport; acute risk underestimated"
      : recommendedSleepAid
        ? "Suicidal ideation uncovered, but unsafe sleep aid was still recommended"
        : "Suicidal ideation uncovered, but encounter ended without safety planning or psychiatric consult",
    badge: "warn",
  };
}

/**
 * Contextual hints for the Encounter UI "Hints" toggle (off for practice, on for demo).
 */
export function getEncounterHints(state: EngineState): string[] {
  const unlocked = new Set(state.unlocked);
  const hints: string[] = [];

  if (!unlocked.has("job_loss")) {
    hints.push(
      '"When did the trouble sleeping start—did anything change around two months ago?"',
    );
  }
  if (!unlocked.has("low_mood")) {
    hints.push(
      '"Beyond being tired, how has your mood been feeling day to day?"',
    );
  }
  if (unlocked.has("low_mood") && state.trust < 60) {
    hints.push(
      '"You mentioned everything feels heavy right now—it sounds like you have been carrying a lot on your own."',
    );
  }
  if (!unlocked.has("hopelessness") && state.trust >= 50) {
    hints.push('"When you look ahead to the next few weeks, how do things look to you?"');
  }
  if (!unlocked.has("suicidal_thoughts") && state.trust >= 60) {
    hints.push(
      '"When things feel this heavy and hopeless, some people have thoughts of ending their life. Have you been having thoughts like that?"',
    );
  }
  if (unlocked.has("suicidal_thoughts") && !unlocked.has("plan_and_means")) {
    hints.push(
      '"Thank you for trusting me with that. Have you thought about a specific plan, or do you have pills or anything else at home you might use?"',
    );
  }
  if (unlocked.has("suicidal_thoughts") && !unlocked.has("protective_factors")) {
    hints.push(
      '"Who or what in your life has helped keep you going when those thoughts come up?"',
    );
  }

  if (hints.length === 0) {
    hints.push(
      "Select High Risk, complete a Safety Plan, and request an Urgent Psychiatric Consult from Actions.",
    );
  }

  return hints.slice(0, 3);
}
