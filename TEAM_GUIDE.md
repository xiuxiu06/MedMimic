# MedMimic — Team Guide (v3)

> **One-liner:** MedMimic is an AI clinical simulator. Students interview a voice-driven psychiatric patient, make decisions, then **rewind** to a critical moment and see how a different choice changes the outcome. Feedback is grounded in published guidelines and cites them.

**Hackathon:** MakeUC 2026 · **Team:** Person A (engine, encounter, voice) + Person B (debrief, RAG, screens, ops)
**Prizes:** Education track (primary) · MLH Best Use of Gemini API · MLH Best Use of Auth0 *(only if MakeUC offers it, see §10)*
**Repo:** https://github.com/xiuxiu06/MedMimic · **Mockup:** https://claude.ai/artifact/NgFUGjyrn64FxozLz1yzqK

**What changed since v2:**
- The MVP is built and merged to `main`. Status is in §2.
- Patient portraits are now a code-drawn SVG avatar, not Gemini images: image models have 0 free-tier quota.
- Models moved to Flash / Flash-Lite because of free-tier quota (§5).
- **New phase:** more patients, Auth0 login (with guest mode), and optionally a database (§6–§8).

---

## 1. The idea (short)
- **Problem:** Students get only a handful of practice encounters with actor patients. In psychiatry, the most important facts (hopelessness, suicidal thoughts) only come out if the student builds trust and **asks directly**. Mistakes earn a checklist, not a second chance.
- **Solution:**
  - The patient's trust controls what they disclose.
  - Decisions lead to outcomes.
  - The student can rewind to a checkpoint and compare runs side by side.
  - The debrief cites real guideline passages (C-SSRS, SAFE-T, PHQ-9, SAMHSA TIP 35).
- **Users:** Medical, nursing, and PA students in years 1–3 preparing for rotations and OSCEs. Education only, never clinical decisions.
- **Pitch line:** *"Same patient. One sentence. Different outcome."*

---

## 2. Status board
| Area | Status | Owner |
|---|---|---|
| Next.js 16 + Tailwind 4 app, Vercel deploy, `/api/health` | ✅ Done | B |
| Jordan scenario: 7 trust-gated disclosures, events, `cp-heavy` checkpoint | ✅ Done | A |
| Engine: trust, unlocks, emotions, events, missed steps, `evaluateOutcome` | ✅ Done | A |
| Turn classifier (structured output + heuristic fallback) | ✅ Done | A |
| Encounter screen: text mode, hints, locked tracker, risk select, actions, rewind | ✅ Done | A |
| Gemini Live voice (ephemeral token, `useGeminiLive`) | 🟡 Built; needs an end-to-end voice test on Vercel | A |
| Briefing screen (reads `scenario.jordan.json`) | ✅ Done | B |
| Guideline library: 13 chunks, `data/guidelines.json`, scripts | ✅ Done | B |
| `/api/debrief`: RAG retrieval + Gemini feedback with validated citations + fallbacks | ✅ Done | B |
| Debrief screen: real runs, tabs, cache, clickable citations → `/api/guidelines/[id]` | ✅ Done | B |
| Compare screen: original vs rewound | ✅ Done | B |
| `JordanAvatar` (SVG, 6 emotions, lip-sync via `talkLevel`), used in `PatientPortrait` | ✅ Done | B (made) / A (wired) |
| Full demo run on the Vercel production URL | ⬜ To do | Both |
| Red-team QA script | ⬜ To do | B |
| Multiple patients | ⬜ New | A + B |
| Auth0 login + guest mode | ⬜ New (prize-dependent) | B |
| Saved progress per user (Supabase) | ⬜ Optional | B |
| Demo script, backup video, Devpost, slides | ⬜ To do | Both |

---

## 3. Architecture and file ownership
```
Browser (Next.js)
  /briefing ─► /encounter ─────────────► /debrief ─► /compare
                 │  text: /api/turn          │  POST /api/debrief
                 │  voice: Gemini Live       │  GET  /api/guidelines/[id]
                 │  (token: /api/live-token) │
                 └─ runs saved in localStorage (app/encounter/storage.ts)

Server: lib/engine.ts (facts + rules) · lib/classifier.ts · lib/patientPrompt.ts
        lib/rag.ts (data/guidelines.json) · lib/scoring.ts
```
**Core principle:** the **engine owns the facts**; Gemini only performs. The patient prompt contains only unlocked disclosures. The debrief may only cite passages that were retrieved.

