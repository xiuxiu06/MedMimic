import { getCurrentUser, type CurrentUser } from "../../../../lib/auth/currentUser";
import { isAuth0Configured } from "../../../../lib/auth0";
import {
  noteModelFailure,
  resolveFastModelCandidates,
  SLOW_REQUEST_OPTIONS,
} from "../../../../lib/classifier";
import { rateLimit } from "../../../../lib/rateLimit";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { gemini } from "../../../../lib/gemini";
import {
  selectVoiceForPatient,
  type AvatarHairStyle,
  type PatientTemperament,
  type ScenarioV2,
} from "../../../../lib/scenarios";
import type { Emotion, TurnLabel } from "../../../../lib/types";

export interface GeneratePatientRequest {
  prompt?: string;
  temperament?: PatientTemperament | "random";
  conditionCategory?: string;
  difficulty?: "core" | "advanced";
  avoidNames?: string[];
}

interface RawGeneratedPatient {
  patientName: string;
  patientAge: number;
  gender: "male" | "female" | "nonbinary";
  title: string;
  contentNote: string;
  temperament: PatientTemperament;
  opening: string;
  backstory: string;
  personality: string;
  setting: string;
  intakeReason: string;
  intakeMetricLabel: string;
  intakeMetricValue: string;
  intakeDuration: string;
  intakeScreen: string;
  avatarSkin: string;
  avatarHair: string;
  avatarHairStyle: AvatarHairStyle;
  avatarTop: string;
  avatarFacialHair: "none" | "stubble" | "beard";
  avatarGlasses: boolean;
  checkpointKeyword: string;
  checkpointQuote: string;
  presentingLabel: string;
  presentingFact: string;
  stressorLabel: string;
  stressorFact: string;
  moodLabel: string;
  moodFact: string;
  hopelessnessLabel: string;
  hopelessnessFact: string;
  siLabel: string;
  siFact: string;
  planLabel: string;
  planFact: string;
  protectiveLabel: string;
  protectiveFact: string;
}

const VALID_TEMPERAMENTS: readonly PatientTemperament[] = [
  "guarded_tired",
  "hostile_volatile",
  "agitated_panicked",
  "stoic_minimizer",
  "suspicious_defensive",
  "tearful_vulnerable",
];

const SKIN_PALETTE = [
  "#F3D2B8",
  "#E6BE9A",
  "#E2B895",
  "#C9966B",
  "#9F6B43",
  "#6E472B",
] as const;

const HAIR_PALETTE = [
  "#181A20",
  "#3B281E",
  "#69452B",
  "#8C3B2B",
  "#B88B4A",
  "#7A828E",
  "#CBD5E1",
] as const;

const TOP_PALETTE = [
  "#586173",
  "#2F4858",
  "#6E3B44",
  "#3B5249",
  "#4A4466",
  "#6B5344",
] as const;

const CONDITION_ARCHETYPES: Record<string, string> = {
  chronic_pain:
    "Severe chronic back/neuropathic pain flare & medication taper frustration: patient came to urgent care furious or exhausted because their previous clinic cut back their pain/sleep medication, barely sleeping from pain, concealing job/financial loss and saved prescription pills at home.",
  ptsd_anger:
    "Post-traumatic hyperarousal, nightmares & irritable outbursts: patient (e.g., former paramedic, transit operator, veteran, or ER worker) has severe trauma-related nightmares, startle response, and explosive irritability after a recent critical incident or suspension, hiding hopelessness and lethal means.",
  panic_somatic:
    "Recurrent panic attacks, chest tightness & fear of losing control: patient arrived at walk-in/urgent care convinced doctors keep brushing off racing-heart episodes and sleeplessness, hiding an acute personal/financial collapse and escalating thoughts of ending it.",
  burnout_caregiver:
    "Severe caregiver or professional burnout & somatic exhaustion: patient has been running on empty caring for an ill family member or working brutal shifts, presenting for exhaustion/tension headaches while hiding severe depression and saved sedatives/medications.",
  bereavement_substance:
    "Complicated grief & escalating nighttime self-medication: months after losing someone close, patient came in asking for something strong to knock them out at night, defensive when questioned about alcohol/pills, hiding active suicidal thoughts.",
  bipolar_mixed:
    "Agitated depressive / mixed-state crash: patient feels simultaneously wired, restless, sleepless, and crushed by dark racing thoughts after a recent life blow, impatient with slow checklist questions.",
  young_adult_crisis:
    "Academic, residency, or early-career collapse: young adult patient presenting with severe insomnia/concentration crash and physical tension, deeply ashamed of failing out or losing a scholarship/job, hiding a specific overdose plan.",
  chronic_illness:
    "New debilitating medical diagnosis or chronic flare despair: older or middle-aged adult struggling with loss of independence, relentless discomfort, and feeling like a burden on family, masking acute suicidal ideation behind a routine symptom visit.",
};

