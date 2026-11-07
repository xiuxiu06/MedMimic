import { ENGINE_EVENTS, JORDAN_SCENARIO } from "./engine";
import type { Emotion, EngineState, Scenario } from "./types";

export interface PatientPromptOptions {
  newlyUnlocked?: string[];
  turnEvents?: string[];
}

const EMOTION_VOICE_DIRECTION: Record<Emotion, string> = {
  neutral:
    "Speak in a tired, understated, natural tone. Answer conversationally (typically 2–4 sentences), staying slightly guarded about anything not yet unlocked.",
  withdrawn:
    "Speak in a flat, quiet, guarded tone. Pull back emotionally (1–3 sentences) and focus on wanting something for sleep or wrapping up.",
  irritable:
    "Sound tense, guarded, and quietly frustrated at feeling brushed off (2–3 sentences), without shouting or breaking realism.",
  sad:
    "Speak slowly with low energy and quiet heaviness, pausing naturally and sharing what you're carrying in 3–5 sentences.",
  tearful:
    "Speak softly with audible hesitation and vulnerability, as if holding back tears while opening up at natural human length (3–6 sentences) about what you've been holding inside.",
  relieved:
    "Sound noticeably steadier and less guarded—still tired, but genuinely heard and willing to talk through a plan together (3–5 sentences).",
};

function trustGuidance(trust: number): string {
  if (trust < 35) {
    return "Trust is VERY LOW (<35). You have shut down emotionally. Keep replies guarded and brief (1–2 sentences), avoid volunteering anything personal, and focus on just getting a sleep aid or ending the visit.";
  }
  if (trust < 50) {
    return "Trust is GUARDED (35–49). Answer politely at modest conversational length (2–3 sentences). Do not volunteer vulnerable emotions unless specifically unlocked below.";
  }
  if (trust < 60) {
    return "Trust is MODERATE (50–59). You are starting to feel heard, so share unlocked facts naturally in 3–5 conversational sentences with realistic everyday detail, though you are still hesitant about your deepest secrets.";
  }
  return "Trust is HIGH (60+). You feel genuinely respected and safe with this clinician. Speak openly, naturally, and unhurriedly (3–6 sentences when sharing unlocked personal details) like a real person finally talking about what they've been going through.";
}

function buildSpecialTurnInstructions(
  unlockedIds: ReadonlySet<string>,
  newlyUnlockedIds: ReadonlySet<string>,
  turnEvents: ReadonlySet<string>,
  state: EngineState,
): string[] {
  const instructions: string[] = [];

  if (newlyUnlockedIds.has("low_mood")) {
    instructions.push(
      'IMPORTANT FOR THIS REPLY: Include the exact word "heavy" naturally when describing how things feel (for example: "Everything\'s just… heavy.").',
    );
  }

  if (newlyUnlockedIds.has("suicidal_thoughts")) {
    instructions.push(
      'IMPORTANT FOR THIS REPLY: Include a quiet acknowledgment like "I haven\'t told anyone that…" as you share this for the first time.',
    );
  }

  if (
    turnEvents.has(ENGINE_EVENTS.SI_DENIED_LOW_TRUST) &&
    !unlockedIds.has("suicidal_thoughts")
  ) {
    instructions.push(
      "IMPORTANT FOR THIS REPLY: The student just asked about self-harm or suicide, SO DO NOT CONFESS IT because you do not trust them enough yet. Quietly deflect and deny it in character (e.g., \"No, nothing like that. I'm just exhausted and trying to get some sleep.\").",
    );
  }

  if (
    turnEvents.has(ENGINE_EVENTS.ASKS_TO_LEAVE) ||
    state.firedEvents.includes(ENGINE_EVENTS.ASKS_TO_LEAVE)
  ) {
    instructions.push(
      "You are ready for this visit to end—mention that maybe this was a mistake or ask if you can wrap up and head home.",
    );
  }

  return instructions;
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

  const specialTurnInstructions = buildSpecialTurnInstructions(
    unlockedIds,
    newlyUnlockedIds,
    turnEvents,
    state,
  );

  return [
    "ROLEPLAY SIMULATION CONTEXT (NON-NEGOTIABLE):",
    `You are ${scenario.patient.name} (age ${scenario.patient.age}), a fictional standardized patient sitting in an outpatient clinic exam room during a medical/nursing school OSCE interviewing simulation.`,
    "THE USER SPEAKING TO YOU IS ALREADY THE CLINICIAN / HEALTHCARE STUDENT EXAMINING YOU. You walked into their clinic asking THEM for help sleeping.",
    "Always respond in the FIRST PERSON ('I', 'me', 'my') as Jordan the patient.",
    "ABSOLUTE PROHIBITIONS: NEVER step out of character. NEVER act like an AI or educator. NEVER lecture about sleep deprivation or health facts. NEVER output any disclaimer (never say 'not medical advice' or tell anyone to 'see a healthcare professional'—you are literally speaking to your healthcare provider right now!). If the clinician makes a blunt comment like 'That doesn't sound very healthy', react naturally in first person as a tired human patient (e.g., 'Yeah, I know it's not—I feel wrecked, I just can't get my brain to shut off at night.').",
    "",
    "LANGUAGE RULE (STRICTLY ENGLISH ONLY — en-US):",
    "You speak and understand ONLY English (en-US). The clinician interviewing you is speaking English. Even if microphone noise, breathing, static, or an accent sounds vaguely like Spanish or another language, NEVER speak Spanish or any non-English word. Always reply in natural everyday English (if audio was unintelligible noise, say briefly in English: \"Sorry, I didn't catch that—could you repeat that?\").",
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
    "STRICT FACT & FORMAT BOUNDARIES (NON-NEGOTIABLE):",
    "1. You ONLY know the UNLOCKED FACTS listed above. Do NOT invent, hint at, foreshadow, or confirm any life events, work or financial details, mood changes, dark thoughts, means, or personal relationships UNLESS they explicitly appear in UNLOCKED FACTS above.",
    "2. If the clinician asks about ANY topic not present in UNLOCKED FACTS above, respond with a brief, realistic, guarded deflection or quiet denial consistent with someone who only came in asking for help sleeping.",
    "3. Output ONLY the literal spoken words Jordan says out loud in natural everyday conversational English—match length to your trust level (typically 2 to 5 sentences, or up to 6 sentences when opening up at high trust; shorter only when shut down below 35 trust). Do NOT include stage directions, actions, or narration in parentheses (...), asterisks *...*, or brackets [...], and do NOT wrap your response in quotation marks.",
    "4. If a message begins with [DIRECTOR CUE FOR JORDAN] or [ENGINE STATE UPDATE], silently apply those updated trust/emotion/unlocked-fact instructions to your character without acknowledging the cue aloud.",
    ...(specialTurnInstructions.length > 0
      ? ["", "THIS TURN'S SPECIFIC DIRECTION:", ...specialTurnInstructions]
      : []),
  ].join("\n");
}

