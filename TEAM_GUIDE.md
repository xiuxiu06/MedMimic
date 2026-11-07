# MedMimic — Team Guide

> **The one-liner:** MedMimic is an AI clinical simulator where students interview a voice-driven psychiatric patient, make decisions, and then **rewind** to a critical moment to experience how a different choice changes the outcome.

**Hackathon:** MakeUC 2026 · **Team:** 2 people · **Length:** 24 hours
**Target:** Education track (primary), MLH Best Use of Gemini API
**Mockup:** https://claude.ai/artifact/NgFUGjyrn64FxozLz1yzqK (private: share from the page's Share menu)

---

## 1. The idea

### Problem
Med, nursing, and PA students get only a handful of practice encounters with actor patients (standardized patients) before they face real ones. Practicing a psychiatric interview is especially hard: the most important things a patient says (hopelessness, suicidal thoughts) only come out if the student builds trust and **asks directly**. When students get it wrong, they get a checklist afterward, not a second chance.

### Solution
A safe, repeatable simulation where:
1. **The patient remembers how you treat them.** A trust meter controls what the patient is willing to tell you. If you're dismissive, key facts stay hidden.
2. **Your decisions have consequences.** The encounter ends in an outcome based on what you uncovered and what you decided.
3. **You can rewind.** Jump back to a checkpoint, try a different approach, and compare the two runs side by side.
4. **Feedback is grounded in published guidance.** Every feedback point cites a published framework (C-SSRS, SAFE-T, OARS, Stanley-Brown), retrieved with RAG.

**Learning loop:** Experience → Decide → Observe → Reflect → Rewind → Improve

### Target user
- **Primary:** Medical and nursing students in years 1–3 preparing for clinical rotations and OSCEs (timed exams with actor patients).
- **Secondary:** PA and psychology students, and clinical skills instructors.
- **Not for:** Practicing clinicians or real clinical decisions. This is an education tool only.

### Pitch line
> "Same patient. One sentence. Different outcome."

---

## 2. The MVP scenario

**Patient:** Jordan Lee, 34, a logistics coordinator who walks into a clinic alone.
**What Jordan says at the start:** "I just need something to help me sleep."
**What's actually going on (hidden):** Depression after losing their job two months ago, hopelessness, suicidal thoughts with a plan, and a stockpile of pills at home. Asking for sleeping pills is itself a risk signal.
**Protective factor:** A younger sibling Jordan is close to.

### Disclosures (7 total) and what unlocks each one
| # | Fact | Unlocks when |
|---|---|---|
| 1 | Insomnia, 2 months | Always available |
| 2 | Job loss (stressor) | Student asks about onset or life changes |
| 3 | Low mood ("heavy") | Student asks about mood |
| 4 | Hopelessness | Trust ≥ 50% and student asks about the future or hope |
| 5 | Suicidal thoughts | Trust ≥ 60% and student **asks directly** |
| 6 | Plan / access to means | #5 unlocked and student asks about a plan |
| 7 | Protective factors | Student asks about support or reasons for living |

### Trust rules (starting value: 50%)
- **Raises trust:** empathy statements, reflecting the patient's own words, open questions, normalizing ("Many people in your situation…")
- **Lowers trust:** premature reassurance ("You'll be fine"), dismissing feelings, rapid-fire closed questions, judgment