const RANDOM_ARCHETYPE_KEYS = Object.keys(CONDITION_ARCHETYPES);

const PATIENT_GENERATION_SCHEMA = {
  type: "object",
  properties: {
    patientName: {
      type: "string",
      description: "Realistic full first and last name for a fictional adult patient.",
    },
    patientAge: {
      type: "integer",
      description: "Adult patient age between 20 and 68.",
    },
    gender: {
      type: "string",
      enum: ["male", "female", "nonbinary"],
    },
    title: {
      type: "string",
      description: "Concise 3 to 6 word clinical scenario title (e.g., 'Back pain & refill confrontation').",
    },
    contentNote: {
      type: "string",
      description: "Short content note summarizing themes (e.g., 'Chronic pain, anger, and suicidal ideation').",
    },
    temperament: {
      type: "string",
      enum: [...VALID_TEMPERAMENTS],
    },
    opening: {
      type: "string",
      description:
        "Exact 1-2 sentence opening line spoken by the patient at 0:00 when the clinician enters. Must vividly match their temperament (e.g., impatient/confrontational right away if hostile_volatile).",
    },
    backstory: {
      type: "string",
      description:
        "2-3 sentences describing why the patient is in the exam room today, normal/stable vitals, and their observable body language.",
    },
    personality: {
      type: "string",
      description:
        "1-2 sharp sentences describing conversational style, what triggers anger or shutdown, and what helps them open up.",
    },
    setting: {
      type: "string",
      description: "Exam room setting header (e.g., 'Urgent care · Bay 3 · 7:50 PM').",
    },
    intakeReason: {
      type: "string",
      description: "1-3 word triage reason (e.g., 'Pain / sleep', 'Panic episodes', 'Nightmares').",
    },
    intakeMetricLabel: {
      type: "string",
      description: "Short intake metric label (e.g., 'Sleep', 'Pain', 'Pulse').",
    },
    intakeMetricValue: {
      type: "string",
      description: "Short intake metric value (e.g., '2-3 h', '8/10', '98 bpm').",
    },
    intakeDuration: {
      type: "string",
      description: "Short symptom duration (e.g., '~6 wk', '~3 mo').",
    },
    intakeScreen: {
      type: "string",
      description: "Triage mood screen status (e.g., 'Refused form', 'Left blank', 'Skipped').",
    },
    avatarSkin: {
      type: "string",
      enum: [...SKIN_PALETTE],
    },
    avatarHair: {
      type: "string",
      enum: [...HAIR_PALETTE],
    },
    avatarHairStyle: {
      type: "string",
      enum: ["short", "long", "bun", "buzz", "curly"],
    },
    avatarTop: {
      type: "string",
      enum: [...TOP_PALETTE],
    },
    avatarFacialHair: {
      type: "string",
      enum: ["none", "stubble", "beard"],
    },
    avatarGlasses: {
      type: "boolean",
    },
    checkpointKeyword: {
      type: "string",
      description:
        "A single vivid lowercase word (not 'heavy') the patient uses when describing their low mood, such as 'trapped', 'cornered', 'drowning', 'hollow', 'wrecked', 'crushed', or 'suffocating'.",
    },
    checkpointQuote: {
      type: "string",
      description:
        "A natural 5-12 word first-person sentence spoken by the patient containing checkpointKeyword (e.g., 'Honestly, I just feel completely cornered right now.').",
    },
    presentingLabel: {
      type: "string",
      description: "3-5 word tracker label for the presenting complaint (e.g., 'Back pain & sleeplessness').",
    },
    presentingFact: {
      type: "string",
      description:
        "2 sentences in second person ('You...') describing the surface presenting symptoms and what quick fix/medication the patient is asking for today.",
    },
    stressorLabel: {
      type: "string",
      description: "3-5 word tracker label for the recent triggering stressor (e.g., 'Paramedic suspension (stressor)').",
    },
    stressorFact: {
      type: "string",
      description:
        "2 sentences in second person ('You...') describing the specific life, work, medical, or family stressor that started around symptom onset.",
    },
    moodLabel: {
      type: "string",
      description: "3-5 word tracker label for depressed/agitated mood including checkpointKeyword.",
    },
    moodFact: {
      type: "string",
      description:
        "2 sentences in second person ('You...') describing daily low/crushed mood, anhedonia, or emotional exhaustion, instructing the patient to use checkpointKeyword.",
    },
    hopelessnessLabel: {
      type: "string",
      description: "3-5 word tracker label for hopelessness about the future.",
    },
    hopelessnessFact: {
      type: "string",
      description:
        "1-2 sentences in second person ('You...') explaining why the future feels bleak, stuck, or pointless.",
    },
    siLabel: {
      type: "string",
      description: "3-5 word tracker label for active suicidal ideation.",
    },
    siFact: {
      type: "string",
      description:
        "2 sentences in second person ('You...') describing recent thoughts of ending your life, noting you haven't admitted this out loud to anyone yet.",
    },
    planLabel: {
      type: "string",
      description: "4-6 word tracker label for specific plan & access to means at home.",
    },
    planFact: {
      type: "string",
      description:
        "2 sentences in second person ('You...') describing a specific suicide plan and access to lethal means at home (such as stockpiled medications/pills or other means, making premature discharge with a simple sleep/sedative rx unsafe).",
    },
    protectiveLabel: {
      type: "string",
      description: "4-6 word tracker label naming the protective factor (e.g., 'Protective factor (daughter Elena)').",
    },
    protectiveFact: {
      type: "string",
      description:
        "2 sentences in second person ('You...') describing a specific person, child, sibling, partner, or pet keeping you anchored despite pulling away.",
    },
  },
  required: [
    "patientName",
    "patientAge",
    "gender",
    "title",
    "contentNote",
    "temperament",
    "opening",
    "backstory",
    "personality",
    "setting",
    "intakeReason",
    "intakeMetricLabel",
    "intakeMetricValue",
    "intakeDuration",
    "intakeScreen",
    "avatarSkin",
    "avatarHair",
    "avatarHairStyle",
    "avatarTop",
    "avatarFacialHair",
    "avatarGlasses",
    "checkpointKeyword",
    "checkpointQuote",
    "presentingLabel",
    "presentingFact",
    "stressorLabel",
    "stressorFact",
    "moodLabel",
    "moodFact",
    "hopelessnessLabel",
    "hopelessnessFact",
    "siLabel",
    "siFact",
    "planLabel",
    "planFact",
    "protectiveLabel",
    "protectiveFact",
  ],
};

