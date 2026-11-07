# MedMimic — Next Steps: More Patients + Auth0

Step-by-step plan for the next phase. Each step says **who** does it, **which branch**, **which files**, **how**, and **done when**.
Context and file ownership: see `TEAM_GUIDE.md` (§3 ownership, §12 git workflow).

**Order:**
1. Part 0: decide (both, 20 min)
2. Part 1: more patients (A + B in parallel, ~5–6 h)
3. Part 2: Auth0 (B, ~2 h, only if the prize exists)
4. Part 3: optional saved progress (B)
5. Part 4: integrate + test + tag

**Golden rules:**
- The Jordan demo must keep working at every merge. Tag it now (`demo-v1`) so you can always roll back.
- Import the other person's files, never edit them. Ask the owner instead.
- Shared contracts (`lib/types.ts`, the scenario schema, storage keys) change only through a tiny PR that both people know about.

---

## Part 0 — Decisions before any code (A + B together, ~20 min)

| # | Decision | Who checks | Notes |
|---|---|---|---|
| 0.1 | Does MakeUC 2026 offer **MLH Best Use of Auth0**? | B | MLH prize page or the MLH coach. **If no → skip Part 2 and Part 3.** |
| 0.2 | Second patient: **Maria** or **Alex**? (see 1.6) | Both | Start with ONE. A third only if everything else is done. |
| 0.3 | Who reviews the new case clinically? | Both | A med, nursing, or psych student. 15 min is enough. |
| 0.4 | Real submission deadline → set the **feature freeze** (deadline − 6 h) | Both | Write it at the top of `TEAM_GUIDE.md`. |
| 0.5 | Tag the current working version | B | `git tag demo-v1 && git push origin demo-v1` |

---

## Part 1 — Multiple patients

### Overview: who does what
| Step | Person A | Person B | Time |
|---|---|---|---|
| 1.1 Shared contract | Review + approve | Write the PR | 30 min |
| 1.2 Scenario files + registry | ✅ owns | — | 45 min |
| 1.3 Engine reads any scenario | ✅ owns | — | 2–3 h |
| 1.4 Screens for any scenario | — | ✅ owns | 2–3 h (parallel with 1.3) |
| 1.5 Merge + test with Jordan | ✅ first | ✅ second | 30 min |
| 1.6 Write the new patient | Engine data | Briefing, avatar, RAG | 1–2 h |
| 1.7 Merge + test both cases | ✅ | ✅ | 30 min |

---

### Step 1.1 — Shared contract: scenario types (B writes, A approves)
**Branch:** `b/s6-contract` → PR → merge **immediately**, then both run `git pull`.
**File:** `lib/types.ts` (shared).

**Guide:**
1. Add these types to `lib/types.ts`. They describe the v2 scenario file, a superset of today's `Scenario`:
   ```ts
   export interface ScenarioV2 extends Scenario {
     title: string;                 // "Insomnia after job loss"
     difficulty: "core" | "advanced";
     contentNote: string;           // "Depression and suicidal thoughts"
     patient: Scenario["patient"] & { personality: string };
     avatar: { skin: string; hair: string; hairStyle: "short" | "long" | "bun"; top: string };
     briefing: {
       setting: string;             // "Walk-in clinic · Room 2 · 4:40 PM"
       intake: { label: string; value: string }[];
       goal: string;
     };
     disclosures: (Disclosure & { label: string })[];  // label = short UI text
     checkpoint: { id: string; whenUnlocked: string; label: string };
     outcome: { riskDisclosure: string; safeActions: ActionId[]; unsafeActions: ActionId[] };
   }
   export interface CaseSummary {
     id: string; title: string; difficulty: ScenarioV2["difficulty"];
     contentNote: string; patient: { name: string; age: number };
   }
   ```
2. Add `caseId?: string` to `Branch`. It's optional, so old saved runs still load.
3. Open the PR. A reviews it within 15 minutes. Merge.

**Done when:** `main` has the new types, and both people have pulled.

---

### Step 1.2 — Scenario files + registry (Person A)
**Branch:** `a/s6-scenarios`
**Files (A):** `data/scenarios/jordan.json`, `lib/scenarios.ts` (new)

