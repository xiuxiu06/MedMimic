import {
  classifyStudentTurn,
  resolveFastModelCandidates,
} from "../../../lib/classifier";
import { createCheckpoint } from "../../../lib/checkpoints";
import {
  applyStudentAction,
  applyStudentTurn,
  createInitialEngineState,
  DEMO_CHECKPOINT_ID,
  evaluateOutcome,
  JORDAN_SCENARIO,
  setStudentRisk,
} from "../../../lib/engine";
import { gemini } from "../../../lib/gemini";
import {
  buildLiveDirectorCue,
  buildPatientPrompt,
  isOutOfCharacterOrNonEnglish,
  sanitizePatientReply,
} from "../../../lib/patientPrompt";
import type {
  ActionId,
  Checkpoint,
  EngineState,
  Message,
  RiskLevel,
  TimelineEvent,
  TurnLabel,
} from "../../../lib/types";

const VALID_ACTIONS = new Set<ActionId>([
  "phq9",
  "cssrs",
  "safety_plan",
  "sleep_aid",
  "consult",
]);

const VALID_RISKS = new Set<RiskLevel>(["low", "moderate", "high"]);

export interface TurnRequestBody {
  studentText?: string;
  state?: EngineState;
  messages?: Message[];
  timeline?: TimelineEvent[];
  elapsedSec?: number;
  mode?: "text" | "voice";
  action?: ActionId;
  studentRisk?: RiskLevel;
  /** Optional pre-computed labels (useful for deterministic unit tests) */
  overrideLabels?: TurnLabel[];
}

function toInteractionSteps(messages: readonly Message[]) {
  const steps = messages.map((msg) =>
    msg.role === "student"
      ? {
          type: "user_input" as const,
          content: [{ type: "text" as const, text: msg.text }],
        }
      : {
          type: "model_output" as const,
          content: [{ type: "text" as const, text: msg.text }],
        },
  );

  // Ensure the turn sequence starts with a clinician user_input turn so the model
  // never loses role polarity (user = clinician, model = patient Jordan Lee).
  if (steps.length > 0 && steps[0].type === "model_output") {
    steps.unshift({
      type: "user_input" as const,
      content: [
        {
          type: "text" as const,
          text: "Hi Jordan, thanks for coming into the clinic today. What brings you in?",
        },
      ],
    });
  }

  return steps;
}

