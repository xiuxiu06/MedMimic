import { evaluateOutcome, JORDAN_SCENARIO } from "../../../lib/engine";
import type { ScenarioV2 } from "../../../lib/scenarios";
import { scoreBranch } from "../../../lib/scoring";
import { getCurrentUser } from "../../../lib/auth/currentUser";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import type {
  EncounterSessionWithBranches,
  UserProfile,
} from "../../../lib/supabase/types";
import type { Branch, Checkpoint, Debrief } from "../../../lib/types";

export interface SyncSessionRequestBody {
  sessionId?: string | null;
  scenarioId?: string;
  /** Present for AI-generated patients (not seeded in the scenarios table). */
  scenario?: ScenarioV2;
  modeUsed?: "text" | "voice" | "mixed";
  checkpoint?: Checkpoint;
  completedBranch?: Branch;
  debrief?: Debrief;
}

const OUTCOME_RANK: Record<string, number> = {
  risk_missed: 1,
  risk_underestimated: 2,
  risk_identified: 3,
};

function pickBetterOutcome(
  existing: string | null | undefined,
  incoming: string,
): string {
  if (!existing) return incoming;
  return (OUTCOME_RANK[incoming] ?? 0) >= (OUTCOME_RANK[existing] ?? 0)
    ? incoming
    : existing;
}

/**
 * GET /api/sessions
 * Returns the signed-in learner's profile + encounter history across patient scenarios.
 */
export async function GET() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return Response.json({
      ok: true,
      configured: false,
      authenticated: false,
      profile: null,
      sessions: [],
    });
  }

  // Auth0 branch: identity comes from the Auth0 session (sub), not Supabase Auth.
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({
      ok: true,
      configured: true,
      authenticated: false,
      profile: null,
      sessions: [],
    });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<UserProfile>();

  const { data: sessions, error } = await supabase
    .from("encounter_sessions")
    .select(
      `
      id,
      scenario_id,
      status,
      mode_used,
      best_outcome_code,
      run_count,
      rewind_count,
      started_at,
      completed_at,
      updated_at,
      scenarios (
        title,
        patient_name,
        patient_age,
        specialty,
        difficulty,
        scenario_json
      ),
      encounter_branches (
        id,
        session_id,
        scenario_id,
        client_branch_id,
        parent_checkpoint_id,
        outcome_code,
        outcome_badge,
        final_trust,
        final_emotion,
        student_risk,
        unlocked_disclosures,
        actions_taken,
        duration_sec,
        messages,
        timeline,
        final_state,
        rubric_scores,
        debrief_json,
        created_at
      )
    `,
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error) {
    return Response.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    configured: true,
    authenticated: true,
    user: {
      id: user.id,
      email: user.email ?? null,
      name: user.name,
      roles: user.roles,
      isInstructor: user.isInstructor,
    },
    profile: profile ?? null,
    sessions: (sessions ?? []) as unknown as EncounterSessionWithBranches[],
  });
}

/**
 * POST /api/sessions
 * Persists checkpoints, completed branches, rubric scores, and debriefs to Supabase.
 */
