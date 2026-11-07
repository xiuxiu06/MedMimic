import { createInitialEngineState } from "../../../lib/engine";
import { gemini } from "../../../lib/gemini";
import { MODELS } from "../../../lib/models";
import { buildPatientPrompt } from "../../../lib/patientPrompt";
import {
  getScenario,
  selectVoiceForPatient,
  type ScenarioV2,
} from "../../../lib/scenarios";
import type { EngineState } from "../../../lib/types";

export function resolveLiveModel(): string {
  const configured: string = MODELS.live;
  if (!configured || configured.startsWith("TODO")) {
    return "gemini-3.8-live";
  }
  return configured;
}

export interface LiveTokenRequestBody {
  state?: EngineState;
  caseId?: string;
  scenario?: ScenarioV2;
}

/**
 * POST /api/live-token
 * Mints a short-lived ephemeral token so the browser can open a direct WebSocket
 * session to Gemini Live without ever exposing GEMINI_API_KEY client-side.
 */
export async function POST(request: Request) {
  try {
    let activeScenario = getScenario();
    let state: EngineState | undefined;

    try {
      const body = (await request.json()) as LiveTokenRequestBody;
      if (body?.scenario) {
        activeScenario = body.scenario;
      } else if (body?.caseId) {
        activeScenario = getScenario(body.caseId);
      }
      if (body?.state) {
        state = body.state;
      }
    } catch {
      // Empty body is fine; defaults to Jordan scenario & initial state
    }

    const effectiveState = state ?? createInitialEngineState(activeScenario);
    const voiceName =
      activeScenario.voiceName ??
      selectVoiceForPatient(
        activeScenario.gender ?? "male",
        activeScenario.temperament ?? "guarded_tired",
        activeScenario.patient.age,
      );

    const now = Date.now();
    const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(now + 5 * 60 * 1000).toISOString();

    const authToken = await gemini().authTokens.create({
      config: {
        httpOptions: { apiVersion: "v1alpha" },
        uses: 5,
        expireTime,
        newSessionExpireTime,
      },
    });

    if (!authToken.name) {
      throw new Error("Gemini API returned an empty ephemeral token name.");
    }

    return Response.json({
      ok: true,
      token: authToken.name,
      apiVersion: "v1alpha",
      model: resolveLiveModel(),
      voiceName,
      expireTime,
      systemInstruction: buildPatientPrompt(effectiveState, activeScenario),
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