**Guide:**
1. Move `data/scenario.jordan.json` → `data/scenarios/jordan.json` and fill in all v2 fields. For Jordan, copy today's hardcoded values:
   - `checkpoint`: `{ "id": "cp-heavy", "whenUnlocked": "low_mood", "label": "“heavy”" }`
   - `outcome`: `{ "riskDisclosure": "suicidal_thoughts", "safeActions": ["safety_plan","consult"], "unsafeActions": ["sleep_aid"] }`
   - `briefing` / `avatar`: copy from B's `app/briefing/page.tsx` and `components/JordanAvatar.tsx` (the colors are in the `C` object)
   - `disclosures[].label`: copy from B's `lib/labels.ts` `DISCLOSURE_TEXT`
2. Create `lib/scenarios.ts`:
   ```ts
   import jordan from "@/data/scenarios/jordan.json";
   import type { CaseSummary, ScenarioV2 } from "./types";

   const ALL: ScenarioV2[] = [jordan as ScenarioV2];
   export const DEFAULT_CASE_ID = "jordan";

   export function getScenario(id: string | null | undefined): ScenarioV2 {
     return ALL.find((s) => s.id === id) ?? ALL[0];
   }
   export function listCases(): CaseSummary[] {
     return ALL.map(({ id, title, difficulty, contentNote, patient }) =>
       ({ id, title, difficulty, contentNote, patient: { name: patient.name, age: patient.age } }));
   }
   ```
3. **Keep `data/scenario.jordan.json` until step 1.5.** B's current Briefing imports it. Delete it in 1.5, after B's PR stops importing it.

**Done when:** `getScenario("jordan")` returns the full v2 object, and `tsc` passes.

---

### Step 1.3 — Engine reads any scenario (Person A)
**Branch:** `a/s6-scenarios` (same as 1.2)
**Files (A):** `lib/engine.ts`, `lib/patientPrompt.ts`, `lib/checkpoints.ts`, `app/api/{turn,live-token,rewind}`, `app/encounter/*`

**Guide:**
1. **Engine:** replace the hardcoded `JORDAN_SCENARIO` with a `scenario: ScenarioV2` parameter, defaulting to `getScenario(DEFAULT_CASE_ID)`.
   - `createInitialEngineState(scenario)` uses `scenario.startTrust`.
   - The checkpoint fires when `scenario.checkpoint.whenUnlocked` unlocks, with `id = scenario.checkpoint.id`.
   - `evaluateOutcome(state, timeline, scenario)` uses `scenario.outcome.*` instead of `"suicidal_thoughts"`, `"sleep_aid"`, and so on. Keep the same 3 outcome codes and badges.
   - **Keep the existing exports working**, so B's `lib/scoring.ts` doesn't break before B updates it.
2. **Patient prompt:** build it from `scenario.patient.{name, age, backstory, personality}` + the unlocked disclosures.
3. **APIs:** `/api/turn`, `/api/live-token` and `/api/rewind` accept `caseId` in the body and call `getScenario(caseId)`.
4. **Encounter page:**
   - Read `?case=<id>` from the URL (default `jordan`) and pass `caseId` to every API call.
   - Pass `scenario.avatar` into `PatientPortrait` once B's `PatientAvatar` exists (1.4).
   - Set `caseId` on the finished `Branch`.
5. **Storage:** namespace the keys by case, e.g. `medmimic:${caseId}:branches`. Export `storageKeys(caseId)` and `loadCompletedBranches(caseId)` (`caseId` defaults to `"jordan"`).
6. **Check:** play Jordan from `/encounter` with no query param, then from `/encounter?case=jordan`. Both behave exactly as before.

**Done when:** Jordan plays identically, and all scenario-specific values come from the JSON.
**Hand-off to B:** tell B the final names of `getScenario`, `listCases`, `storageKeys` / `loadCompletedBranches(caseId)`, and the new `evaluateOutcome` signature.

---

### Step 1.4 — Screens for any scenario (Person B, in parallel with 1.3)
**Branch:** `b/s6-cases`
**Files (B):**
- `app/cases/page.tsx` (new)
- `app/briefing/page.tsx`
- `components/PatientAvatar.tsx` (new)
- `components/JordanAvatar.tsx`
- `lib/{runs,labels,scoring}.ts`
- `app/api/debrief/route.ts`
- `components/compare/CompareView.tsx`
- `components/AppHeader.tsx`