| Owner | Files |
|---|---|
| **A** | `app/encounter/*`, `app/api/{turn,rewind,live-token}`, `lib/{engine,classifier,checkpoints,patientPrompt}.ts`, `data/scenario*.json` |
| **B** | `app/{page,layout,briefing,debrief,compare,dev}`, `app/api/{health,debrief,guidelines}`, `components/*`, `lib/{rag,scoring,labels,runs,gemini}.ts`, `lib/mock/*`, `data/{raw,guidelines.json,sources.md}`, `scripts/*` |
| **Shared contracts** (change only via a small PR + tell the other person) | `lib/types.ts`, `lib/models.ts`, the scenario schema (§6.1), storage keys (`STORAGE_KEYS` in `app/encounter/storage.ts`) |

**Rule:** you may **import** the other person's files, but never edit them. If you need a change, message the owner.

---

## 4. The Jordan case (reference)
- **Patient:** Jordan Lee, 34, walk-in, says "I just need something to help me sleep."
- **Hidden:** depression after a job loss, hopelessness, suicidal thoughts with a plan, stockpiled pills. A request for sleeping pills is itself a risk signal.
- **Disclosures:** `insomnia`, `job_loss`, `low_mood`, `hopelessness`, `suicidal_thoughts`, `plan_and_means`, `protective_factors`.
- **Checkpoint:** `cp-heavy`, triggered when `low_mood` unlocks ("Everything's just… heavy.").
- **Outcomes** (`evaluateOutcome`): `risk_identified` (pass) · `risk_underestimated` (warn) · `risk_missed` (fail).
- **Engine events:** `shutdown`, `wants_to_leave`, `opens_up`, `si_denied_low_trust`. B's `lib/labels.ts` accepts these plus the older `patient_*` ids.

> ⚠ Have a psychology or medical student review clinical content before demo day.

---

## 5. Models and free-tier quota
All model names live in `lib/models.ts`. The client uses API `v1beta`.

| Role | Model | Notes |
|---|---|---|
| Classifier + text-mode patient replies (A) | `gemini-3.5-flash` | A's fallback chain: Flash-Lite, then heuristic |
| Debrief feedback (B) | `gemini-3.5-flash-lite` | One call per finished run, cached per run |
| Live voice (A) | `gemini-3.8-live` | Fallback `gemini-2.5-flash-native-audio-latest` |
| Embeddings (B) | `gemini-embedding-001`, 768 dims | Re-run `scripts/embed-guidelines.mts` if changed |
| Images | — | 0 free quota, so we use the SVG avatar |

- **Quota facts:**
  - `gemini-3.8-flash` = **20 requests/day** on the free tier. Don't use it.
  - Check real limits at **ai.dev/rate-limit** before demo day.
- **Demo-day rules:**
  - Don't burn quota with test runs that morning.
  - `/debrief?mock=1` and `/compare?mock=1` work without any API calls.
  - Keep a **second API key** from another Google project as backup.

---

## 6. New phase: multiple patients

### 6.1 Shared scenario schema v2 (agree on this FIRST, both people)
One file per case: `data/scenarios/<caseId>.json`. Jordan moves to `data/scenarios/jordan.json`. Fields marked *(new)* extend today's format:
```jsonc
{
  "id": "jordan",
  "title": "Insomnia after job loss",                     // (new) shown on /cases
  "difficulty": "core",                                  // (new) core | advanced
  "contentNote": "Depression and suicidal thoughts",     // (new)
  "patient": { "name": "Jordan Lee", "age": 34, "opening": "...", "backstory": "...",
               "personality": "brief, guarded, opens up with empathy" },   // personality is new
  "avatar": { "skin": "#E2B895", "hair": "#1B1D24", "hairStyle": "short", "top": "#586173" }, // (new)
  "briefing": {                                          // (new) replaces hardcoded Briefing copy
    "setting": "Walk-in clinic · Room 2 · 4:40 PM",
    "intake": [{ "label": "Reason", "value": "Insomnia" }],
    "goal": "Conduct a focused psychiatric interview..."
  },
  "startTrust": 50,
  "trustDeltas": { "...": 0 },
  "disclosures": [{ "id": "insomnia", "label": "Insomnia, 2 months", "fact": "...", "requires": {} }], // label is new
  "checkpoint": { "id": "cp-heavy", "whenUnlocked": "low_mood", "label": "“heavy”" },              // (new)
  "outcome": {                                           // (new) drives evaluateOutcome
    "riskDisclosure": "suicidal_thoughts",
    "safeActions": ["safety_plan", "consult"],
    "unsafeActions": ["sleep_aid"]
  }
}
```
- **Turn labels stay the same** for every case (`TurnLabel` in `types.ts`), so the classifier and the RAG queries keep working. That means new cases should stay **psychiatric interviews**.
- **Storage keys get the case id:** `medmimic:<caseId>:branches`. A changes `storage.ts`; B updates `lib/runs.ts`.

