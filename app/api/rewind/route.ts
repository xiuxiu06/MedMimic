import { finalizeBranch, restoreCheckpoint } from "../../../lib/checkpoints";
import { evaluateOutcome, JORDAN_SCENARIO } from "../../../lib/engine";
import { buildPatientPrompt } from "../../../lib/patientPrompt";
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
  nextBranchId?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RewindRequestBody;
    const { checkpoint, currentBranch, nextBranchId } = body;

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
      currentBranch?.timeline ?? [],
      nextBranchId ?? `branch-rewind-${Date.now()}`,
    );

    const patientPrompt = buildPatientPrompt(
      restored.engineState,
      JORDAN_SCENARIO,
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
