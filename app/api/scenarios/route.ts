import { resolveFastModel, SLOW_REQUEST_OPTIONS } from "../../../lib/classifier";
import { JORDAN_SCENARIO } from "../../../lib/engine";
import { gemini } from "../../../lib/gemini";
import { getCurrentUser } from "../../../lib/auth/currentUser";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import type { ScenarioRecord } from "../../../lib/supabase/types";
import type { Scenario } from "../../../lib/types";

const DEFAULT_JORDAN_RECORD: ScenarioRecord = {
  id: JORDAN_SCENARIO.id,
  slug: "jordan-lee-insomnia",
  title: "Jordan Lee — Walk-in Insomnia & Hidden Suicide Risk",
  specialty: "psychiatry",
  difficulty: "intermediate",
  patient_name: JORDAN_SCENARIO.patient.name,
  patient_age: JORDAN_SCENARIO.patient.age,
  patient_gender: "male",
  voice_name: "Achird",
  chief_complaint: JORDAN_SCENARIO.patient.opening,
  scenario_json: JORDAN_SCENARIO,
  intake_json: [
    { label: "Reason", value: "Insomnia" },
    { label: "Sleep", value: "3–4 h" },
    { label: "Duration", value: "~2 mo" },
    { label: "Mood screen", value: "Left blank" },
  ],
  avatar_config: {},
  is_ai_generated: false,
  generation_prompt: null,
  generation_model: null,
  is_published: true,
  created_by: null,
  created_at: new Date(0).toISOString(),
};

/**
 * GET /api/scenarios
 * Lists available clinical cases (curated + user's AI-generated cases from Supabase).
 */
export async function GET() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return Response.json({
      ok: true,
      scenarios: [DEFAULT_JORDAN_RECORD],
    });
  }

  const { data, error } = await supabase
    .from("scenarios")
    .select("*")
    .order("is_ai_generated", { ascending: true })
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    return Response.json({
      ok: true,
      scenarios: [DEFAULT_JORDAN_RECORD],
    });
  }

  const hasJordan = data.some((row) => row.id === JORDAN_SCENARIO.id);
  const scenarios = hasJordan
    ? (data as ScenarioRecord[])
    : [DEFAULT_JORDAN_RECORD, ...(data as ScenarioRecord[])];

  return Response.json({ ok: true, scenarios });
}

export interface CreateScenarioRequestBody {
  /** Prompt describing a new patient case for Gemini to generate */
  generatePrompt?: string;
  specialty?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  /** Or pass an already-structured Scenario object directly */
  scenario?: Scenario;
  title?: string;
  voiceName?: string;
  isPublished?: boolean;
}

const AI_SCENARIO_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    patientGender: { type: "string", enum: ["male", "female", "nonbinary"] },
    patientName: { type: "string" },
    patientAge: { type: "integer" },
    opening: { type: "string" },
    backstory: { type: "string" },
    disclosures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          fact: { type: "string" },
          labels: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "asked_mood",
                "asked_onset",
                "asked_hope",
                "asked_SI_directly",
                "asked_plan",
                "asked_support",
                "reflection",
                "empathy",
              ],
            },
          },
          minTrust: { type: "integer" },
        },
        required: ["id", "fact", "labels"],
      },
      minItems: 5,
      maxItems: 7,
    },
  },
  required: [
    "title",
    "patientGender",
    "patientName",
    "patientAge",
    "opening",
    "backstory",
    "disclosures",
  ],
};

/**
 * POST /api/scenarios
 * Creates or AI-generates a new standardized patient scenario and saves it to Supabase.
 */