### 6.2 Work split
| Person A (engine) | Person B (screens) |
|---|---|
| `getScenario(caseId)` + a list of cases; replace the hardcoded `JORDAN_SCENARIO` import | `/cases` case-picker page (cards: name, age, title, difficulty, content note) |
| Checkpoint trigger and outcome rules read from the scenario | `/briefing?case=<id>` reads `briefing` + `patient` from the scenario |
| `patientPrompt` uses the scenario's backstory and personality | `PatientAvatar` = general version of `JordanAvatar`, reading `avatar` colors and hair style |
| `/api/turn`, `/api/live-token`, `/api/rewind` accept `caseId` | Debrief/Compare: disclosure labels and `TOTAL_DISCLOSURES` come from the scenario |
| Storage keys namespaced by `caseId` | `lib/runs.ts` reads per-case runs; the header shows the current case |
| Jordan must still play exactly the same | Add RAG sources for new topics if needed (e.g. WHO AUDIT for alcohol; **check the license first**) |

### 6.3 New cases (write 1 first, a 2nd only if time allows)
Drafts can be written with Gemini, but **a human reviews every clinical fact**.
- **Maria Santos, 58:** recently widowed, drinking more since the funeral, passive death wish, no active plan. Key skills: grief, alcohol screening, asking directly about passive vs active suicidal thoughts.
- **Alex Kim, 21:** college student with panic attacks, hiding self-harm (cutting). Key skills: nonjudgmental inquiry about self-harm vs suicidal intent, confidentiality.

Each case needs: 6–8 disclosures with unlock rules, 1 checkpoint, outcome rules, and briefing copy. Then run the red-team script (§9) on it.

---

## 7. New phase: Auth0 (only if the prize exists; see §10)
**Goal:** sign in as a student, with a **"Continue as guest"** path so judges are never blocked.

**B does all of this. No A files change.**
1. Auth0 dashboard:
   - Create a "Regular Web Application".
   - Add Allowed Callback URLs: `http://localhost:3000/auth/callback` and `https://<prod>.vercel.app/auth/callback`.
   - Add the matching Logout URLs.
