# MedMimic — Team Guide

> **The one-liner:** MedMimic is an AI clinical simulator where students interview a voice-driven psychiatric patient, make decisions, and then **rewind** to a critical moment to experience how a different choice changes the outcome.

**Hackathon:** MakeUC 2026 · **Team:** 2 people · **Length:** 24 hours
**Target:** Education track (primary), MLH Cursor + Grok Bot prize
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

---

## 4. Architecture

```
┌─────────────── Browser (Next.js) ───────────────┐
│ Encounter UI ── mic / text ── Portrait          │
└───────┬─────────────────────────────────────────┘
        │
┌───────▼──────── Next.js API routes ─────────────┐
│ /api/voice-token   → Grok Voice (realtime)      │
│ /api/turn          → Grok text: classify turn   │
│                    → Engine: update state       │
│ /api/rewind        → restore checkpoint         │
│ /api/debrief       → RAG retrieve → Grok text   │
└───────┬─────────────────────────────────────────┘
        │
  scenario.json   guidelines.json (chunks + embeddings)
```

**Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Vercel, Grok Voice Agent API, Grok text API. No database: state is held in memory or localStorage.

### Core principle
**The engine owns the facts, and Grok only performs.** The patient's prompt contains only the facts that have been **unlocked**, so Grok can't leak or invent clinical details.

### Per-turn flow
1. The student speaks or types → transcript.
2. `/api/turn`: Grok classifies the turn into labels, for example `asked_mood`, `reflection`, `premature_reassurance`, or `asked_SI_directly`. Return structured JSON.
3. The engine applies the rules: update trust, unlock disclosures, fire events, log to the timeline, and save a checkpoint if one is marked.
4. Rebuild the patient system prompt with the unlocked facts, emotional state, and trust level, and push it to the voice session.
5. Grok voice replies in character. The UI updates the portrait, trust, and tracker.

### Rewind
A checkpoint is `{ engineState, messages[], timelineIndex }`. Rewinding restores that snapshot and starts a new branch. The Compare screen diffs the two branches.

### RAG (debrief only, never during the encounter)
1. **Library:** 10–20 guideline sources split into chunks of about 200–400 words, each tagged `{source, section, url, license}`. Embed them once and save to `guidelines.json`.
2. **Query:** Each flagged timeline event becomes a query. For example, `missed:asked_SI_directly` becomes "how to ask directly about suicidal ideation."
3. **Retrieve:** Take the top 2–3 chunks by cosine similarity, computed in memory.
4. **Generate:** Grok writes feedback **using only those passages** and must cite source IDs.
5. **Show:** Display the feedback card with the student's quoted line and a citation tag. Clicking the tag shows the passage.

**Candidate sources** (check each license before using): C-SSRS screener, SAMHSA SAFE-T, PHQ-9, Stanley-Brown Safety Plan, Motivational Interviewing (OARS), WHO mhGAP. ❌ Don't use the DSM-5-TR (it's copyrighted).

