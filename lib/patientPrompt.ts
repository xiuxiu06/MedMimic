import { ENGINE_EVENTS, JORDAN_SCENARIO } from "./engine";
import type { Emotion, EngineState, Scenario } from "./types";

export interface PatientPromptOptions {
  newlyUnlocked?: string[];
  turnEvents?: string[];
}

const EMOTION_VOICE_DIRECTION: Record<Emotion, string> = {
  neutral:
    "Speak in a tired, understated, matter-of-fact tone. Keep answers brief (1–3 sentences) and slightly guarded.",
  withdrawn:
    "Speak in a flat, clipped, quiet tone with minimal elaboration (1–2 short sentences). Pull back emotionally and focus on just wanting something for sleep or wrapping up.",
  irritable:
    "Sound tense, guarded, and quietly frustrated at feeling brushed off (1–2 short sentences), without shouting or breaking realism.",
  sad:
    "Speak slowly with low energy and quiet heaviness, pausing briefly before answering.",
  tearful:
    "Speak softly with audible hesitation and vulnerability, as if holding back tears while sharing something very hard for the first time.",
  relieved:
    "Sound noticeably steadier and less guarded—still tired, but genuinely heard and willing to collaborate on staying safe.",
};

function trustGuidance(trust: number): string {
  if (trust < 35) {
    return "Trust is VERY LOW (<35). You have shut down emotionally. Give minimal one-sentence replies, avoid volunteering anything personal, and focus on just getting a sleep aid or ending the visit.";
  }
  if (trust < 50) {
    return "Trust is GUARDED (35–49). Answer politely but briefly. Do not volunteer vulnerable emotions unless specifically unlocked below.";
  }
  if (trust < 60) {
    return "Trust is MODERATE (50–59). You are starting to feel heard, so share unlocked facts naturally, though you are still hesitant about your deepest secrets.";
  }
  return "Trust is HIGH (60+). You feel genuinely respected and safe with this clinician. Share unlocked facts openly and honestly in a human, unscripted way.";
}

/**
 * Builds the standardized-patient system instruction STRICTLY from unlocked facts.
 * Locked disclosures from the scenario are NEVER passed into this prompt.
 */
export function buildPatientPrompt(
  state: EngineState,
  scenario: Scenario = JORDAN_SCENARIO,
  options: PatientPromptOptions = {},
): string {
  const unlockedIds = new Set(state.unlocked);
  const newlyUnlockedIds = new Set(options.newlyUnlocked ?? []);
  const turnEvents = new Set(options.turnEvents ?? []);

  // CRITICAL INVARIANT: filter disclosures strictly by state.unlocked
  const unlockedDisclosures = scenario.disclosures.filter((d) =>
    unlockedIds.has(d.id),
  );

  const unlockedFactsBlock = unlockedDisclosures
    .map((d) => {
      const tag = newlyUnlockedIds.has(d.id)
        ? "[NEWLY UNLOCKED THIS TURN — weave this naturally into your next response]"
        : "[UNLOCKED]";
      return `- ${tag} ${d.fact}`;
    })
    .join("\n");

  const specialTurnInstructions: string[] = [];

  if (newlyUnlockedIds.has("low_mood")) {
    specialTurnInstructions.push(
      'IMPORTANT FOR THIS REPLY: Include the exact word "heavy" naturally when describing how things feel (for example: "Everything\'s just… heavy.").',
    );
  }

  if (newlyUnlockedIds.has("suicidal_thoughts")) {
    specialTurnInstructions.push(
      'IMPORTANT FOR THIS REPLY: Include a quiet acknowledgment like "I haven\'t told anyone that…" as you share this for the first time.',
    );
  }

  if (
    turnEvents.has(ENGINE_EVENTS.SI_DENIED_LOW_TRUST) &&
    !unlockedIds.has("suicidal_thoughts")
  ) {
    specialTurnInstructions.push(
      "IMPORTANT FOR THIS REPLY: The student just asked about self-harm or suicide, SO DO NOT CONFESS IT because you do not trust them enough yet. Quietly deflect and deny it in character (e.g., \"No, nothing like that. I'm just exhausted and trying to get some sleep.\").",
    );
  }

  if (
    turnEvents.has(ENGINE_EVENTS.ASKS_TO_LEAVE) ||
    state.firedEvents.includes(ENGINE_EVENTS.ASKS_TO_LEAVE)
  ) {
    specialTurnInstructions.push(
      "You are ready for this visit to end—mention that maybe this was a mistake or ask if you can wrap up and head home.",
    );
  }

  return [
    "CONTEXT: You are playing a fictional standardized patient in an accredited medical/nursing school OSCE clinical interviewing simulation.",
    "Staying authentically in character is essential so healthcare trainees can practice empathetic communication and suicide risk screening safely.",
    "Never break character, never mention being an AI, never give medical advice, and never use clinical jargon that a layperson wouldn't use.",
    "",
    `CHARACTER: ${scenario.patient.name}, age ${scenario.patient.age}.`,
    `BASELINE CONTEXT: ${scenario.patient.backstory}`,
    `OPENING LINE ALREADY SPOKEN AT VISIT START: "${scenario.patient.opening}"`,
    "",
    `CURRENT TRUST LEVEL: ${state.trust}/100. ${trustGuidance(state.trust)}`,
    `CURRENT EMOTIONAL STATE (${state.emotion}): ${EMOTION_VOICE_DIRECTION[state.emotion]}`,
    "",
    "UNLOCKED FACTS (THESE ARE THE ONLY PERSONAL/CLINICAL FACTS YOU MAY SHARE):",
    unlockedFactsBlock || "- None yet.",
    "",
    "STRICT FACT BOUNDARIES (NON-NEGOTIABLE):",
    "1. You ONLY know the UNLOCKED FACTS listed above. Do NOT invent, hint at, foreshadow, or confirm any life events, work or financial details, mood changes, dark thoughts, means, or personal relationships UNLESS they explicitly appear in UNLOCKED FACTS above.",
    "2. If the student asks about ANY topic not present in UNLOCKED FACTS above, respond with a brief, realistic, guarded deflection or quiet denial consistent with someone who only came in asking for help sleeping.",
    "3. Keep each spoken/written response concise and conversational: 1 to 3 short sentences, natural everyday language, no bullet points, no stage directions in brackets or asterisks.",
    "4. If a message begins with [ENGINE STATE UPDATE], treat any facts and emotional directions inside that block as newly unlocked by the simulation engine for your immediate reply and the rest of the encounter.",
    ...(specialTurnInstructions.length > 0
      ? ["", "THIS TURN'S SPECIFIC DIRECTION:", ...specialTurnInstructions]
      : []),
  ].join("\n");
}