export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return Response.json({ ok: true, skipped: "supabase_not_configured" });
    }

    const user = await getCurrentUser();

    if (!user) {
      return Response.json({ ok: true, skipped: "unauthenticated" });
    }

    const body = (await request.json()) as SyncSessionRequestBody;
    const scenarioId = body.scenarioId?.trim() || JORDAN_SCENARIO.id;
    const modeUsed = body.modeUsed ?? "mixed";

    // 1. Ensure user profile row exists (defensive upsert)
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? null,
        display_name:
          (user.user_metadata?.display_name as string | undefined) ??
          user.email?.split("@")[0] ??
          "Learner",
        last_login_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    // 2. Ensure default Jordan scenario row exists if schema seed wasn't run separately
    if (scenarioId === JORDAN_SCENARIO.id) {
      const { data: existingScenario } = await supabase
        .from("scenarios")
        .select("id")
        .eq("id", JORDAN_SCENARIO.id)
        .maybeSingle();

      if (!existingScenario) {
        await supabase.from("scenarios").insert({
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
          is_ai_generated: false,
          is_published: true,
          created_by: user.id,
        });
      }
    } else if (body.scenario?.patient?.name) {
      // AI-generated patients live in the learner's browser; register them once
      // (unpublished, owned by this user) so the scenario_id foreign key holds.
      const generated = body.scenario;
      const { data: existingScenario } = await supabase
        .from("scenarios")
        .select("id")
        .eq("id", scenarioId)
        .maybeSingle();

      if (!existingScenario) {
        const { error: scenarioError } = await supabase.from("scenarios").insert({
          id: scenarioId,
          slug: scenarioId,
          title: (generated.title || generated.patient.name).slice(0, 200),
          specialty: "psychiatry",
          difficulty:
            generated.difficulty === "advanced" ? "advanced" : "intermediate",
          patient_name: generated.patient.name,
          patient_age: Math.min(120, Math.max(1, Math.round(generated.patient.age || 30))),
          patient_gender: generated.gender ?? "male",
          voice_name: generated.voiceName ?? "Achird",
          chief_complaint: generated.patient.opening,
          scenario_json: generated,
          intake_json: generated.briefing?.intake ?? [],
          avatar_config: generated.avatar ?? {},
          is_ai_generated: true,
          is_published: false,
          created_by: user.id,
        });
        if (scenarioError) {
          return Response.json(
            { ok: false, error: `Could not register generated case: ${scenarioError.message}` },
            { status: 500 },
          );
        }
      }
    }

    // 3. Create or fetch encounter_sessions row
    let sessionId = body.sessionId ?? null;
    let existingSession: {
      id: string;
      best_outcome_code: string | null;
      run_count: number;
      rewind_count: number;
    } | null = null;

    if (sessionId) {
      const { data } = await supabase
        .from("encounter_sessions")
        .select("id, best_outcome_code, run_count, rewind_count")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();
      existingSession = data ?? null;
      if (!existingSession) sessionId = null;
    }

    if (!sessionId) {
      const { data: created, error: createErr } = await supabase
        .from("encounter_sessions")
        .insert({
          user_id: user.id,
          scenario_id: scenarioId,
          status: body.completedBranch ? "completed" : "in_progress",
          mode_used: modeUsed,
        })
        .select("id, best_outcome_code, run_count, rewind_count")
        .single();

      if (createErr || !created) {
        return Response.json(
          { ok: false, error: createErr?.message ?? "Failed to create session" },
          { status: 500 },
        );
      }
      sessionId = created.id;
      existingSession = created;
    }

    // 4. Upsert checkpoint snapshot if provided
    let checkpointError: string | undefined;
    if (body.checkpoint) {
      const { error: cpErr } = await supabase.from("encounter_checkpoints").upsert(
        {
          session_id: sessionId,
          user_id: user.id,
          checkpoint_key: body.checkpoint.id,
          engine_state: body.checkpoint.engineState,
          messages: body.checkpoint.messages,
          timeline_index: body.checkpoint.timelineIndex,
        },
        { onConflict: "session_id,checkpoint_key" },
      );
      if (cpErr) {
        // Non-fatal (the run itself still syncs), but never silent.
        checkpointError = cpErr.message;
        console.error("[sessions] checkpoint upsert failed:", cpErr.message);
      }
    }

    // 5. Upsert completed branch + rubric scores + outcome if provided
    if (body.completedBranch) {
      const b = body.completedBranch;
      const outcome = evaluateOutcome(b.finalState, b.timeline);
      const scores = scoreBranch(b);

      const { error: branchErr } = await supabase
        .from("encounter_branches")
        .upsert(
          {
            session_id: sessionId,
            user_id: user.id,
            scenario_id: scenarioId,
            client_branch_id: b.id,
            parent_checkpoint_id: b.parentCheckpoint ?? null,
            outcome_code: outcome.code,
            outcome_badge: outcome.badge,
            final_trust: b.finalState.trust,
            final_emotion: b.finalState.emotion,
            student_risk: b.finalState.studentRisk ?? null,
            unlocked_disclosures: b.finalState.unlocked,
            actions_taken: b.finalState.actions,
            duration_sec: b.finalState.elapsedSec,
            messages: b.messages,
            timeline: b.timeline,
            final_state: b.finalState,
            rubric_scores: scores,
            ...(body.debrief ? { debrief_json: body.debrief } : {}),
          },
          { onConflict: "session_id,client_branch_id" },
        );

      if (branchErr) {
        return Response.json(
          { ok: false, error: branchErr.message },
          { status: 500 },
        );
      }

      // Recompute accurate run_count & rewind_count across saved branches in this session
      const { data: sessionBranches } = await supabase
        .from("encounter_branches")
        .select("id, parent_checkpoint_id")
        .eq("session_id", sessionId);

      const runCount = sessionBranches?.length ?? 1;
      const rewindCount =
        sessionBranches?.filter((row) => Boolean(row.parent_checkpoint_id))
          .length ?? 0;

      await supabase
        .from("encounter_sessions")
        .update({
          status: "completed",
          mode_used: modeUsed,
          run_count: runCount,
          rewind_count: rewindCount,
          best_outcome_code: pickBetterOutcome(
            existingSession?.best_outcome_code,
            outcome.code,
          ),
          completed_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("user_id", user.id);
    }

    return Response.json({
      ok: true,
      sessionId,
      ...(checkpointError ? { checkpointError } : {}),
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
