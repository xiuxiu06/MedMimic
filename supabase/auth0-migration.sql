-- ============================================================================
-- MedMimic — Auth0 (Third-Party Auth) migration
-- Run ONCE in the Supabase SQL Editor, AFTER supabase/schema.sql.
--
-- Works for BOTH login systems, so it is safe for `main` (Supabase Auth) and
-- `b/s8-auth0` (Auth0) to share one database:
--   * user ids become TEXT: Supabase Auth ids are uuid strings, Auth0 ids look like
--     "google-oauth2|1234" or "auth0|abcd".
--   * RLS uses auth.jwt()->>'sub' (present in both Supabase and Auth0 JWTs) instead of
--     auth.uid() (which only works for uuid subjects).
--   * Instructor role comes from the Auth0 custom claim "https://medmimic.app/roles"
--     (set by the Post-Login Action in supabase/auth0/ACTION.js), never from user input.
-- Safe to re-run.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Helper functions read from the verified JWT
-- ----------------------------------------------------------------------------
create or replace function public.current_user_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

create or replace function public.is_instructor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'https://medmimic.app/roles') ? 'instructor', false)
$$;

-- ----------------------------------------------------------------------------
-- 2. Drop policies + foreign keys that depend on the uuid user columns
-- ----------------------------------------------------------------------------
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Instructors can read all profiles" on public.profiles;

drop policy if exists "Anyone can read published or own scenarios" on public.scenarios;
drop policy if exists "Authenticated users can create own scenarios" on public.scenarios;
drop policy if exists "Creators can update own scenarios" on public.scenarios;
drop policy if exists "Creators can delete own scenarios" on public.scenarios;

drop policy if exists "Users manage own encounter_sessions" on public.encounter_sessions;
drop policy if exists "Instructors can read all encounter_sessions" on public.encounter_sessions;
drop policy if exists "Users manage own encounter_branches" on public.encounter_branches;
drop policy if exists "Instructors can read all encounter_branches" on public.encounter_branches;
drop policy if exists "Users manage own encounter_checkpoints" on public.encounter_checkpoints;

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.scenarios drop constraint if exists scenarios_created_by_fkey;
alter table public.encounter_sessions drop constraint if exists encounter_sessions_user_id_fkey;
alter table public.encounter_branches drop constraint if exists encounter_branches_user_id_fkey;
alter table public.encounter_checkpoints drop constraint if exists encounter_checkpoints_user_id_fkey;

-- ----------------------------------------------------------------------------
-- 3. uuid → text user ids (existing Supabase Auth ids are kept as uuid strings)
-- ----------------------------------------------------------------------------
alter table public.profiles alter column id type text using id::text;
alter table public.scenarios alter column created_by type text using created_by::text;
alter table public.encounter_sessions alter column user_id type text using user_id::text;
alter table public.encounter_branches alter column user_id type text using user_id::text;
alter table public.encounter_checkpoints alter column user_id type text using user_id::text;

alter table public.scenarios
  add constraint scenarios_created_by_fkey foreign key (created_by)
  references public.profiles(id) on delete set null;
alter table public.encounter_sessions
  add constraint encounter_sessions_user_id_fkey foreign key (user_id)
  references public.profiles(id) on delete cascade;
alter table public.encounter_branches
  add constraint encounter_branches_user_id_fkey foreign key (user_id)
  references public.profiles(id) on delete cascade;
alter table public.encounter_checkpoints
  add constraint encounter_checkpoints_user_id_fkey foreign key (user_id)
  references public.profiles(id) on delete cascade;

-- Supabase Auth signup trigger (still used by `main`): cast the uuid to text.
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
  -- Never trust a self-chosen instructor role at signup.
  if meta_role not in ('medical_student', 'nursing_student', 'pa_student', 'psych_trainee', 'other') then
    meta_role := 'medical_student';
  end if;

  insert into public.profiles (id, email, display_name, training_role, institution)
  values (
    new.id::text,
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
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. RLS policies on the JWT subject (+ instructor role)
-- ----------------------------------------------------------------------------
-- profiles
create policy "Users can read own profile"
  on public.profiles for select
  using ((select public.current_user_id()) = id);
create policy "Instructors can read all profiles"
  on public.profiles for select
  using ((select public.is_instructor()));
create policy "Users can insert own profile"
  on public.profiles for insert
  with check ((select public.current_user_id()) = id and training_role <> 'instructor');
create policy "Users can update own profile"
  on public.profiles for update
  using ((select public.current_user_id()) = id)
  with check ((select public.current_user_id()) = id and training_role <> 'instructor');

-- scenarios: everyone reads published cases; only instructors may publish
create policy "Anyone can read published or own scenarios"
  on public.scenarios for select
  using (is_published = true or (select public.current_user_id()) = created_by);
create policy "Authenticated users can create own scenarios"
  on public.scenarios for insert
  with check (
    (select public.current_user_id()) = created_by
    and (is_published = false or (select public.is_instructor()))
  );
create policy "Creators can update own scenarios"
  on public.scenarios for update
  using ((select public.current_user_id()) = created_by)
  with check (
    (select public.current_user_id()) = created_by
    and (is_published = false or (select public.is_instructor()))
  );
create policy "Creators can delete own scenarios"
  on public.scenarios for delete
  using ((select public.current_user_id()) = created_by);

-- encounters: own rows; instructors can read everyone's runs (class dashboard)
create policy "Users manage own encounter_sessions"
  on public.encounter_sessions for all
  using ((select public.current_user_id()) = user_id)
  with check ((select public.current_user_id()) = user_id);
create policy "Instructors can read all encounter_sessions"
  on public.encounter_sessions for select
  using ((select public.is_instructor()));

create policy "Users manage own encounter_branches"
  on public.encounter_branches for all
  using ((select public.current_user_id()) = user_id)
  with check ((select public.current_user_id()) = user_id);
create policy "Instructors can read all encounter_branches"
  on public.encounter_branches for select
  using ((select public.is_instructor()));

create policy "Users manage own encounter_checkpoints"
  on public.encounter_checkpoints for all
  using ((select public.current_user_id()) = user_id)
  with check ((select public.current_user_id()) = user_id);

commit;