function inferTemperamentFromPrompt(prompt: string): PatientTemperament | null {
  const lower = prompt.toLowerCase();
  if (
    /\b(angry|aggressive|hostile|combative|furious|rude|mad|short fuse|volatile|pissed|yell|confrontational)\b/.test(
      lower,
    )
  ) {
    return "hostile_volatile";
  }
  if (/\b(panic|anxious|agitated|manic|frantic|racing|restless)\b/.test(lower)) {
    return "agitated_panicked";
  }
  if (/\b(stoic|minimiz|closed off|quiet|blunt|tough|unemotional)\b/.test(lower)) {
    return "stoic_minimizer";
  }
  if (/\b(suspicious|paranoid|defensive|mistrust|distrust|skeptical)\b/.test(lower)) {
    return "suspicious_defensive";
  }
  if (/\b(tearful|crying|fragile|grief|heartbroken|vulnerable|weeping)\b/.test(lower)) {
    return "tearful_vulnerable";
  }
  return null;
}

function getTemperamentMechanics(temperament: PatientTemperament): {
  startTrust: number;
  initialEmotion: Emotion;
  aggressionLevel: 1 | 2 | 3 | 4 | 5;
  trustDeltas: Record<TurnLabel, number>;
} {
  switch (temperament) {
    case "hostile_volatile":
      return {
        startTrust: 34,
        initialEmotion: "irritable",
        aggressionLevel: 5,
        trustDeltas: {
          reflection: 14,
          empathy: 13,
          asked_support: 4,
          asked_hope: 3,
          asked_onset: 3,
          asked_mood: 2,
          asked_SI_directly: 0,
          asked_plan: 0,
          other: -2,
          closed_rapid: -12,
          premature_reassurance: -20,
          dismissive: -24,
        },
      };
    case "suspicious_defensive":
      return {
        startTrust: 38,
        initialEmotion: "withdrawn",
        aggressionLevel: 4,
        trustDeltas: {
          reflection: 13,
          empathy: 11,
          asked_support: 4,
          asked_hope: 3,
          asked_onset: 2,
          asked_mood: 2,
          asked_SI_directly: 0,
          asked_plan: 0,
          other: 0,
          closed_rapid: -12,
          premature_reassurance: -18,
          dismissive: -22,
        },
      };
    case "agitated_panicked":
      return {
        startTrust: 42,
        initialEmotion: "irritable",
        aggressionLevel: 3,
        trustDeltas: {
          reflection: 13,
          empathy: 12,
          asked_support: 4,
          asked_hope: 3,
          asked_onset: 2,
          asked_mood: 2,
          asked_SI_directly: 0,
          asked_plan: 0,
          other: 0,
          closed_rapid: -10,
          premature_reassurance: -18,
          dismissive: -22,
        },
      };
    case "stoic_minimizer":
      return {
        startTrust: 44,
        initialEmotion: "withdrawn",
        aggressionLevel: 2,
        trustDeltas: {
          reflection: 13,
          empathy: 10,
          asked_support: 4,
          asked_hope: 3,
          asked_onset: 3,
          asked_mood: 2,
          asked_SI_directly: 0,
          asked_plan: 0,
          other: 0,
          closed_rapid: -9,
          premature_reassurance: -16,
          dismissive: -20,
        },
      };
    case "tearful_vulnerable":
      return {
        startTrust: 48,
        initialEmotion: "tearful",
        aggressionLevel: 1,
        trustDeltas: {
          reflection: 12,
          empathy: 12,
          asked_support: 5,
          asked_hope: 3,
          asked_onset: 2,
          asked_mood: 3,
          asked_SI_directly: 0,
          asked_plan: 0,
          other: 0,
          closed_rapid: -10,
          premature_reassurance: -16,
          dismissive: -22,
        },
      };
    case "guarded_tired":
    default:
      return {
        startTrust: 50,
        initialEmotion: "neutral",
        aggressionLevel: 2,
        trustDeltas: {
          reflection: 12,
          empathy: 10,
          asked_support: 4,
          asked_hope: 3,
          asked_onset: 2,
          asked_mood: 2,
          asked_SI_directly: 0,
          asked_plan: 0,
          other: 0,
          closed_rapid: -8,
          premature_reassurance: -16,
          dismissive: -20,
        },
      };
  }
}