async function generatePatientTextReply(
  systemInstruction: string,
  messagesWithStudentTurn: readonly Message[],
  state: EngineState,
): Promise<string> {
  const baseSteps = toInteractionSteps(messagesWithStudentTurn);

  for (const model of resolveFastModelCandidates()) {
    try {
      const interaction = await gemini().interactions.create({
        model,
        system_instruction: systemInstruction,
        input: baseSteps,
        store: false,
        generation_config: {
          temperature: 0.55,
          ...(model.startsWith("gemini-3")
            ? { thinking_level: "minimal" as const }
            : {}),
        },
        safety_settings: [
          { type: "dangerous_content", threshold: "block_only_high" },
          { type: "harassment", threshold: "block_only_high" },
          { type: "hate_speech", threshold: "block_only_high" },
          { type: "sexually_explicit", threshold: "block_only_high" },
        ],
      });

      const raw = interaction.output_text?.trim();
      if (!raw) continue;

      const cleaned = sanitizePatientReply(raw);
      if (cleaned && !isOutOfCharacterOrNonEnglish(cleaned)) {
        return cleaned;
      }

      // If the model slipped into a disclaimer or non-English reply, retry once with an explicit correction step
      const retryInteraction = await gemini().interactions.create({
        model,
        system_instruction: systemInstruction,
        input: [
          ...baseSteps,
          {
            type: "user_input" as const,
            content: [
              {
                type: "text" as const,
                text: "[DIRECTOR CUE FOR JORDAN: Stay strictly in first-person character ('I') as patient Jordan Lee speaking English (en-US) to the clinician examining you. Never give health disclaimers or advice. Prefer 1–2 conversational sentences by default, or 3–4 sentences when sharing newly unlocked details or when more context feels appropriate.]",
              },
            ],
          },
        ],
        store: false,
        generation_config: {
          temperature: 0.4,
          ...(model.startsWith("gemini-3")
            ? { thinking_level: "minimal" as const }
            : {}),
        },
        safety_settings: [
          { type: "dangerous_content", threshold: "block_only_high" },
          { type: "harassment", threshold: "block_only_high" },
          { type: "hate_speech", threshold: "block_only_high" },
          { type: "sexually_explicit", threshold: "block_only_high" },
        ],
      });

      const retryCleaned = sanitizePatientReply(
        retryInteraction.output_text?.trim() ?? "",
      );
      if (retryCleaned && !isOutOfCharacterOrNonEnglish(retryCleaned)) {
        return retryCleaned;
      }
    } catch {
      // Fallback to next candidate model on 503/429
    }
  }

  // Safe in-character fallback if all endpoints are temporarily unavailable
  if (state.trust < 35) {
    return "Look, I'm just really tired. Is there anything you can give me to help me sleep?";
  }
  return "Yeah, I know—I'm completely exhausted. I just haven't been able to get more than two or three hours of sleep a night.";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TurnRequestBody;

    let state: EngineState = body.state ?? createInitialEngineState();
    let timeline: TimelineEvent[] = body.timeline ? [...body.timeline] : [];
    const messages: Message[] = body.messages
      ? [...body.messages]
      : [{ role: "patient", text: JORDAN_SCENARIO.patient.opening, t: 0 }];

    const elapsedSec =
      typeof body.elapsedSec === "number" && Number.isFinite(body.elapsedSec)
        ? Math.max(state.elapsedSec, Math.round(body.elapsedSec))
        : state.elapsedSec + 15;

    const mode = body.mode === "voice" ? "voice" : "text";

    // Optional risk level update
    if (body.studentRisk && VALID_RISKS.has(body.studentRisk)) {
      state = setStudentRisk(state, body.studentRisk);
    }

    // Optional clinical action update
    if (body.action && VALID_ACTIONS.has(body.action)) {
      const actionResult = applyStudentAction(
        state,
        timeline,
        body.action,
        elapsedSec,
      );
      state = actionResult.state;
      timeline = actionResult.timeline;
    }

    let labels: TurnLabel[] = [];
    let trustDelta = 0;
    let newlyUnlocked: string[] = [];
    let newlyFiredEvents: string[] = [];
    let shouldSaveCheckpoint: { id: string; reason: string } | undefined;
    let patientReply: string | undefined;
    let checkpoint: Checkpoint | undefined;

    const studentText = body.studentText?.trim();

    if (studentText) {
      // 1. Classify student turn with Gemini structured output
      labels =
        body.overrideLabels && body.overrideLabels.length > 0
          ? body.overrideLabels
          : await classifyStudentTurn({
              studentText,
              recentMessages: messages,
            });

      // 2. Advance deterministic scenario engine
      const stepped = applyStudentTurn({
        state,
        timeline,
        labels,
        quote: studentText,
        elapsedSec,
      });

      state = stepped.state;
      timeline = stepped.timeline;
      trustDelta = stepped.trustDelta;
      newlyUnlocked = stepped.newlyUnlocked;
      newlyFiredEvents = stepped.newlyFiredEvents;
      shouldSaveCheckpoint = stepped.shouldSaveCheckpoint;

      messages.push({
        role: "student",
        text: studentText,
        t: state.elapsedSec,
      });

      // 3. Build strictly-gated patient prompt + compact Live director cue
      const patientPrompt = buildPatientPrompt(state, JORDAN_SCENARIO, {
        newlyUnlocked,
        turnEvents: newlyFiredEvents,
      });
      const liveDirectorCue = buildLiveDirectorCue(state, JORDAN_SCENARIO, {
        newlyUnlocked,
        turnEvents: newlyFiredEvents,
      });

      // 4. Generate patient reply in text mode (in voice mode, Gemini Live speaks directly)
      if (mode === "text") {
        patientReply = await generatePatientTextReply(
          patientPrompt,
          messages,
          state,
        );
        messages.push({
          role: "patient",
          text: patientReply,
          t: state.elapsedSec + 2,
        });

        // 5. Save checkpoint snapshot right AFTER Jordan's "heavy" reply lands in messages[]
        if (shouldSaveCheckpoint) {
          checkpoint = createCheckpoint(
            shouldSaveCheckpoint.id,
            state,
            messages,
            timeline.length,
          );
        } else if (
          /\bheavy\b/i.test(patientReply) &&
          !timeline.some(
            (ev) => ev.kind === "checkpoint" && ev.label === DEMO_CHECKPOINT_ID,
          )
        ) {
          timeline.push({
            t: state.elapsedSec,
            kind: "checkpoint",
            label: DEMO_CHECKPOINT_ID,
            quote: "Everything's just… heavy.",
          });
          checkpoint = createCheckpoint(
            DEMO_CHECKPOINT_ID,
            state,
            messages,
            timeline.length,
          );
        }
      }

      return Response.json({
        ok: true,
        mode,
        labels,
        trustDelta,
        newlyUnlocked,
        newlyFiredEvents,
        state,
        timeline,
        messages,
        patientReply,
        patientPrompt,
        liveDirectorCue,
        shouldSaveCheckpoint,
        checkpoint,
        outcome: evaluateOutcome(state, timeline),
      });
    }

    // Action-only or risk-only update (no new student utterance)
    const patientPrompt = buildPatientPrompt(state, JORDAN_SCENARIO);
    return Response.json({
      ok: true,
      mode,
      labels,
      trustDelta,
      newlyUnlocked,
      newlyFiredEvents,
      state,
      timeline,
      messages,
      patientPrompt,
      outcome: evaluateOutcome(state, timeline),
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