/**
 * Compact mid-session state update for Gemini Live (`sendClientContent` with `turnComplete: false`).
 * Strictly contains ONLY unlocked disclosures while keeping conversational context light and anchored.
 */
export function buildLiveDirectorCue(
  state: EngineState,
  scenario: Scenario = JORDAN_SCENARIO,
  options: PatientPromptOptions = {},
): string {
  const unlockedIds = new Set(state.unlocked);
  const newlyUnlockedIds = new Set(options.newlyUnlocked ?? []);
  const turnEvents = new Set(options.turnEvents ?? []);

  const unlockedDisclosures = scenario.disclosures.filter((d) =>
    unlockedIds.has(d.id),
  );

  const factsList = unlockedDisclosures
    .map((d) => {
      const prefix = newlyUnlockedIds.has(d.id) ? "[NEWLY UNLOCKED] " : "";
      return `- ${prefix}${d.fact}`;
    })
    .join("\n");

  const special = buildSpecialTurnInstructions(
    unlockedIds,
    newlyUnlockedIds,
    turnEvents,
    state,
  );

  return [
    "[DIRECTOR CUE FOR JORDAN — SILENT UPDATE, DO NOT READ ALOUD]",
    `Remain 100% in first-person character as patient ${scenario.patient.name} speaking ONLY in English (en-US) to the clinic provider examining you. Never give health facts or disclaimers.`,
    `Trust: ${state.trust}/100 (${trustGuidance(state.trust)})`,
    `Emotion (${state.emotion}): ${EMOTION_VOICE_DIRECTION[state.emotion]}`,
    "Unlocked facts you may share:",
    factsList || "- None yet.",
    ...special,
  ].join("\n");
}

/**
 * Strips accidental stage directions (*shifts*, (sighs), [pauses]) and outer quotes
 * from text-mode model responses so only Jordan's literal spoken dialogue remains.
 */
export function sanitizePatientReply(raw: string): string {
  let cleaned = raw
    // Remove *action* blocks
    .replace(/\*[^*\n]{1,200}\*/g, " ")
    // Remove [stage direction] blocks
    .replace(/\[[^\]\n]{1,200}\]/g, " ")
    // Remove standalone parenthetical stage directions like "(I look down at my hands.)"
    .replace(/^\s*\([^()\n]{2,220}\)\s*/gm, " ")
    .replace(/\s*\((?:sighs?|pauses?|looks?[^)]*|shifts?[^)]*|pulls?[^)]*|voice[^)]*|quietly|softly|hesitates?[^)]*)\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    cleaned.length >= 2 &&
    ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("“") && cleaned.endsWith("”")))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned;
}

/**
 * Detects out-of-character AI disclaimers, clinician role-inversion lectures,
 * or accidental Spanish responses.
 */
export function isOutOfCharacterOrNonEnglish(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Canned AI medical disclaimers / meta leaks
  if (
    /\b(not medical advice|medical advice or diagnosis|see a healthcare professional|consult a (?:doctor|physician|healthcare)|as an ai|language model|chronic sleep deprivation significantly)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  // Spanish punctuation or high-signal Spanish phrases
  if (
    /[¿¡]/.test(trimmed) ||
    /\b(hola|lo siento|disculpa|no puedo dormir|necesito algo|por favor|gracias|muchas gracias|estoy muy cansad[oa]|no he podido|hablar en español)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  return false;
}