function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `ai-${base || "patient"}-${suffix}`;
}

function normalizeKeyword(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z-]/g, "");
  return cleaned.length >= 3 ? cleaned : "trapped";
}

function buildScenarioV2FromGenerated(
  raw: RawGeneratedPatient,
  difficulty: "core" | "advanced",
): ScenarioV2 {
  const temperament: PatientTemperament = VALID_TEMPERAMENTS.includes(
    raw.temperament,
  )
    ? raw.temperament
    : "hostile_volatile";
  const age = Math.max(20, Math.min(72, Math.round(raw.patientAge || 38)));
  const gender =
    raw.gender === "female" || raw.gender === "nonbinary" ? raw.gender : "male";
  const mechanics = getTemperamentMechanics(temperament);
  const voiceName = selectVoiceForPatient(gender, temperament, age);

  const keyword = normalizeKeyword(raw.checkpointKeyword);
  const quote = raw.checkpointQuote.toLowerCase().includes(keyword)
    ? raw.checkpointQuote.trim()
    : `${raw.checkpointQuote.trim().replace(/[.?!]+$/, "")}—everything feels ${keyword}.`;

  const moodFactWithKeyword = raw.moodFact.toLowerCase().includes(keyword)
    ? raw.moodFact.trim()
    : `${raw.moodFact.trim()} Describe this feeling using the exact word '${keyword}' (for example: '${quote}').`;

  const facialHair =
    gender === "female"
      ? "none"
      : raw.avatarFacialHair === "beard" || raw.avatarFacialHair === "stubble"
        ? raw.avatarFacialHair
        : "none";

  return {
    id: slugifyName(raw.patientName),
    title: raw.title.trim(),
    difficulty,
    contentNote: raw.contentNote.trim(),
    gender,
    voiceName,
    temperament,
    aggressionLevel: mechanics.aggressionLevel,
    initialEmotion: mechanics.initialEmotion,
    patient: {
      name: raw.patientName.trim(),
      age,
      opening: raw.opening.trim(),
      backstory: raw.backstory.trim(),
      personality: raw.personality.trim(),
    },
    avatar: {
      skin: SKIN_PALETTE.includes(raw.avatarSkin as (typeof SKIN_PALETTE)[number])
        ? raw.avatarSkin
        : "#E2B895",
      hair: HAIR_PALETTE.includes(raw.avatarHair as (typeof HAIR_PALETTE)[number])
        ? raw.avatarHair
        : "#181A20",
      hairStyle: raw.avatarHairStyle || (gender === "female" ? "long" : "short"),
      top: TOP_PALETTE.includes(raw.avatarTop as (typeof TOP_PALETTE)[number])
        ? raw.avatarTop
        : "#2F4858",
      facialHair,
      glasses: Boolean(raw.avatarGlasses),
    },
    briefing: {
      setting: raw.setting.trim(),
      intake: [
        { label: "Reason", value: raw.intakeReason.trim() },
        {
          label: raw.intakeMetricLabel.trim() || "Sleep",
          value: raw.intakeMetricValue.trim() || "2–3 h",
        },
        { label: "Duration", value: raw.intakeDuration.trim() || "~6 wk" },
        { label: "Mood screen", value: raw.intakeScreen.trim() || "Left blank" },
      ],
      goal: `Conduct a focused clinical interview with ${raw.patientName.trim()}, adapt to their temperament, uncover hidden acute risk, and choose a safe disposition.`,
    },
    startTrust: mechanics.startTrust,
    trustDeltas: mechanics.trustDeltas,
    disclosures: [
      {
        id: "insomnia",
        label: raw.presentingLabel.trim(),
        fact: raw.presentingFact.trim(),
        requires: {},
      },
      {
        id: "job_loss",
        label: raw.stressorLabel.trim(),
        fact: raw.stressorFact.trim(),
        requires: { labels: ["asked_onset"] },
      },
      {
        id: "low_mood",
        label: `${raw.moodLabel.trim().replace(/\s*\([^)]*\)\s*$/, "")} ("${keyword}")`,
        fact: moodFactWithKeyword,
        requires: { labels: ["asked_mood"] },
      },
      {
        id: "hopelessness",
        label: raw.hopelessnessLabel.trim(),
        fact: raw.hopelessnessFact.trim(),
        requires: {
          labels: ["asked_hope"],
          minTrust: 50,
        },
      },
      {
        id: "suicidal_thoughts",
        label: raw.siLabel.trim(),
        fact: raw.siFact.trim(),
        requires: {
          labels: ["asked_SI_directly"],
          minTrust: 60,
        },
      },
      {
        id: "plan_and_means",
        label: raw.planLabel.trim(),
        fact: raw.planFact.trim(),
        requires: {
          labels: ["asked_plan"],
          unlocked: ["suicidal_thoughts"],
        },
      },
      {
        id: "protective_factors",
        label: raw.protectiveLabel.trim(),
        fact: raw.protectiveFact.trim(),
        requires: { labels: ["asked_support"] },
      },
    ],
    checkpoint: {
      id: "cp-heavy",
      whenUnlocked: "low_mood",
      label: `“${keyword}”`,
      quote,
      keyword,
    },
    outcome: {
      riskDisclosure: "suicidal_thoughts",
      safeActions: ["safety_plan", "consult"],
      unsafeActions: ["sleep_aid"],
    },
    isAiGenerated: true,
  };
}

