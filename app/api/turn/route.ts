import {
  classifyStudentTurn,
  FAST_REQUEST_OPTIONS,
  noteModelFailure,
  resolveFastModelCandidates,
} from "../../../lib/classifier";
import { createCheckpoint } from "../../../lib/checkpoints";
import {
  applyStudentAction,
  applyStudentTurn,
  phq9Result,
  createInitialEngineState,
  DEMO_CHECKPOINT_ID,
  evaluateOutcome,
  setStudentRisk,
} from "../../../lib/engine";
import { gemini } from "../../../lib/gemini";
import {
  buildLiveDirectorCue,
  buildPatientPrompt,
  isOutOfCharacterOrNonEnglish,
  sanitizePatientReply,
} from "../../../lib/patientPrompt";
import { rateLimit } from "../../../lib/rateLimit";
import { getScenario, type ScenarioV2 } from "../../../lib/scenarios";
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
  caseId?: string;
  scenario?: ScenarioV2;
  /** Optional pre-computed labels (useful for deterministic unit tests) */
  overrideLabels?: TurnLabel[];
}

function toInteractionSteps(
  messages: readonly Message[],
  patientName: string,
) {
  const firstName = patientName.split(/\s+/)[0] || patientName;
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
  // never loses role polarity (user = clinician, model = standardized patient).
  if (steps.length > 0 && steps[0].type === "model_output") {
    steps.unshift({
      type: "user_input" as const,
      content: [
        {
          type: "text" as const,
          text: `Hi ${firstName}, thanks for coming in today. What brings you in?`,
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
  scenario: ScenarioV2,
): Promise<string> {
  const baseSteps = toInteractionSteps(
    messagesWithStudentTurn,
    scenario.patient.name,
  );

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
      }, FAST_REQUEST_OPTIONS);

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
                text: `[DIRECTOR CUE FOR ${scenario.patient.name.toUpperCase()}: Stay strictly in first-person character ('I') as patient ${scenario.patient.name} speaking English (en-US) to the clinician examining you. Never give health disclaimers or advice. Prefer 1–2 conversational sentences by default, or 3–4 sentences when sharing newly unlocked details or when more context feels appropriate.]`,
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
      }, FAST_REQUEST_OPTIONS);

      const retryCleaned = sanitizePatientReply(
        retryInteraction.output_text?.trim() ?? "",
      );
      if (retryCleaned && !isOutOfCharacterOrNonEnglish(retryCleaned)) {
        return retryCleaned;
      }
    } catch (err) {
      // Fallback to next candidate model on 503/429 (and skip this one for a while)
      noteModelFailure(model, err);
    }
  }

  // Safe in-character fallback if all endpoints are temporarily unavailable
  if (state.trust < 36 || scenario.temperament === "hostile_volatile") {
    return "Look, I've already been waiting in here—is there actually something you can do to help me today or not?";
  }
  return "Yeah, I'm just completely worn down right now and trying to figure out how to get some relief.";
}

/**
 * Freeze the PHQ-9 result on its timeline entry ("phq9:<score>:<item9>") using what the
 * patient endorsed in the turn the screener was given, so later disclosures don't rewrite it.
 */
function recordPhq9Result(
  timeline: TimelineEvent[],
  state: EngineState,
): TimelineEvent[] {
  const idx = timeline.findLastIndex(
    (e) => e.kind === "action" && e.label === "phq9" && !e.quote,
  );
  if (idx < 0) return timeline;
  const { score, item9 } = phq9Result(state);
  const next = [...timeline];
  next[idx] = { ...next[idx], quote: `phq9:${score}:${item9}` };
  return next;
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "turn");
  if (limited) return limited;
  try {
    const body = (await request.json()) as TurnRequestBody;
    const activeScenario: ScenarioV2 =
      body.scenario ?? getScenario(body.caseId);

    let state: EngineState =
      body.state ?? createInitialEngineState(activeScenario);
    let timeline: TimelineEvent[] = body.timeline ? [...body.timeline] : [];
    const messages: Message[] = body.messages
      ? [...body.messages]
      : [{ role: "patient", text: activeScenario.patient.opening, t: 0 }];

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
        activeScenario,
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
        scenario: activeScenario,
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
      const patientPrompt = buildPatientPrompt(state, activeScenario, {
        newlyUnlocked,
        turnEvents: newlyFiredEvents,
      });
      const liveDirectorCue = buildLiveDirectorCue(state, activeScenario, {
        newlyUnlocked,
        turnEvents: newlyFiredEvents,
      });

      // 4. Generate patient reply in text mode (in voice mode, Gemini Live speaks directly)
      if (mode === "text") {
        patientReply = await generatePatientTextReply(
          patientPrompt,
          messages,
          state,
          activeScenario,
        );
        messages.push({
          role: "patient",
          text: patientReply,
          t: state.elapsedSec + 2,
        });

        const cpId = activeScenario.checkpoint?.id ?? DEMO_CHECKPOINT_ID;
        const cpKeyword = activeScenario.checkpoint?.keyword ?? "heavy";
        const cpQuote =
          activeScenario.checkpoint?.quote ?? "Everything's just… heavy.";
        const escapedKw = cpKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const kwRegex = new RegExp(`\\b${escapedKw}\\b`, "i");

        // 5. Save checkpoint snapshot right AFTER the patient's critical reply lands in messages[]
        if (shouldSaveCheckpoint) {
          checkpoint = createCheckpoint(
            shouldSaveCheckpoint.id,
            state,
            messages,
            timeline.length,
          );
        } else if (
          kwRegex.test(patientReply) &&
          !timeline.some(
            (ev) => ev.kind === "checkpoint" && ev.label === cpId,
          )
        ) {
          timeline.push({
            t: state.elapsedSec,
            kind: "checkpoint",
            label: cpId,
            quote: cpQuote,
          });
          checkpoint = createCheckpoint(
            cpId,
            state,
            messages,
            timeline.length,
          );
        }
      }

      if (body.action === "phq9") timeline = recordPhq9Result(timeline, state);

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
    if (body.action === "phq9") timeline = recordPhq9Result(timeline, state);
    const patientPrompt = buildPatientPrompt(state, activeScenario);
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