### Events (triggered by the engine)
- Patient shuts down (trust < 35%)
- Patient asks to leave (around minute 6 if trust is low)
- Patient cries or opens up (when #5 is disclosed)

### Outcomes
| Path | Outcome |
|---|---|
| Never asked about suicide, recommended a sleep aid | ❌ Risk missed: discharged with access to means |
| Asked directly, but low trust | ⚠ Patient denies; risk underestimated |
| Built trust, asked directly, safety-planned | ✅ Risk identified: safety plan plus urgent psychiatric evaluation |

**Checkpoint for the demo:** The moment Jordan says "Everything's just… heavy." (around minute 2).

> ⚠ Have a psychology or medical student review the clinical details before the demo.

---

## 3. Screens (see the mockup)

1. **Briefing:** Content note, patient card, intake form, goal, and "Begin encounter" button.
2. **Encounter:** Portrait with expressions, trust meter, conversation (voice with text fallback), disclosure tracker, the student's own risk assessment, and actions.
3. **Debrief:** Outcome, decision timeline with a checkpoint, rubric scores, and feedback cards with citations.
4. **Compare:** Run 1 vs Run 2 side by side, with a branch diagram and a key takeaway.

### Changes to make from the mockup
- [ ] **Disclosure tracker:** Locked items show as `??? · locked` during the encounter. Labels are revealed in the debrief.
- [ ] **Risk level:** The **student selects** low, moderate, or high, and the debrief grades the choice. The app doesn't fill it in.
- [ ] **Suggested questions:** Put them behind a **Hints toggle** (off for practice, on for the judge demo).
- [ ] Fold the action buttons into a single "Actions" menu to reduce clutter.
- [ ] Rename "Prescribe sleep aid" to "Recommend sleep aid."
- [ ] Change "Live · Grok Voice" to "Live · Gemini."

---

## 4. Architecture

```
┌─────────────── Browser (Next.js) ───────────────┐
│ Encounter UI ── mic / text ── Portrait          │
│      └─ Gemini Live session (ephemeral token)   │
└───────┬─────────────────────────────────────────┘
        │
┌───────▼──────── Next.js API routes ─────────────┐
│ /api/live-token    → Gemini Live ephemeral token│
│ /api/turn          → Gemini: classify turn      │
│                    → Engine: update state       │
│ /api/rewind        → restore checkpoint         │
│ /api/debrief       → RAG retrieve → Gemini      │
└───────┬─────────────────────────────────────────┘
        │
  scenario.json   guidelines.json (chunks + Gemini embeddings)
```

**Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Vercel, `@google/genai` SDK, Gemini Live API, Gemini text + embeddings, Gemini image generation (portraits). No database: state is held in memory or localStorage.
**Models:** Pick current model names in Google AI Studio at H0 and pin them in one config file (`lib/models.ts`). Use a fast Flash-class model for the classifier and a stronger model for the debrief.

### Core principle
**The engine owns the facts, and Gemini only performs.** The patient's prompt contains only the facts that have been **unlocked**, so Gemini can't leak or invent clinical details.

### Per-turn flow
1. The student speaks or types → transcript (the Live API can return input transcriptions).
2. `/api/turn`: Gemini classifies the turn using **structured output** (a JSON schema) into labels, for example `asked_mood`, `reflection`, `premature_reassurance`, or `asked_SI_directly`.
3. The engine applies the rules: update trust, unlock disclosures, fire events, log to the timeline, and save a checkpoint if one is marked.
4. Rebuild the patient system instructions with the unlocked facts, emotional state, and trust level, and update the Live session (or send the new context as a turn).
5. Gemini Live replies in character with native audio. The UI updates the portrait, trust, and tracker.

> Alternative if mid-session prompt updates are awkward: use **function calling** in the Live session. The patient model calls `report_turn(labels)`, the engine responds with the newly unlocked facts, and the model continues.

### Rewind
A checkpoint is `{ engineState, messages[], timelineIndex }`. Rewinding restores that snapshot, opens a **new Live session** seeded with the restored conversation, and starts a new branch. The Compare screen diffs the two branches.

### RAG (debrief only, never during the encounter)
1. **Library:** 10–20 guideline sources split into chunks of about 200–400 words, each tagged `{source, section, url, license}`. Embed them once with the **Gemini embedding model** and save to `guidelines.json`.
2. **Query:** Each flagged timeline event becomes a query. For example, `missed:asked_SI_directly` becomes "how to ask directly about suicidal ideation."
3. **Retrieve:** Take the top 2–3 chunks by cosine similarity, computed in memory.
4. **Generate:** Gemini writes feedback **using only those passages** and must cite source IDs (enforced with structured output).
5. **Show:** Display the feedback card with the student's quoted line and a citation tag. Clicking the tag shows the passage.

*Shortcut option:* The Gemini API's managed File Search tool can replace steps 1–3. Check whether it's available on your API key at H0. The hand-built version is easier to explain to judges.

**Candidate sources** (check each license before using): C-SSRS screener, SAMHSA SAFE-T, PHQ-9, Stanley-Brown Safety Plan, Motivational Interviewing (OARS), WHO mhGAP. ❌ Don't use the DSM-5-TR (it's copyrighted).

### Suggested repo structure
```
/app
  /briefing  /encounter  /debrief  /compare
  /api/turn  /api/live-token  /api/rewind  /api/debrief
/lib
  models.ts        // pinned Gemini model names
  engine.ts        // state, rules, unlocks, events
  checkpoints.ts   // snapshot / restore / branches
  classifier.ts    // Gemini turn classification (structured output)
  patientPrompt.ts // builds system instructions from unlocked facts
  rag.ts           // embed, retrieve, cite
  types.ts         // SHARED CONTRACT — agree on this first
/scripts
  embed-guidelines.ts  // one-time embedding job
  red-team.ts          // Gemini adversarial-student QA
  gen-portraits.ts     // Gemini image generation for expressions
/data
  scenario.jordan.json
  guidelines.json
/public/portraits  // neutral, withdrawn, sad, tearful, relieved
.cursor/rules      // architecture notes for the Cursor agent
```