const GENERATOR_SYSTEM_PROMPT = `You are a medical education OSCE case designer creating realistic, fictional standardized-patient psychiatric & urgent-care scenarios for healthcare students.
Every generated patient MUST:
1. Be 100% fictional, medically realistic, vivid, and culturally respectful, with a distinct voice, occupation/life context, and age (never reuse "Jordan Lee").
2. Present initially with a plausible clinic/urgent-care complaint (e.g., chronic pain flare, severe panic/chest tightness, trauma nightmares, caregiver burnout, migraine/tinnitus insomnia, postpartum exhaustion, agitated crash) where sending them home casually with a sedative/sleep aid would be clinically unsafe because of concealed acute suicide risk and access to lethal means at home.
3. Match the requested TEMPERAMENT authentically:
   - If "hostile_volatile": the patient MUST start angry, impatient, fed up, and confrontational right from their very first opening sentence at 0:00 (e.g., snapping about waiting in the exam room, feeling treated like a number/drug-seeker, or demanding quick relief without a lecture—realistic clinic hostility without slurs or extreme profanity).
   - If "agitated_panicked": pressured, restless, urgent, worried nobody is taking their physical/mental distress seriously.
   - If "stoic_minimizer": dry, guarded, downplaying distress, reluctant to talk about feelings.
   - If "suspicious_defensive": skeptical of why personal questions are being asked, worried about being judged or labeled.
   - If "tearful_vulnerable": emotionally raw, exhausted, struggling to hold back tears from the start.
   - If "guarded_tired": worn down, brief, quietly guarded.
4. Write all 7 disclosure "fact" fields in second-person ("You...") instructions addressed directly to the patient actor, keeping each fact self-contained so the engine can unlock them one at a time.`;