2. Install `@auth0/nextjs-auth0`. Create `lib/auth0.ts` (Auth0Client) and `proxy.ts`. In Next 16, `proxy.ts` replaces middleware: check `node_modules/next/dist/docs` and the SDK README for the current API.
3. Environment variables, both locally and on Vercel: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`.
4. UI:
   - Home page: **Sign in** + **Continue as guest**.
   - `AppHeader`: avatar/name + Sign out.
   - **No page requires login.** The demo path works signed out.
5. Optional: **roles** (`student` / `instructor`) via Auth0 RBAC. Only useful together with §8.

Vercel preview URLs may fail login because they aren't in the callback list. Test login on localhost and production only.

---

## 8. Optional: saved progress (Supabase)
Login alone doesn't save anything, because runs live in each browser's localStorage. To make Auth0 meaningful:
- **Supabase** (free Postgres). Table `runs`: `id`, `user_id` (Auth0 `sub`), `case_id`, `branch` (jsonb), `outcome`, `scores` (jsonb), `created_at`.
- **Write:** `/api/runs` (B) saves a finished run when signed in. **Read:** a "My progress" list on `/cases`.
- Guests keep using localStorage only.
- **Only start this after §6 and §7 work.** It's the first thing to cut.

---

## 9. Quality: red-team QA script (B)
`scripts/red-team.mts`: a Gemini "difficult student" plays 5 short sessions per case against `/api/turn` in text mode. It tries to:
- get disclosures before trust is earned
- push the patient out of character
- ask off-topic or unsafe questions

It writes `reports/red-team-<case>.md` with pass/fail per check.
- Run it **the day before** the demo, never on demo morning (quota).
- Fix the findings: B fixes B's files; A's issues go to A.
- Count the issues found, for the Devpost Gemini section.

---

## 10. Prizes
**MLH Best Use of Gemini API.** Gemini roles to show on one slide:
1. **Live API:** Jordan's real-time voice.
2. **Structured output:** classifies every student turn and drives the engine.
3. **Text generation:** patient replies in text mode.
4. **Embeddings:** guideline library for RAG.
5. **Grounded generation:** debrief feedback that must cite retrieved passages (clickable).
6. **Adversarial agent:** red-team QA (once §9 is done).

**MLH Best Use of Auth0.** ⚠ **First confirm it's offered at MakeUC 2026.** If it isn't, skip §7–§8 and spend the time on cases and polish. If it is, show sign-in, guest mode, and (if §8 is done) saved progress.

---

## 11. Timeline (remaining work)
Times are relative to now. Adjust to the real deadline. **Feature freeze = 6 hours before submission.**

| Stage | Person A | Person B | Done when |
|---|---|---|---|
| **S5 (≈1 h)** Lock the base | Voice test on Vercel; fix blockers | Full demo run on Vercel; confirm Auth0 prize; tag `demo-v1` | Jordan demo works end-to-end on production |
| **S6 (≈3 h)** Multi-case foundation | `getScenario`, scenario-driven checkpoint/outcome, `caseId` in APIs + storage | `/cases`, Briefing by case, `PatientAvatar`, per-case runs | Jordan works exactly as before via `/cases` |
| **S7 (≈2 h)** Second patient | Engine tuning for Maria | Maria's briefing/avatar; new RAG sources if needed | Maria playable start → debrief |
| **S8 (≈2 h)** Auth0 *(if prize)* | — (review only) | Login + guest mode (+ Supabase if time) | Sign in and guest both reach `/cases` |
| **S9 (≈1.5 h)** QA | Fix findings in A files | Red-team script, fix findings in B files | Reports pass for Jordan + Maria |
| **🧊 Freeze** | | | Only bug fixes after this |
| **S10 (≈3 h)** Demo prep | Rehearse | Devpost, slides, backup video | Submitted ≥1 h before the deadline |

**Merge after every stage** (§12). If S6 runs late, **ship Jordan only**. One polished case beats two broken ones.

---

## 12. Git workflow
- **Branches:** `a/<stage>-<topic>` and `b/<stage>-<topic>`, always created from the latest `main`. Examples: `a/s6-scenarios`, `b/s6-cases`, `b/s8-auth0`.
- **Merging into `main`:** **only through a PR**. The other person skims it. Vercel builds a preview for every PR, so test there.
- **Order at each merge:** A's PR first, then B merges `origin/main` into their branch, fixes conflicts, runs `tsc` / `lint` / `build`, then opens their PR.
- **Shared contracts** (§3): a tiny separate PR, merged immediately, then both people pull.
- **Never** force-push `main`. If a merge breaks things, `git revert` the merge commit.
- **After the freeze:** only `fix/<thing>` branches.
- **Tags:** `demo-v1` now (Jordan only). `demo-v2` when the new phase is stable. If something breaks just before judging, redeploy the last good tag.

---

## 13. Fallbacks (decide fast, don't debate)
| If this fails… | …do this | Never cut |
|---|---|---|
| Live voice | Text mode (already built) | Rewind + Compare |
| Gemini quota (429) | Backup API key; A's heuristic classifier; debrief template fallback; `?mock=1` pages | Trust-gated disclosures |
| Multi-case runs late | Ship Jordan only; hide `/cases` | Cited feedback |
| Auth0 callback issues | Guest mode only; mention Auth0 as "in progress" | The Jordan demo path |
| Supabase | Skip; localStorage only | |

---

## 14. Demo and pitch (5 min)
1. **Hook (30 s):** Students get a handful of practice patients and a checklist, not a second chance.
2. **Case picker (10 s):** *if built* show 2+ patients; *if Auth0* already signed in, or click "Continue as guest".
3. **Run 1 (60 s):** Steer to "You'll be fine". Trust drops, and Jordan asks for a sleep aid.
4. **Debrief (40 s):** "Suicide risk not identified". Timeline + checkpoint. **Click a citation** to show the real SAFE-T passage.
5. **Rewind (60 s):** Reflect "heavy", then ask directly. Jordan: *"I haven't told anyone that."*
6. **Compare (30 s):** Same patient. One sentence. Different outcome.
7. **How it works (40 s):** The engine owns the facts; the Gemini-roles slide; built in Cursor.
8. **Close (10 s):** More cases, instructor dashboard, validation with educators.

**Likely judge questions:**
- *Accuracy?* Published frameworks, cited passages you can click, and human review of each case.
- *Safety?* Fictional patients, content notes, the 988 footer, education only, and the engine controls the facts.
- *Why not a chatbot?* Trust-gated state, consistent facts, rewind and compare, and cited assessment.

**Prepare now:** a backup video of the whole flow, and `?mock=1` tabs open in case the Wi-Fi or quota dies.

---

## 15. Safety and ethics (non-negotiable)
- All patients are fictional. Never use real patient data.
- Every case has a content note, the 988 footer on every screen, and "For education only. Not for clinical decision-making."
- Clinical facts in every case are reviewed by a human. No stereotypes.
- API keys stay server-side. The browser only gets short-lived Live tokens. Auth0 and Supabase secrets go only in env vars.
- Guideline excerpts stay verbatim, with their license recorded in `data/sources.md`.

---

## 16. Open questions (answer before starting S6)
- [ ] Does MakeUC 2026 offer **MLH Best Use of Auth0**? (B)
- [ ] Do both people agree on scenario schema v2 (§6.1)? (A + B)
- [ ] Which second patient, Maria or Alex? Who reviews it clinically?
- [ ] Real free-tier limits for `gemini-3.5-flash` / `-lite` (ai.dev/rate-limit)? Do we need a backup key?
- [ ] What is the actual submission deadline, so we can set the freeze time?