export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return Response.json(
        { ok: false, error: "Supabase is not configured in .env.local yet." },
        { status: 400 },
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      return Response.json(
        { ok: false, error: "Sign in required to save patient scenarios." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as CreateScenarioRequestBody;

    // Auth0 RBAC: only instructors may use the Gemini case generator or publish cases.
    // (Postgres RLS enforces the publish rule too, via public.is_instructor().)
    if (body.generatePrompt?.trim() && !user.isInstructor) {
      return Response.json(
        { ok: false, error: "Only instructors can generate new patient cases with AI." },
        { status: 403 },
      );
    }
    if (body.isPublished && !user.isInstructor) {
      return Response.json(
        { ok: false, error: "Only instructors can publish cases to all learners." },
        { status: 403 },
      );
    }
    const specialty = body.specialty?.trim() || "psychiatry";
    const difficulty = body.difficulty ?? "intermediate";

    let scenarioObj: Scenario | undefined = body.scenario;
    let title = body.title?.trim() ?? "";
    let gender = "male";
    let isAiGenerated = false;
    let usedModel: string | null = null;

    if (!scenarioObj && body.generatePrompt?.trim()) {
      const model = resolveFastModel();
      usedModel = model;
      isAiGenerated = true;

      const interaction = await gemini().interactions.create({
        model,
        system_instruction:
          "You design realistic, non-stereotyped standardized patient OSCE scenarios for medical/nursing education. All patients are strictly fictional. Return valid JSON matching the schema, where disclosure #1 has empty labels [] (always unlocked) and sensitive disclosures require higher minTrust (50-65) and direct clinical inquiry labels.",
        input: `Create a standardized patient interview scenario in specialty "${specialty}" (${difficulty} difficulty) based on: ${body.generatePrompt.trim()}`,
        store: false,
        generation_config: {
          temperature: 0.6,
          ...(model.startsWith("gemini-3")
            ? { thinking_level: "minimal" as const }
            : {}),
        },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: AI_SCENARIO_SCHEMA,
        },
      }, SLOW_REQUEST_OPTIONS);

      const parsed = JSON.parse(interaction.output_text ?? "{}") as {
        title: string;
        patientGender: string;
        patientName: string;
        patientAge: number;
        opening: string;
        backstory: string;
        disclosures: Array<{
          id: string;
          fact: string;
          labels: Scenario["disclosures"][number]["requires"]["labels"];
          minTrust?: number;
        }>;
      };

      const slugBase = parsed.patientName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const generatedId = `ai-${slugBase}-${Date.now().toString(36)}`;

      title = parsed.title;
      gender = parsed.patientGender;
      scenarioObj = {
        id: generatedId,
        patient: {
          name: parsed.patientName,
          age: parsed.patientAge,
          opening: parsed.opening,
          backstory: parsed.backstory,
        },
        startTrust: 50,
        trustDeltas: { ...JORDAN_SCENARIO.trustDeltas },
        disclosures: parsed.disclosures.map((d, idx) => ({
          id: d.id,
          fact: d.fact,
          requires:
            idx === 0
              ? {}
              : {
                  ...(d.labels && d.labels.length > 0 ? { labels: d.labels } : {}),
                  ...(typeof d.minTrust === "number"
                    ? { minTrust: d.minTrust }
                    : {}),
                },
        })),
      };
    }

    if (!scenarioObj) {
      return Response.json(
        { ok: false, error: "Provide either `scenario` or `generatePrompt`." },
        { status: 400 },
      );
    }

    const slug = `${scenarioObj.id}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .slice(0, 64);
    const voiceName =
      body.voiceName ?? (gender === "female" ? "Aoede" : "Achird");

    const { data: inserted, error } = await supabase
      .from("scenarios")
      .upsert(
        {
          id: scenarioObj.id,
          slug,
          title:
            title ||
            `${scenarioObj.patient.name} — ${specialty} Standardized Patient`,
          specialty,
          difficulty,
          patient_name: scenarioObj.patient.name,
          patient_age: scenarioObj.patient.age,
          patient_gender: gender,
          voice_name: voiceName,
          chief_complaint: scenarioObj.patient.opening,
          scenario_json: scenarioObj,
          is_ai_generated: isAiGenerated,
          generation_prompt: body.generatePrompt?.trim() ?? null,
          generation_model: usedModel,
          is_published: Boolean(body.isPublished),
          created_by: user.id,
        },
        { onConflict: "id" },
      )
      .select("*")
      .single();

    if (error) {
      return Response.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return Response.json({
      ok: true,
      scenario: inserted as ScenarioRecord,
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