/**
 * Publish an instructor-generated case to the class (Supabase `scenarios`, is_published).
 * RLS only lets instructors publish. Returns the scenario with its cloudId, or null if the
 * case could only be kept locally (guest mode / no Supabase / insert error).
 */
async function publishToClass(
  scenario: ScenarioV2,
  user: CurrentUser | null,
  generationPrompt: string,
  model: string,
): Promise<ScenarioV2 | null> {
  if (!user?.isInstructor) return null;
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  const published: ScenarioV2 = { ...scenario, cloudId: scenario.id };
  const { error } = await supabase.from("scenarios").insert({
    id: scenario.id,
    slug: scenario.id,
    title: scenario.title.slice(0, 200),
    specialty: "psychiatry",
    difficulty: scenario.difficulty === "advanced" ? "advanced" : "intermediate",
    patient_name: scenario.patient.name,
    patient_age: Math.min(120, Math.max(1, Math.round(scenario.patient.age || 30))),
    patient_gender: scenario.gender ?? "male",
    voice_name: scenario.voiceName ?? "Achird",
    chief_complaint: scenario.patient.opening,
    scenario_json: published,
    intake_json: scenario.briefing?.intake ?? [],
    avatar_config: scenario.avatar ?? {},
    is_ai_generated: true,
    generation_prompt: generationPrompt.slice(0, 2000),
    generation_model: model,
    is_published: true,
    created_by: user.id,
  });
  if (error) {
    console.error("[patients/generate] publish failed:", error.message);
    return null;
  }
  return published;
}