### Shared contract (`types.ts`, agree on this in hour 1)
```ts
type TurnLabel = 'asked_mood' | 'asked_onset' | 'asked_hope' | 'asked_SI_directly'
  | 'asked_plan' | 'asked_support' | 'reflection' | 'empathy'
  | 'premature_reassurance' | 'dismissive' | 'closed_rapid' | 'other';

interface EngineState {
  trust: number;                 // 0–100
  emotion: 'neutral' | 'withdrawn' | 'sad' | 'tearful' | 'relieved' | 'irritable';
  unlocked: string[];            // disclosure ids
  firedEvents: string[];
  studentRisk?: 'low' | 'moderate' | 'high';
  actions: string[];             // 'phq9', 'cssrs', 'safety_plan', 'sleep_aid', 'consult'
  elapsedSec: number;
}

interface TimelineEvent {
  t: number; kind: 'turn' | 'event' | 'action' | 'checkpoint' | 'missed';
  label: string; quote?: string; trustDelta?: number;
}

interface Branch { id: string; parentCheckpoint?: string; timeline: TimelineEvent[]; finalState: EngineState; }
```

---

## 5. Prize: MLH Best Use of Gemini API

The prize rewards projects that use Gemini in impressive, "WHOA"-worthy ways. Our strategy is to make Gemini **central to every part of the product**, not just a chatbot:

| # | Gemini feature | What it does in MedMimic |
|---|---|---|
| 1 | **Live API (native audio)** | Jordan's real-time voice: interruptible, with tone matched to emotion (flat, tearful, relieved) |
| 2 | **Structured output** | Classifies every student turn into JSON labels that drive the engine |
| 3 | **Embeddings** | Indexes the guideline library for RAG |
| 4 | **Grounded generation** | Writes debrief feedback that must cite retrieved passages |
| 5 | **Image generation** | Creates consistent portraits of Jordan in 5 expressions |
| 6 | **Adversarial agent** | A Gemini "difficult student" red-teams the scenario before every demo (`scripts/red-team.ts`) |

**WHOA moment for judges:** they talk out loud to Jordan, hear the hesitation in Jordan's voice, rewind, and hear Jordan open up.

**Stretch (only if everything else is done):** Use Live API camera input so Jordan reacts to the student's eye contact or facial expression.

### Evidence to collect as we go (for Devpost)
- [ ] Architecture slide showing all 6 Gemini roles
- [ ] Screenshot of the red-team report and the number of issues it caught
- [ ] Short clip of the voice encounter
- [ ] Final "How we used Gemini" paragraph (draft in section 9)

> We still build in **Cursor**. It's a fast workflow, though no longer required for a prize.

---

## 6. Roles (2 people)

| | **Person A: Patient & Engine** | **Person B: Debrief, RAG & Ops** |
|---|---|---|
| Owns | Scenario JSON, engine, classifier, patient prompt, Gemini Live voice, checkpoint logic, Encounter screen | Repo and deploy, Briefing/Debrief/Compare screens, embeddings + RAG, feedback generation, portraits, red-team script, Devpost, slides |
| Core files | `engine.ts`, `classifier.ts`, `patientPrompt.ts`, `checkpoints.ts`, `/encounter` | `rag.ts`, `/api/debrief`, `/debrief`, `/compare`, `/briefing`, `/scripts/*` |
| Shared | `types.ts`, `models.ts`, demo script, rehearsal | |

**Working rules**
- Agree on `types.ts` first. Change it only after telling your teammate.
- Build text mode first and add voice on top. Text mode is also what the red-team script tests.
- Each person works on their own branch and merges at stage checkpoints (see **Git workflow** below).
- Do a 5-minute sync at every stage checkpoint (below). If you're blocked for more than 30 minutes, say so.

### Git workflow: separate branches, merged at each stage

Yes, each person builds on their own branch, and you merge at every stage checkpoint. This works well because file ownership is already split (section 6 table), so conflicts should be rare.