**Guide** (until A's 1.2 lands, use a local copy of Jordan v2 in `lib/mock/` so you aren't blocked):
1. **`/cases` page:**
   - One card per `listCases()` entry: name, age, title, difficulty badge, content note.
   - Button → `/briefing?case=<id>`.
   - Home page "Start a case" → `/cases`.
2. **Briefing:**
   - Read `?case=` and use `getScenario(id)` for `patient`, `briefing.setting`, `briefing.intake`, `briefing.goal`, and `contentNote`.
   - "Begin encounter" → `/encounter?case=<id>`.
3. **`PatientAvatar`:**
   - Move the drawing from `JordanAvatar` into `PatientAvatar({ emotion, talkLevel, size, look })`, where `look = scenario.avatar` sets the skin, hair, hair style, and top colors.
   - Keep `JordanAvatar` as a thin wrapper (`<PatientAvatar look={JORDAN_LOOK} …/>`) so A's `PatientPortrait` keeps working until A switches.
   - Add a hair style for `long` / `bun`.
4. **Runs per case:**
   - `lib/runs.ts` → `loadRuns(caseId)` uses A's `loadCompletedBranches(caseId)`.
   - `/debrief?case=<id>` and `/compare?case=<id>`. Default to the case of the most recent run.
5. **Labels and scoring:**
   - Disclosure labels and the total count come from `scenario.disclosures` (drop the hardcoded `DISCLOSURE_TEXT` / `TOTAL_DISCLOSURES`).
   - `outcomeFor(branch)` → `evaluateOutcome(state, timeline, getScenario(branch.caseId))`.
   - The checkpoint label comes from `scenario.checkpoint.label`.
6. **`/api/debrief`:** load the scenario from `branch.caseId`. Put the patient's name and a one-line summary in the Gemini prompt instead of the hardcoded Jordan text.
7. **`AppHeader`:** show the current case name next to the steps (optional).

**Done when:**
- `/cases` → Jordan → briefing → encounter → debrief → compare works.
- `?mock=1` still works.
- `tsc` / `lint` / `build` pass.

---

### Step 1.5 — Merge #1: Jordan through the new system (A first, then B)
1. A opens the PR for `a/s6-scenarios` → B skims it → merge.
2. B: `git merge origin/main` into `b/s6-cases`. Switch the imports from the local mock to A's real `lib/scenarios.ts`. Fix types. Run `tsc` / `lint` / `build`. Open the PR → A skims → merge.
3. A: delete `data/scenario.jordan.json` in a tiny PR.
4. **Both, on the Vercel production URL:** run the full Jordan demo (§ Test checklist).

**Done when:** the Jordan demo works exactly as `demo-v1`, now reached through `/cases`.

---

### Step 1.6 — Write the new patient (A + B, ~1–2 h)
**Branches:** A `a/s7-maria` (scenario data), B `b/s7-maria` (look, briefing check, RAG)

**Case ideas** (pick one in 0.2):
- **Maria Santos, 58:** widowed 4 months ago, drinking more, sleeping badly, a passive death wish ("I wouldn't mind not waking up"), no plan. Protective factor: her grandchildren. Possible checkpoint: when she mentions the anniversary of her husband's death.
- **Alex Kim, 21:** college student, panic attacks before exams, hides cutting. Self-harm without suicidal intent, vs the risk of escalation. Protective factor: their roommate.