### Suggested repo structure
```
/app
  /briefing  /encounter  /debrief  /compare
  /api/turn  /api/voice-token  /api/rewind  /api/debrief
/lib
  engine.ts        // state, rules, unlocks, events
  checkpoints.ts   // snapshot / restore / branches
  classifier.ts    // Grok turn classification
  patientPrompt.ts // builds prompt from unlocked facts
  rag.ts           // embed, retrieve, cite
  types.ts         // SHARED CONTRACT — agree on this first
/data
  scenario.jordan.json
  guidelines.json
/public/portraits  // neutral, withdrawn, sad, tearful, relieved
.cursor/rules      // architecture notes for Cursor agent
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

## 5. Prize requirements: Cursor + Grok Bot

The MLH prize requires all three of these:
1. ✅ **Cursor is our core AI coding agent.** Build everything in Cursor agent mode. Keep `.cursor/rules` current.
2. ✅ **A Grok Bot automation is part of our workflow.**
3. ✅ **The project description explains how we used both.**

### Grok Bot automations
- **#1 Scenario QA red-team (required):** After each deploy, Grok Bot opens the live Vercel build in **text mode**, plays an adversarial student (tries to get early disclosures, goes off-script, tries to break character, tests rewind), and posts a pass/fail report as a GitHub issue or Markdown file. We fix the issues in Cursor.
- **#2 Guideline curator (if time allows):** Collects the guideline sources and keeps a table of each one's URL and license.

> Grok Bot runs against a **live URL**, so deploy something to Vercel early (by H2).
> Grok Bot is a paid beta. Get access before the hackathon if possible, or ask the MLH or sponsor table at H0.

### Evidence to collect as we go (for Devpost)
- [ ] 4–6 Cursor screenshots: engine, rewind, RAG, fixing a QA bug
- [ ] Grok Bot routine setup screenshot
- [ ] 2+ Grok Bot QA reports, and the number of issues they caught
- [ ] Final "How we used Cursor and Grok Bot" paragraph (draft in section 9)

---

## 6. Roles (2 people)

| | **Person A: Patient & Engine** | **Person B: Debrief, RAG & Ops** |
|---|---|---|
| Owns | Scenario JSON, engine, classifier, patient prompt, Grok voice, portraits, Encounter screen, checkpoint logic | Repo and deploy, Briefing/Debrief/Compare screens, RAG pipeline, feedback generation, Grok Bot, Devpost, slides |
| Core files | `engine.ts`, `classifier.ts`, `patientPrompt.ts`, `checkpoints.ts`, `/encounter` | `rag.ts`, `/api/debrief`, `/debrief`, `/compare`, `/briefing` |
| Shared | `types.ts`, demo script, rehearsal | |

**Working rules**
- Agree on `types.ts` first. Change it only after telling your teammate.
- Build text mode first and add voice on top. Text mode is also what Grok Bot tests.
- Commit small and often to `main`. Pull before you push. Vercel auto-deploys.
- Do a 5-minute sync at every stage checkpoint (below). If you're blocked for more than 30 minutes, say so.

---

## 7. Timeline & stages

Times are hours from kickoff (H0). Adjust to the actual start time.

### Stage −1: Before the hackathon
- [ ] Both: Cursor installed, xAI API key, and Grok Bot access (or a plan to get it)
- [ ] B: Collect guideline PDFs and pages, and note their licenses
- [ ] A: Draft `scenario.jordan.json` and the patient backstory
- [ ] Both: Read the Grok Voice Agent API docs (OpenAI Realtime-compatible, `wss://api.x.ai/v1/realtime`)

### Stage 0: Setup and early risk checks (H0–H2)
| A | B |
|---|---|
| Grok voice spike: connect, speak, get a reply | Next.js + Tailwind scaffold, deploy to Vercel |
| **Test that Grok stays in character** as a patient with suicidal thoughts | Confirm Grok Bot access works |
| | Write `types.ts` with A, plus `.cursor/rules` |