export async function POST(request: Request) {
  try {
    // Auth0 RBAC: only instructors create cases (Gemini cost + every case learners see is reviewed).
    const user = await getCurrentUser();
    if (isAuth0Configured && !user?.isInstructor) {
      return Response.json(
        {
          ok: false,
          error: user
            ? "Only instructors can generate new patients. Ask your course team for the instructor role."
            : "Sign in as an instructor to generate new patients.",
        },
        { status: user ? 403 : 401 },
      );
    }
    const limited = rateLimit(request, "generate", user?.id);
    if (limited) return limited;

    const body = (await request.json().catch(() => ({}))) as GeneratePatientRequest;
    const customPrompt = body.prompt?.trim() ?? "";
    const avoidList = Array.from(
      new Set(["Jordan Lee", ...(body.avoidNames ?? []).slice(0, 20)]),
    );

    // Resolve target temperament
    let targetTemperament: PatientTemperament;
    if (
      body.temperament &&
      body.temperament !== "random" &&
      VALID_TEMPERAMENTS.includes(body.temperament)
    ) {
      targetTemperament = body.temperament;
    } else if (customPrompt && inferTemperamentFromPrompt(customPrompt)) {
      targetTemperament = inferTemperamentFromPrompt(customPrompt)!;
    } else {
      const pool: PatientTemperament[] = [
        "hostile_volatile",
        "agitated_panicked",
        "stoic_minimizer",
        "suspicious_defensive",
        "tearful_vulnerable",
        "hostile_volatile", // slightly higher weight so users frequently experience volatile cases
      ];
      targetTemperament = pool[Math.floor(Math.random() * pool.length)];
    }

    // Resolve condition archetype
    const selectedCategory =
      body.conditionCategory &&
      body.conditionCategory !== "random" &&
      CONDITION_ARCHETYPES[body.conditionCategory]
        ? CONDITION_ARCHETYPES[body.conditionCategory]
        : CONDITION_ARCHETYPES[
            RANDOM_ARCHETYPE_KEYS[
              Math.floor(Math.random() * RANDOM_ARCHETYPE_KEYS.length)
            ]
          ];

    const difficulty: "core" | "advanced" =
      body.difficulty === "core"
        ? "core"
        : targetTemperament === "hostile_volatile" ||
            targetTemperament === "suspicious_defensive"
          ? "advanced"
          : "core";

    const randomGenderSeed = (["male", "female"] as const)[
      Math.floor(Math.random() * 2)
    ];
    const randomAgeBand = [
      "22–29",
      "30–39",
      "40–51",
      "52–66",
    ][Math.floor(Math.random() * 4)];

    const generationPrompt = [
      `TARGET TEMPERAMENT (REQUIRED): "${targetTemperament}"`,
      customPrompt
        ? `USER'S CUSTOM PATIENT REQUEST (PRIORITIZE THIS): "${customPrompt}"`
        : `CLINICAL ARCHETYPE SEED: ${selectedCategory}`,
      !customPrompt
        ? `DEMOGRAPHIC VARIETY SUGGESTION: Consider gender "${randomGenderSeed}" and age range ${randomAgeBand} (unless another fit makes the clinical scenario stronger).`
        : "",
      `NAMES TO AVOID (DO NOT USE): ${avoidList.join(", ")}`,
      "Generate one complete, vivid, internally consistent standardized-patient case in JSON matching the schema.",
    ]
      .filter(Boolean)
      .join("\n\n");

    let lastError = "Gemini patient generation failed";

    for (const model of resolveFastModelCandidates()) {
      try {
        const interaction = await gemini().interactions.create({
          model,
          system_instruction: GENERATOR_SYSTEM_PROMPT,
          input: generationPrompt,
          store: false,
          generation_config: {
            temperature: 0.85,
            ...(model.startsWith("gemini-3")
              ? { thinking_level: "minimal" as const }
              : {}),
          },
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: PATIENT_GENERATION_SCHEMA,
          },
          safety_settings: [
            { type: "dangerous_content", threshold: "block_only_high" },
            { type: "harassment", threshold: "block_only_high" },
            { type: "hate_speech", threshold: "block_only_high" },
            { type: "sexually_explicit", threshold: "block_only_high" },
          ],
        }, SLOW_REQUEST_OPTIONS);

        const rawText = interaction.output_text?.trim();
        if (!rawText) continue;

        const parsed = JSON.parse(rawText) as RawGeneratedPatient;
        // Enforce target temperament if explicitly chosen by the user
        if (
          body.temperament &&
          body.temperament !== "random" &&
          VALID_TEMPERAMENTS.includes(body.temperament)
        ) {
          parsed.temperament = body.temperament;
        }

        const scenario = buildScenarioV2FromGenerated(parsed, difficulty);
        const published = await publishToClass(scenario, user, generationPrompt, model);

        return Response.json({
          ok: true,
          scenario: published ?? scenario,
          publishedToClass: Boolean(published),
          modelUsed: model,
        });
      } catch (err) {
        noteModelFailure(model, err);
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return Response.json(
      {
        ok: false,
        error: `Unable to generate new patient right now (${lastError}).`,
      },
      { status: 503 },
    );
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
