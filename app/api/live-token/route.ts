import { createInitialEngineState, JORDAN_SCENARIO } from "../../../lib/engine";
import { gemini } from "../../../lib/gemini";
import { MODELS } from "../../../lib/models";
import { buildPatientPrompt } from "../../../lib/patientPrompt";
import type { EngineState } from "../../../lib/types";

export function resolveLiveModel(): string {
  const configured = MODELS.live;
  if (!configured || configured.startsWith("TODO")) {
    return "gemini-3.8-live";
  }
  return configured;
}

export interface LiveTokenRequestBody {
  state?: EngineState;
}

/**
 * POST /api/live-token
 * Mints a short-lived ephemeral token so the browser can open a direct WebSocket
 * session to Gemini Live without ever exposing GEMINI_API_KEY client-side.
 */
export async function POST(request: Request) {
  try {
    let state = createInitialEngineState();
    try {
      const body = (await request.json()) as LiveTokenRequestBody;
      if (body?.state) {
        state = body.state;
      }
    } catch {
      // Empty body is fine; defaults to initial engine state
    }

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
      expireTime,
      systemInstruction: buildPatientPrompt(state, JORDAN_SCENARIO),
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