**✅ Checkpoint H2:** Voice works (or we've decided on a fallback), the site is live on Vercel, and the contract is agreed.

### Stage 1: Core loop in text mode (H2–H8)
| A | B |
|---|---|
| `scenario.jordan.json` with the full disclosure and trust rules | Briefing screen |
| Engine: trust, unlocks, events, timeline log | Chunk and embed the guideline library → `guidelines.json` |
| Classifier `/api/turn` (structured output) | Debrief screen skeleton reading the timeline |
| Patient prompt builder plus the Encounter screen in text mode | **Grok Bot QA routine v1** running against the live text mode |

**✅ Checkpoint H8:** A complete text encounter runs from start to finish. Trust and unlocks work, and the first Grok Bot report has come in.

### Stage 2: Rewind, voice, and cited debrief (H8–H14)
| A | B |
|---|---|
| Checkpoints, restore, and branches | `rag.ts` retrieval plus `/api/debrief` with citations |
| Connect Grok voice to the engine (prompt updates per turn) | Rubric scoring (rapport, mood history, risk assessment, disposition) |
| Student risk selector, actions, outcomes | Compare screen (branch diff) |

**✅ Checkpoint H14:** Rewind works, the debrief shows real citations, and Compare shows two different runs.

### Stage 3: Polish and QA (H14–H18)
| A | B |
|---|---|
| Portraits (5 expressions) wired to emotion, voice-driven mouth pulse | Fix issues from Grok Bot reports, run QA again |
| Hints toggle, locked `???` tracker, push-to-talk | Content note, 988 footer, visual polish |
| Tune trust numbers so the demo path is reliable | Citation tag → shows the source passage |

**🧊 Feature freeze at H18.** After this, only bug fixes.
💤 Take turns napping (about 2 hours each) during H14–H18 if needed.

### Stage 4: Demo and submission (H18–H22)
- [ ] Write the demo script (below) and **rehearse it 10 times**
- [ ] Record a **backup demo video**, in case voice or Wi-Fi fails live
- [ ] Devpost: description, Cursor + Grok Bot section, screenshots, video
- [ ] Slides (5 or fewer): problem → demo → how it works → Grok/Cursor → what's next

### Stage 5: Buffer (H22–H24)
- [ ] **Submit at least 1 hour before the deadline**
- [ ] Opt in to the MLH prize on Devpost
- [ ] Charge laptops, test audio in the judging room, and have text-mode fallback ready

---

## 8. Fallbacks (decide quickly, don't argue)

| If this fails… | …do this instead | Never cut |
|---|---|---|
| Grok voice (latency, refusals, connection) | Text plus browser TTS, or text only. The prize doesn't require voice. | Rewind and Compare |
| Portrait art | 3 expressions instead of 5 | Trust-gated disclosures |
| Embeddings | Keyword/BM25 search over 10 hand-picked passages | Cited feedback |
| Grok breaks character | Stronger clinical-training framing in the system prompt plus a filter; switch to text | Grok Bot QA |
| Running behind at H14 | Drop the Hints toggle polish and the citation popover | |

---

## 9. Demo & pitch (5 minutes)

**Script**
1. **Hook (30 s):** "Med students get a handful of practice patients. When they miss something, they get a checklist, not a second chance."
2. **Briefing (15 s):** Introduce Jordan. Mention the content note.
3. **Run 1 (60 s):** The judge asks a few questions. We steer toward "You'll be fine." Trust drops, Jordan shuts down, and asks for a sleep aid.
4. **Debrief (30 s):** "Suicide risk not identified." Point out the timeline, the checkpoint, and the cited feedback.
5. **Rewind (60 s):** The judge reflects "heavy" and asks directly. Jordan says, "I haven't told anyone that."
6. **Compare (30 s):** "Same patient. One sentence. Different outcome."
7. **How it works (45 s):** The engine owns the facts, Grok performs, feedback is cited via RAG, and Grok Bot red-teams every build, built in Cursor.
8. **Close (15 s):** Unlimited low-stakes practice for every student. Next steps: more cases, instructor dashboard, validation with educators.

**Likely judge questions**
- *"Is it clinically accurate?"* → One classic teaching case, built on published frameworks, with every feedback point cited. Validation with educators is next.
- *"What about safety?"* → Fictional patient, content notes, crisis resources, education only, and the engine controls all clinical facts.
- *"Why not just use ChatGPT?"* → Trust-gated state, consistent facts, rewind and branching, and cited assessment. A chatbot can't do these.

**Draft: "How we used Cursor and Grok Bot"**
> MedMimic was built in Cursor, our core AI coding agent. We used agent mode to build the scenario engine (trust-gated disclosures), the checkpoint and rewind system, and the RAG pipeline that grounds feedback in published frameworks like C-SSRS and SAFE-T. A project rules file kept the agent aligned with our architecture.
> Grok Bot was our automated QA teammate. After each deploy, a Grok Bot routine opened our live build and played an adversarial student: it tried to get disclosures before trust was earned, pushed the patient off-script, and tested rewind. It then filed pass/fail reports, which we fixed in Cursor. It caught **[X]** issues during the hackathon.

---

## 10. Safety & ethics (non-negotiable)
- All patient data is fictional. No real patient information, ever.
- A content note appears before the encounter, and a 988 crisis line footer is on every screen.
- The patient is realistic and non-stereotyped. Have the scenario reviewed if possible.
- Shown everywhere: **"For education only. Not for clinical decision-making."**
- API keys stay server-side and never go to the browser.

---

## 11. Open questions (resolve by H2)
- [ ] Is the prize judged or a raffle? (Ask MLH.)
- [ ] How do we get Grok Bot access, and at what cost?
- [ ] Does Grok voice support short-lived browser tokens and function calling in voice sessions?
- [ ] Is there an embeddings endpoint on xAI, or do we use a small local model?
- [ ] Who can review the clinical content?
