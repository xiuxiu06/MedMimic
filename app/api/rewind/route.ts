import { finalizeBranch, restoreCheckpoint } from "../../../lib/checkpoints";
import { evaluateOutcome } from "../../../lib/engine";
import { buildPatientPrompt } from "../../../lib/patientPrompt";
import { getScenario, type ScenarioV2 } from "../../../lib/scenarios";
import type {
  Branch,
  Checkpoint,
  EngineState,
  Message,
  TimelineEvent,
} from "../../../lib/types";

export interface RewindRequestBody {
  checkpoint: Checkpoint;
  currentBranch?: {
    id?: string;
    parentCheckpoint?: string;
    engineState: EngineState;
    messages: Message[];
    timeline: TimelineEvent[];
  };
  sourceTimeline?: TimelineEvent[];
  nextBranchId?: string;
  caseId?: string;
  scenario?: ScenarioV2;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RewindRequestBody;
    const {
      checkpoint,
      currentBranch,
      sourceTimeline,
      nextBranchId,
      scenario,
      caseId,
    } = body;

    if (
      !checkpoint ||
      !checkpoint.id ||
      !checkpoint.engineState ||
      !Array.isArray(checkpoint.messages)
    ) {
      return Response.json(
        { ok: false, error: "Valid checkpoint is required to rewind." },
        { status: 400 },
      );
    }

    const activeScenario = scenario ?? getScenario(caseId);

    let completedBranch: Branch | undefined;
    let completedOutcome: ReturnType<typeof evaluateOutcome> | undefined;

    if (currentBranch) {
      completedBranch = finalizeBranch({
        id: currentBranch.id ?? "branch-1",
        parentCheckpoint: currentBranch.parentCheckpoint,
        engineState: currentBranch.engineState,
        messages: currentBranch.messages,
        timeline: currentBranch.timeline,
      });
      completedOutcome = evaluateOutcome(
        completedBranch.finalState,
        completedBranch.timeline,
      );
    }

    const restored = restoreCheckpoint(
      checkpoint,
      currentBranch?.timeline ?? sourceTimeline ?? [],
      nextBranchId ?? `branch-rewind-${Date.now()}`,
    );

    const patientPrompt = buildPatientPrompt(
      restored.engineState,
      activeScenario,
    );

    return Response.json({
      ok: true,
      completedBranch,
      completedOutcome,
      restored,
      patientPrompt,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