**Branches**
```
main                      ← always deployable; Vercel production (the demo URL)
├── a/<stage>-<topic>     ← Person A, e.g. a/s1-engine, a/s2-rewind
└── b/<stage>-<topic>     ← Person B, e.g. b/s1-rag, b/s2-debrief
```
- Start a **new branch from the latest `main` at the beginning of each stage**. Don't reuse a branch from an earlier stage.
- Vercel creates a **preview URL for every branch**, so each person can test their own work, and the red-team script can run against a preview.

**During a stage**
- Commit small and often to your own branch, and push at least every hour (it's your backup).
- Only edit files you own. If you need to change the other person's file, message them first.
- **Shared files (`types.ts`, `models.ts`, `package.json`) change only on `main`.** Make a tiny PR, merge it right away, and tell your teammate to pull it in (`git merge main` into your branch).
- If you need your teammate's unfinished work, use mock data that matches `types.ts` instead of waiting. Example: B builds the Debrief screen from a fake `Branch` JSON until A's engine is merged.

**At each checkpoint (H2, H8, H14, H18): merge ritual, about 20 minutes**
1. Both people: `git fetch && git merge origin/main` into your own branch, fix any conflicts, and confirm it runs locally.
2. Open a PR for each branch into `main`. The other person skims it (2 minutes, no deep review).
3. Merge **A first, then B**, one at a time. After each merge, check that the Vercel production deploy is green.
4. Both people do a quick end-to-end run on the production URL. If something's broken, fix it on `main` before starting the next stage.
5. Each person creates their next-stage branch from the new `main`.

**Rules that save you at 3 AM**
- Never force-push to `main`. Turn on branch protection: require a PR and don't allow force-pushes.
- If a merge goes badly, `git revert` the merge commit on `main`. Don't try to fix it under time pressure.
- **After feature freeze (H18), use only short `fix/<thing>` branches**, each merged as soon as it's done.
- Tag the demo-ready commit: `git tag demo-v1`. If something breaks just before judging, redeploy that tag.

---

## 7. Timeline & stages

Times are hours from kickoff (H0). Adjust to the actual start time.

### Stage −1: Before the hackathon
- [ ] Both: Cursor installed, Gemini API key from Google AI Studio (check free-tier rate limits)
- [ ] B: Collect guideline PDFs and pages, and note their licenses
- [ ] A: Draft `scenario.jordan.json` and the patient backstory
- [ ] Both: Read the Gemini Live API docs (WebSocket sessions, ephemeral tokens, native audio voices, function calling)

### Stage 0: Setup and early risk checks (H0–H2)
| A | B |
|---|---|
| Gemini Live spike: connect from the browser with an ephemeral token, speak, get a reply | Next.js + Tailwind scaffold, deploy to Vercel |
| **Test that Gemini stays in character** as a patient with suicidal thoughts, and tune the safety settings | Test the embedding call, pin model names in `models.ts` |
| | Write `types.ts` with A, plus `.cursor/rules` |

**✅ Checkpoint H2:** Live voice works (or we've decided on a fallback), the site is live on Vercel, and the contract is agreed. **Merge ritual → `main`.** Turn on branch protection.

### Stage 1: Core loop in text mode (H2–H8)
| A | B |
|---|---|
| `scenario.jordan.json` with the full disclosure and trust rules | Briefing screen |
| Engine: trust, unlocks, events, timeline log | Chunk and embed the guideline library → `guidelines.json` |
| Classifier `/api/turn` (structured output) | Debrief screen skeleton reading the timeline |
| Patient prompt builder plus the Encounter screen in text mode | Generate portraits (5 expressions) with Gemini image generation |

**✅ Checkpoint H8:** A complete text encounter runs from start to finish, trust and unlocks work, and the portraits are generated. **Merge ritual → `main`** (first real integration: B's Debrief switches from mock data to A's engine output).

### Stage 2: Rewind, voice, and cited debrief (H8–H14)
| A | B |
|---|---|
| Checkpoints, restore, and branches (a new Live session per branch) | `rag.ts` retrieval plus `/api/debrief` with citations |
| Connect Gemini Live to the engine (context updates or function calling) | Rubric scoring (rapport, mood history, risk assessment, disposition) |
| Student risk selector, actions, outcomes | Compare screen (branch diff) |

**✅ Checkpoint H14:** Rewind works, the debrief shows real citations, and Compare shows two different runs. **Merge ritual → `main`.**

### Stage 3: Polish and QA (H14–H18)
| A | B |
|---|---|
| Portraits wired to emotion, voice-driven mouth pulse | `red-team.ts`: Gemini adversarial student runs 5–10 sessions and outputs a report |
| Hints toggle, locked `???` tracker, push-to-talk | Fix issues from the report, content note, 988 footer |
| Tune trust numbers so the demo path is reliable | Citation tag → shows the source passage |

**🧊 Feature freeze at H18.** Do a final merge ritual into `main`, then tag `demo-v1`. After this, only bug fixes on short `fix/*` branches.
💤 Take turns napping (about 2 hours each) during H14–H18 if needed.

### Stage 4: Demo and submission (H18–H22)
- [ ] Write the demo script (below) and **rehearse it 10 times**
- [ ] Record a **backup demo video**, in case voice or Wi-Fi fails live
- [ ] Devpost: description, "How we used Gemini" section, screenshots, video
- [ ] Slides (5 or fewer): problem → demo → how it works → Gemini architecture → what's next

### Stage 5: Buffer (H22–H24)
- [ ] **Submit at least 1 hour before the deadline**
- [ ] Select the MLH Best Use of Gemini API prize on Devpost
- [ ] Charge laptops, test audio in the judging room, and have text-mode fallback ready

---

## 8. Fallbacks (decide quickly, don't argue)

| If this fails… | …do this instead | Never cut |
|---|---|---|
| Gemini Live (latency, connection) | Gemini text + Gemini TTS or browser TTS; text only as last resort | Rewind and Compare |
| Gemini refuses or softens the role | Stronger clinical-training framing in the system instructions, adjust safety settings, keep disclosures less graphic | Trust-gated disclosures |
| Image generation inconsistent | 3 expressions, or edit one base image into variants | Cited feedback |
| Embeddings / rate limits | Keyword/BM25 search over 10 hand-picked passages; cache all API results | Gemini as the core of every feature |
| Running behind at H14 | Drop the red-team script polish and the citation popover | |

---

## 9. Demo & pitch (5 minutes)

**Script**
1. **Hook (30 s):** "Med students get a handful of practice patients. When they miss something, they get a checklist, not a second chance."
2. **Briefing (15 s):** Introduce Jordan. Mention the content note.
3. **Run 1 (60 s):** The judge asks a few questions out loud. We steer toward "You'll be fine." Trust drops, Jordan's voice goes flat, and Jordan asks for a sleep aid.
4. **Debrief (30 s):** "Suicide risk not identified." Point out the timeline, the checkpoint, and the cited feedback.
5. **Rewind (60 s):** The judge reflects "heavy" and asks directly. Jordan says, "I haven't told anyone that."
6. **Compare (30 s):** "Same patient. One sentence. Different outcome."
7. **How it works (45 s):** The engine owns the facts, Gemini performs, plus a slide of the 6 Gemini roles.
8. **Close (15 s):** Unlimited low-stakes practice for every student. Next steps: more cases, instructor dashboard, validation with educators.

**Likely judge questions**
- *"Is it clinically accurate?"* → One classic teaching case, built on published frameworks, with every feedback point cited. Validation with educators is next.
- *"What about safety?"* → Fictional patient, content notes, crisis resources, education only, and the engine controls all clinical facts.
- *"Why not just use the Gemini app?"* → Trust-gated state, consistent facts, rewind and branching, and cited assessment. A chatbot can't do these.

**Draft: "How we used Gemini"**
> Gemini powers every layer of MedMimic. Jordan's voice runs on the **Gemini Live API** with native audio, so tone shifts with emotion and students can interrupt naturally. Each student turn is classified by Gemini with **structured output**, which drives our scenario engine: trust, disclosures, and events. After the encounter, we retrieve passages from a guideline library indexed with **Gemini embeddings**, and Gemini writes feedback that must cite them. Jordan's portraits were generated with **Gemini image generation** for consistent expressions. A Gemini-powered adversarial student red-teamed every build, catching **[X]** issues. We built everything in Cursor.

---

## 10. Safety & ethics (non-negotiable)
- All patient data is fictional. No real patient information, ever.
- A content note appears before the encounter, and a 988 crisis line footer is on every screen.
- The patient is realistic and non-stereotyped. Have the scenario reviewed if possible.
- Shown everywhere: **"For education only. Not for clinical decision-making."**
- API keys stay server-side. The browser only gets short-lived Live API tokens.

---

## 11. Open questions (resolve by H2)
- [ ] Which Gemini model names are current (Live native-audio, Flash, embeddings, image)? Pin them in `models.ts`.
- [ ] What are the free-tier rate limits, and do we need billing enabled for the demo?
- [ ] Can we update system instructions mid-session in Live, or should we use function calling?
- [ ] Does Gemini stay in character with our safety settings?
- [ ] Who can review the clinical content?
