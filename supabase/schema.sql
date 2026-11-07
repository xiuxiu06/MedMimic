-- ============================================================================
-- MedMimic — Supabase / PostgreSQL Schema (Auth + Multi-Scenario + Encounters)
-- Run this once in the Supabase SQL Editor (https://supabase.com/dashboard).
-- Safe to re-run (idempotent).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Shared updated_at trigger function
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Learner & Instructor Profiles (1:1 with Supabase auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  training_role text not null default 'medical_student'
    check (training_role in (
      'medical_student',
      'nursing_student',
      'pa_student',
      'psych_trainee',
      'instructor',
      'other'
    )),
  institution text,
  training_year int check (training_year is null or (training_year between 1 and 8)),
  last_login_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever someone registers via Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_role text;
begin
  meta_role := coalesce(new.raw_user_meta_data->>'training_role', 'medical_student');
  if meta_role not in ('medical_student', 'nursing_student', 'pa_student', 'psych_trainee', 'instructor', 'other') then
    meta_role := 'medical_student';
  end if;

  insert into public.profiles (id, email, display_name, training_role, institution)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(coalesce(new.email, 'learner'), '@', 1)
    ),
    meta_role,
    nullif(trim(new.raw_user_meta_data->>'institution'), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        last_login_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 3. Patient Scenarios Catalog (Supports Curated + AI-Generated Patient Cases)
-- ----------------------------------------------------------------------------
create table if not exists public.scenarios (
  id text primary key,
  slug text unique not null,
  title text not null,
  specialty text not null default 'psychiatry',
  difficulty text not null default 'intermediate'
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  patient_name text not null,
  patient_age int not null check (patient_age between 1 and 120),
  patient_gender text default 'male',
  voice_name text not null default 'Achird',
  chief_complaint text not null,
  -- Full Scenario engine payload: { id, patient, startTrust, trustDeltas, disclosures[] }
  scenario_json jsonb not null,
  -- Optional Briefing intake card fields & vitals
  intake_json jsonb not null default '[]'::jsonb,
  -- Optional procedural avatar colors / portrait URLs for multi-patient visuals
  avatar_config jsonb not null default '{}'::jsonb,
  -- AI case-generation provenance
  is_ai_generated boolean not null default false,
  generation_prompt text,
  generation_model text,
  is_published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scenarios_specialty on public.scenarios(specialty);
create index if not exists idx_scenarios_published on public.scenarios(is_published);
create index if not exists idx_scenarios_created_by on public.scenarios(created_by);

drop trigger if exists trg_scenarios_updated_at on public.scenarios;
create trigger trg_scenarios_updated_at
before update on public.scenarios
for each row execute function public.set_updated_at();

alter table public.scenarios enable row level security;

drop policy if exists "Anyone can read published or own scenarios" on public.scenarios;
create policy "Anyone can read published or own scenarios"
  on public.scenarios for select
  using (is_published = true or auth.uid() = created_by);

drop policy if exists "Authenticated users can create own scenarios" on public.scenarios;
create policy "Authenticated users can create own scenarios"
  on public.scenarios for insert
  with check (auth.uid() is not null and auth.uid() = created_by);

drop policy if exists "Creators can update own scenarios" on public.scenarios;
create policy "Creators can update own scenarios"
  on public.scenarios for update
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

drop policy if exists "Creators can delete own scenarios" on public.scenarios;
create policy "Creators can delete own scenarios"
  on public.scenarios for delete
  using (auth.uid() = created_by);

-- ----------------------------------------------------------------------------
-- 4. Encounter Sessions (Groups Original + Rewound Branches per Case Attempt)
-- ----------------------------------------------------------------------------
create table if not exists public.encounter_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id text not null references public.scenarios(id) on delete restrict,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  mode_used text not null default 'mixed'
    check (mode_used in ('text', 'voice', 'mixed')),
  best_outcome_code text
    check (best_outcome_code is null or best_outcome_code in (
      'risk_identified',
      'risk_underestimated',
      'risk_missed'
    )),
  run_count int not null default 0,
  rewind_count int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_encounter_sessions_user on public.encounter_sessions(user_id, updated_at desc);
create index if not exists idx_encounter_sessions_scenario on public.encounter_sessions(scenario_id);

drop trigger if exists trg_encounter_sessions_updated_at on public.encounter_sessions;
create trigger trg_encounter_sessions_updated_at
before update on public.encounter_sessions
for each row execute function public.set_updated_at();

alter table public.encounter_sessions enable row level security;

drop policy if exists "Users manage own encounter_sessions" on public.encounter_sessions;
create policy "Users manage own encounter_sessions"
  on public.encounter_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. Encounter Branches (Individual Runs: Run 1, Rewound Run 2, Scores & Debrief)
-- ----------------------------------------------------------------------------
create table if not exists public.encounter_branches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.encounter_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id text not null references public.scenarios(id) on delete restrict,
  client_branch_id text not null,
  parent_checkpoint_id text,
  outcome_code text not null
    check (outcome_code in ('risk_identified', 'risk_underestimated', 'risk_missed')),
  outcome_badge text not null
    check (outcome_badge in ('pass', 'warn', 'fail')),
  final_trust int not null check (final_trust between 0 and 100),
  final_emotion text not null,
  student_risk text check (student_risk is null or student_risk in ('low', 'moderate', 'high')),
  unlocked_disclosures text[] not null default '{}',
  actions_taken text[] not null default '{}',
  duration_sec int not null default 0,
  messages jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  final_state jsonb not null,
  rubric_scores jsonb not null default '[]'::jsonb,
  debrief_json jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, client_branch_id)
);

create index if not exists idx_encounter_branches_user on public.encounter_branches(user_id, created_at desc);
create index if not exists idx_encounter_branches_session on public.encounter_branches(session_id);

alter table public.encounter_branches enable row level security;

drop policy if exists "Users manage own encounter_branches" on public.encounter_branches;
create policy "Users manage own encounter_branches"
  on public.encounter_branches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 6. Encounter Checkpoints (Saved Decision Snapshots for Cross-Device Rewind)
-- ----------------------------------------------------------------------------
create table if not exists public.encounter_checkpoints (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.encounter_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  checkpoint_key text not null,
  engine_state jsonb not null,
  messages jsonb not null default '[]'::jsonb,
  timeline_index int not null default 0,
  created_at timestamptz not null default now(),
  unique (session_id, checkpoint_key)
);

create index if not exists idx_encounter_checkpoints_session on public.encounter_checkpoints(session_id);

alter table public.encounter_checkpoints enable row level security;

drop policy if exists "Users manage own encounter_checkpoints" on public.encounter_checkpoints;
create policy "Users manage own encounter_checkpoints"
  on public.encounter_checkpoints for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 7. Seed Default MVP Case: Jordan Lee ("jordan-lee-mvp")
-- ----------------------------------------------------------------------------
insert into public.scenarios (
  id,
  slug,
  title,
  specialty,
  difficulty,
  patient_name,
  patient_age,
  patient_gender,
  voice_name,
  chief_complaint,
  scenario_json,
  intake_json,
  is_ai_generated,
  is_published
)
values (
  'jordan-lee-mvp',
  'jordan-lee-insomnia',
  'Jordan Lee — Walk-in Insomnia & Hidden Suicide Risk',
  'psychiatry',
  'intermediate',
  'Jordan Lee',
  34,
  'male',
  'Achird',
  'I just need something to help me sleep.',
  '{
    "id": "jordan-lee-mvp",
    "patient": {
      "name": "Jordan Lee",
      "age": 34,
      "opening": "I just need something to help me sleep.",
      "backstory": "Jordan Lee is a 34-year-old outpatient walk-in patient who arrived alone at the clinic asking for sleep medication. Vitals are normal and this is Jordan''s first visit to this clinic. Jordan appears tired, speaks in brief, guarded sentences at first, and only opens up when treated with genuine empathy and non-judgmental curiosity."
    },
    "startTrust": 50,
    "trustDeltas": {
      "reflection": 12,
      "empathy": 10,
      "asked_support": 4,
      "asked_hope": 3,
      "asked_onset": 2,
      "asked_mood": 2,
      "asked_SI_directly": 0,
      "asked_plan": 0,
      "other": 0,
      "closed_rapid": -8,
      "premature_reassurance": -16,
      "dismissive": -20
    },
    "disclosures": [
      {
        "id": "insomnia",
        "fact": "For the past two months, you have barely been sleeping—maybe two or three broken hours a night, lying awake staring at the ceiling. You came in hoping to get sleeping pills so you can finally get a full night''s rest.",
        "requires": {}
      },
      {
        "id": "job_loss",
        "fact": "Two months ago—right around when your sleep fell apart—you were laid off from your job as a logistics coordinator after six years there. Since losing the job, your daily structure disappeared and financial stress has been building.",
        "requires": { "labels": ["asked_onset"] }
      },
      {
        "id": "low_mood",
        "fact": "Your mood has felt weighed down nearly every day—describe this using the exact word ''heavy'' (for example: ''Everything''s just… heavy.''). You have lost interest in things you used to enjoy, your energy is drained, and your appetite is down.",
        "requires": { "labels": ["asked_mood"] }
      },
      {
        "id": "hopelessness",
        "fact": "When you think about the future, you feel hopeless—like nothing is going to get better, every job rejection proves you''re stuck, and you don''t see a point in trying anymore.",
        "requires": { "labels": ["asked_hope"], "minTrust": 50 }
      },
      {
        "id": "suicidal_thoughts",
        "fact": "Over the past few weeks, you have been having thoughts of ending your life. Acknowledge quietly that this is the first time saying it out loud (for example: ''I haven''t told anyone that… yeah, lately I''ve been thinking everyone might be better off if I didn''t wake up.'').",
        "requires": { "labels": ["asked_SI_directly"], "minTrust": 60 }
      },
      {
        "id": "plan_and_means",
        "fact": "You have thought about a specific plan and have access to pills at home: you have been saving leftover prescription pain medication and over-the-counter sleep aids in your bathroom cabinet, and asking for stronger sleeping pills today was partly connected to that.",
        "requires": { "labels": ["asked_plan"], "unlocked": ["suicidal_thoughts"] }
      },
      {
        "id": "protective_factors",
        "fact": "You are very close to your younger sister, Maya (26). Even though you have pulled back lately so you don''t feel like a burden, thinking about how devastated Maya would be is the biggest reason you are still here.",
        "requires": { "labels": ["asked_support"] }
      }
    ]
  }'::jsonb,
  '[
    {"label": "Reason", "value": "Insomnia"},
    {"label": "Sleep", "value": "3–4 h"},
    {"label": "Duration", "value": "~2 mo"},
    {"label": "Mood screen", "value": "Left blank"}
  ]'::jsonb,
  false,
  true
)
on conflict (id) do update
  set title = excluded.title,
      scenario_json = excluded.scenario_json,
      intake_json = excluded.intake_json,
      voice_name = excluded.voice_name,
      is_published = true;
