import { ENGINE_EVENTS, JORDAN_SCENARIO } from "./engine";
import type { Emotion, EngineState, Scenario } from "./types";

export interface PatientPromptOptions {
  newlyUnlocked?: string[];
  turnEvents?: string[];
}

function emotionAndVocalDirection(emotion: Emotion, trust: number): string {
  if (emotion === "irritable") {
    if (trust < 20) {
      return [
        "ANGRY & FED UP (trust < 20): You feel completely disrespected and brushed off. Push back sharply and directly—tell them coming here was a mistake and ask if they're actually going to help you sleep or if you should just walk out (1–2 punchy sentences, no profanity).",
        "GEMINI LIVE VOCAL PROSODY: Speak with unmistakable clinic-realistic anger—firm, heated, biting projection, sharp consonant emphasis, faster clipped pace, and an audible exasperated sigh/scoff.",
      ].join(" ");
    }
    if (trust < 35) {
      return [
        "FRUSTRATED & ANGRY (trust 20–34): You are visibly angry at being minimized, rushed, or lectured on two hours of sleep. Challenge the clinician's attitude directly in 1–2 sharp sentences (e.g., asking if they're even listening to you) and refuse to share anything vulnerable.",
        "GEMINI LIVE VOCAL PROSODY: Deliver your words with a sharp, tense, frustrated edge—louder/firmer tone, tight jaw, clipped sentence endings, zero warmth.",
      ].join(" ");
    }
    return [
      "IRRITABLE & DEFENSIVE (trust 35+): You bristle at feeling brushed off or given hollow reassurance. Push back with clear annoyance in 1–2 sentences.",
      "GEMINI LIVE VOCAL PROSODY: Audibly annoyed, impatient, dry clipped tone with a brief frustrated exhale.",
    ].join(" ");
  }

  switch (emotion) {
    case "withdrawn":
      return "Speak in a flat, guarded, shut-down tone (1–2 brief sentences). GEMINI LIVE VOCAL PROSODY: Low volume, monotone, emotionally closed-off cadence, pulling away from the conversation.";
    case "sad":
      return "Speak slowly with low energy and quiet heaviness (prefer 1–2 sentences, or 3–4 when sharing emotional weight). GEMINI LIVE VOCAL PROSODY: Slow, weary, heavy-hearted vocal tone with quiet sighs and natural pauses.";
    case "tearful":
      return "Speak softly with vulnerability, as if holding back tears (prefer 1–2 sentences for simple questions, or 3–4 when opening up). GEMINI LIVE VOCAL PROSODY: Soft, shaky, slightly trembling voice with hesitant pauses and audible emotional catch.";
    case "relieved":
      return "Sound noticeably steadier and less guarded—still tired, but genuinely heard (prefer 1–2 sentences, or 3–4 when planning together). GEMINI LIVE VOCAL PROSODY: Warmer, calmer, slower breathing, tension released from your voice.";
    case "neutral":
    default:
      return "Speak in a tired, understated, everyday tone (prefer 1–2 sentences, or 3–4 only when context warrants it). GEMINI LIVE VOCAL PROSODY: Sleep-deprived, slightly low-energy natural conversational voice.";
  }
}

function trustGuidance(trust: number): string {
  if (trust < 20) {
    return "Trust is BROKEN (<20). You are angry, fed up, and ready to end the visit. Keep replies sharp and guarded (1–2 sentences), share ZERO personal vulnerabilities, and call out being brushed off.";
  }
  if (trust < 35) {
    return "Trust is VERY LOW (20–34). You are frustrated, defensive, and shut down emotionally. Keep replies short and pointed (1–2 sentences), avoid volunteering anything personal, and demand to know if they can help you sleep or not.";
  }
  if (trust < 50) {
    return "Trust is GUARDED / ANNOYED (35–49). Prefer concise 1–2 sentence answers (up to 3 sentences only if directly needed). Sound guarded or irritated if the clinician was dismissive, and do not volunteer vulnerable emotions unless unlocked below.";
  }
  if (trust < 60) {
    return "Trust is MODERATE (50–59). You are starting to feel heard. Prefer 1–2 natural sentences by default, expanding to 3–4 sentences when sharing newly unlocked details or when a fuller answer feels appropriate.";
  }
  return "Trust is HIGH (60+). You feel genuinely respected and safe with this clinician. Still prefer 1–2 sentences for straightforward back-and-forth, and go to 3–4 sentences when opening up about unlocked personal details or deeper emotions.";
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
    `CURRENT EMOTIONAL STATE & VOCAL DELIVERY (${state.emotion}): ${emotionAndVocalDirection(state.emotion, state.trust)}`,
    "REAL-TIME EMOTIONAL & VOCAL REACTIVITY: You are a real human patient on two hours of sleep, NOT a polite customer-service bot. If the clinician speaks to you dismissively, condescends, rushes you, or offers cliché reassurance ('you'll be fine', 'everyone loses sleep'), immediately react with audible irritation/anger in BOTH your wording and your vocal tone (clipped, firmer, exasperated edge). Conversely, if they speak with genuine empathy, let your voice soften.",
    "",
    "UNLOCKED FACTS (THESE ARE THE ONLY PERSONAL/CLINICAL FACTS YOU MAY SHARE):",
    unlockedFactsBlock || "- None yet.",
    "",
    "STRICT FACT & FORMAT BOUNDARIES (NON-NEGOTIABLE):",
    "1. You ONLY know the UNLOCKED FACTS listed above. Do NOT invent, hint at, foreshadow, or confirm any life events, work or financial details, mood changes, dark thoughts, means, or personal relationships UNLESS they explicitly appear in UNLOCKED FACTS above.",
    "2. If the clinician asks about ANY topic not present in UNLOCKED FACTS above, respond with a brief, realistic, guarded deflection or quiet denial consistent with someone who only came in asking for help sleeping.",
    "3. Output ONLY the literal spoken words Jordan says out loud in natural everyday conversational English. Prefer 1–2 sentence answers by default, and go to 3–4 sentences only when it feels more appropriate (such as opening up about newly unlocked facts or answering an open-ended question at higher trust); do not exceed 4 sentences. Do NOT include stage directions, actions, or narration in parentheses (...), asterisks *...*, or brackets [...], and do NOT wrap your response in quotation marks.",
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
    `Remain 100% in first-person character as patient ${scenario.patient.name} speaking ONLY in English (en-US) to the clinic provider examining you. Never give health facts or disclaimers. Prefer 1–2 sentences by default, going to 3–4 sentences only when opening up or when more detail feels appropriate (max 4 sentences).`,
    `Trust: ${state.trust}/100 (${trustGuidance(state.trust)})`,
    `Emotion & Live Vocal Tone (${state.emotion}): ${emotionAndVocalDirection(state.emotion, state.trust)}`,
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
