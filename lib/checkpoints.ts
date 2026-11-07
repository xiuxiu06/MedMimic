import { appendMissedEvents } from "./engine";
import type {
  Branch,
  Checkpoint,
  EngineState,
  Message,
  TimelineEvent,
} from "./types";

function cloneEngineState(state: EngineState): EngineState {
  return {
    ...state,
    unlocked: [...state.unlocked],
    firedEvents: [...state.firedEvents],
    actions: [...state.actions],
  };
}

function cloneMessages(messages: readonly Message[]): Message[] {
  return messages.map((m) => ({ ...m }));
}

function cloneTimeline(timeline: readonly TimelineEvent[]): TimelineEvent[] {
  return timeline.map((ev) => ({ ...ev }));
}

/**
 * Captures an immutable snapshot of the encounter right after a key patient turn
 * (e.g., right after Jordan says "Everything's just… heavy.").
 */
export function createCheckpoint(
  id: string,
  engineState: EngineState,
  messages: readonly Message[],
  timelineIndex: number,
): Checkpoint {
  return {
    id,
    engineState: cloneEngineState(engineState),
    messages: cloneMessages(messages),
    timelineIndex,
  };
}

export interface RestoredBranchSession {
  branchId: string;
  parentCheckpoint: string;
  engineState: EngineState;
  messages: Message[];
  timeline: TimelineEvent[];
}

/**
 * Restores a saved checkpoint into a clean new branch without mutating the snapshot.
 */
export function restoreCheckpoint(
  checkpoint: Checkpoint,
  sourceTimeline: readonly TimelineEvent[],
  nextBranchId: string = `branch-${Date.now()}`,
): RestoredBranchSession {
  const slicedTimeline = cloneTimeline(
    sourceTimeline.slice(0, checkpoint.timelineIndex),
  );

  return {
    branchId: nextBranchId,
    parentCheckpoint: checkpoint.id,
    engineState: cloneEngineState(checkpoint.engineState),
    messages: cloneMessages(checkpoint.messages),
    timeline: slicedTimeline,
  };
}

/**
 * Finalizes an active run into a `Branch` object (including `missed:*` events)
 * ready for Person B's `/debrief` and `/compare` views.
 */
export function finalizeBranch(params: {
  id: string;
  parentCheckpoint?: string;
  engineState: EngineState;
  messages: readonly Message[];
  timeline: readonly TimelineEvent[];
}): Branch {
  const finalState = cloneEngineState(params.engineState);
  const completedTimeline = appendMissedEvents(
    finalState,
    cloneTimeline(params.timeline),
  );

  return {
    id: params.id,
    parentCheckpoint: params.parentCheckpoint,
    timeline: completedTimeline,
    messages: cloneMessages(params.messages),
    finalState,
  };
}