| Person A | Person B |
|---|---|
| Write `data/scenarios/<id>.json`: 6–8 disclosures with `requires` rules, `trustDeltas`, `checkpoint`, `outcome` | Write `briefing` (setting, intake, goal) + `avatar` colors, and send them to A to paste into the JSON (or open a PR on A's branch) |
| Register it in `lib/scenarios.ts` `ALL` | Check that the RAG library covers the topic. Maria likely needs **alcohol screening**: find the source, **check its license**, add `data/raw/<id>.md`, run `node --env-file=.env.local scripts/embed-guidelines.mts`, then test with `scripts/search-guidelines.mts` |
| Tune the trust numbers by playing it 3–4 times in text mode | Add `QUERY_FOR_LABEL` / `FALLBACK_CHUNKS` entries in `lib/rag.ts` if new flagged labels appear |
| Make sure the patient prompt plays the personality well | Play it through debrief + compare and check the labels and citations make sense |

**Drafting tip:** ask Gemini to draft the disclosures in the v2 JSON format, then **a human edits every clinical fact**. Get the 15-minute review (0.3) before merging.

**Done when:** the reviewer has signed off, and the new case plays start → debrief → compare with sensible citations.

### Step 1.7 — Merge #2 (A first, then B) + test both cases on Vercel → tag `demo-v2`

---

## Part 2 — Auth0 login with guest mode (Person B only)
> Do this only if 0.1 = yes. **No A files change**, because `AppHeader` is B's file and A's encounter already uses it.
> **Rule:** no page requires login. Judges can always click **Continue as guest**.

**Branch:** `b/s8-auth0`
**Files (B):** `lib/auth0.ts` (new), `proxy.ts` (new, repo root), `components/UserMenu.tsx` (new), `components/AppHeader.tsx`, `app/page.tsx`, `.env.example`

### Step 2.1 — Auth0 dashboard (~15 min)
1. Sign in at https://manage.auth0.com and create an application of type **Regular Web Application**.
2. Under **Settings**:
   - **Allowed Callback URLs:** `http://localhost:3000/auth/callback, https://<your-prod>.vercel.app/auth/callback`
   - **Allowed Logout URLs:** `http://localhost:3000, https://<your-prod>.vercel.app`
   - **Allowed Web Origins:** the same two origins
3. Copy the **Domain**, **Client ID** and **Client Secret**.
4. Optional: Authentication → Social → enable **Google** for one-click login.

### Step 2.2 — Install + configure (~20 min)
```powershell
npm install @auth0/nextjs-auth0     # v4.33+ supports Next 16
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # → AUTH0_SECRET
```
Add to `.env.local`, and the same keys with empty values to `.env.example`:
```
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
AUTH0_SECRET=<64 hex chars from the command above>
APP_BASE_URL=http://localhost:3000
```
Vercel → Project → Settings → Environment Variables: add the same 5. Set `APP_BASE_URL` = your production URL. You can leave `APP_BASE_URL` unset for Preview: the SDK infers it from the host, but those preview hosts must also be in the Auth0 callback list or login fails there.

`lib/auth0.ts`:
```ts
import { Auth0Client } from "@auth0/nextjs-auth0/server";
export const auth0 = new Auth0Client({ signInReturnToPath: "/cases" });
```
`proxy.ts` (repo root; Next 16 uses `proxy.ts` instead of `middleware.ts`):
```ts
import { auth0 } from "./lib/auth0";

export async function proxy(request: Request) {
  return await auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
```
This mounts `/auth/login`, `/auth/logout`, `/auth/callback` and `/auth/profile` automatically. It does **not** protect any page.

### Step 2.3 — UI (~45 min)
1. **`components/UserMenu.tsx`** (client):
   - Use `useUser()` from `@auth0/nextjs-auth0`.
   - Signed in → show the avatar/name + a **Sign out** link (`<a href="/auth/logout">`).
   - Signed out → a **Sign in** link (`<a href="/auth/login?returnTo=/cases">`).
   - Use plain `<a>` tags, not `<Link prefetch>`. A full prefetch of `/auth/login` can start a login flow.
2. **`AppHeader`:** render `<UserMenu />` on the right, next to the existing `right` slot.
3. **Home page (`app/page.tsx`):** two buttons:
   - **Sign in** → `/auth/login?returnTo=/cases`
   - **Continue as guest** → `/cases`
4. **Optional personalization:** the `/cases` header says "Welcome back, <first name>" when signed in.

### Step 2.4 — Test (~20 min)
| Test | Expected |
|---|---|
| localhost: Sign in → Google or email | Returns to `/cases`; the header shows your name |
| Sign out | Back to `/`; the header shows "Sign in" |
| Continue as guest → full Jordan demo | Works with no login prompts anywhere |
| Production URL: sign in / out | Same as localhost |
| `/api/turn`, `/api/debrief`, Gemini Live voice while signed in | Unaffected |

**Done when:** all 5 rows pass. Then open the PR → A skims → merge → tag.

**If something breaks:**
- *Callback URL mismatch* → the URL isn't in Allowed Callback URLs, which must match exactly.
- *"secret" error* → `AUTH0_SECRET` missing or not 64 hex characters.
- **Fallback:** remove `<UserMenu />` from the header and keep guest mode only. Mention Auth0 as "in progress".

### Step 2.5 — Optional: roles (only together with Part 3)
In Auth0, create roles `student` and `instructor`, and add a Post-Login Action that puts the roles into the ID token. Then show an "Instructor" badge and an `/instructor` page listing everyone's runs. That needs Part 3.

---

## Part 3 — Optional: saved progress per user (Person B)
> Start this only after Part 1 and Part 2 work and there are ≥ 4 hours before the freeze. It's the first thing to cut.

**Branch:** `b/s9-progress`
1. **Supabase:** create a free project. Table `runs`:
   - `id uuid pk default gen_random_uuid()`
   - `user_sub text not null`
   - `case_id text not null`
   - `branch jsonb not null`
   - `outcome text`
   - `scores jsonb`
   - `created_at timestamptz default now()`
2. **Env vars** (server only): `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never expose them to the browser.
3. **`POST /api/runs`:**
   - Uses `auth0.getSession()`. Signed out → 204, do nothing. Signed in → insert the run with `user_sub = session.user.sub`.
   - Called from the Debrief page after a debrief loads. **This is B's page, so A's files don't change.**
4. **`GET /api/runs`:** returns the signed-in user's recent runs. Show them on `/cases` as a "Your recent runs" list (case, date, outcome badge).
5. **Guests:** unchanged (localStorage only).

**Done when:** sign in on two different browsers, finish a run on one, and the other shows it in "Your recent runs".

---

## Part 4 — Integration, testing, freeze

### Test checklist (run after every merge to `main`, on the Vercel production URL)
- [ ] `/api/health` → `ok: true`
- [ ] `/cases` lists every case; content notes are visible
- [ ] For **each** case:
  - briefing → encounter (text mode)
  - trust and disclosures behave
  - checkpoint fires
  - End → debrief with cited feedback; clicking a citation opens the passage
- [ ] Rewind → second run → `/compare` shows both runs, with the correct case
- [ ] Gemini Live voice works for at least Jordan
- [ ] Guest mode works with no login (if Auth0 is done); sign in and out work
- [ ] 988 footer + "education only" on every screen
- [ ] `?mock=1` pages still render (the backup for the demo)

### Red-team (B, the day before the demo)
Run `scripts/red-team.mts` (see `TEAM_GUIDE.md` §9) on each case. Fix B issues yourself, send A issues to A, and count the issues found for Devpost.

### Freeze + tags
- **Freeze** at deadline − 6 h. After that, only `fix/*` branches.
- Tag `demo-v2` once both cases + Auth0 pass the checklist.
- If anything new is unstable at the freeze: **disable it** (hide the `/cases` card or the Sign in button) rather than debugging under pressure. The Jordan demo is the safety net.

---

## Quick reference: who owns what in this phase
| Area | Person A | Person B |
|---|---|---|
| Scenario JSON files + `lib/scenarios.ts` | ✅ | provides briefing/avatar text |
| Engine, classifier, patient prompt, turn/live/rewind APIs | ✅ | — |
| Encounter page + storage namespacing | ✅ | — |
| `lib/types.ts` scenario types | approves | ✅ writes the PR |
| `/cases`, Briefing, Debrief, Compare, `PatientAvatar` | — | ✅ |
| RAG sources + embeddings for new topics | — | ✅ |
| Auth0 (`proxy.ts`, `lib/auth0.ts`, `UserMenu`, home page) | reviews the PR | ✅ |
| Supabase saved progress | — | ✅ (optional) |
| Clinical review of new cases | ✅ arranges together with B | ✅ |
| Red-team QA | fixes A issues | ✅ runs the script, fixes B issues |
| Devpost / slides / backup video | ✅ | ✅ |
