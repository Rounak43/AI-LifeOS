# AI LifeOS — What's left to build (continuation prompt)

> Paste this into any AI coding assistant (or hand to a developer) to continue the project.
> It captures the current state, what remains, what's blocked on external setup, and the
> recommended order. Source of truth for scope stays `SCOPE.md` and `AI-LifeOS-Master-Prompt.md`.

---

## Project context (read first)

AI LifeOS is a personal productivity + digital-wellbeing web app built around the loop
**PLAN → TRACK → COMPARE → UNDERSTAND → RECOMMEND → IMPROVE**.

- **Stack:** React + Vite + CSS Modules (frontend), Node + Express (backend, mostly unused so
  far), Firebase (Auth + Firestore + Storage). See `ARCHITECTURE.md`.
- **Data pattern:** the web client talks **directly to Firestore** (guarded by Security Rules)
  with live `onSnapshot` listeners; scoring/analytics compute on the client. The Express
  backend exists but is **not currently deployed or used** by the web app.
- **Run locally (Windows, folder name contains `&`):**
  - Frontend: `cd frontend && node ./node_modules/vite/bin/vite.js` (build: add `build`)
  - Backend: `cd backend && npm start`
  - Tests: `cd frontend|backend && node --test <file>`
  - `npm run` scripts break on this folder name — see `README.md` and memory note.
- **Firebase is live** (project `ai-lifeos-376ff`); Firestore Security Rules are published
  (owner-scoped). Web config is in `frontend/.env.local` (gitignored). No Admin service-account
  key yet, so the backend can't run trusted flows.

---

## ✅ DONE (Phases 1–4, 6 + extras)

- **Phase 1 — Foundation:** Firebase Auth (email/Google), Firestore + Security Rules, user
  profile, timezone utilities, dashboard shell.
- **Phase 2 — Core loop:** Daily Planner (time blocks + one-tap done/missed capture), Tasks
  CRUD with inline editing, live Dashboard, Planned-vs-Actual, deterministic score.
- **Onboarding:** mandatory first-run profile setup (no skip) — display name, occupation,
  timezone, **avatar/photo** (14 built-in avatars, photo upload resized inline, image link),
  auto **anonymous handle**, **main goal + rest days**.
- **UI system:** 9 themes (System/Light/Dark/Midnight/Ocean/Forest/Sunset/Lavender/Rose),
  app **logo** + favicon, floating **top nav** (click-to-open menu), **stepper time picker**
  (no scrollbar), motion pass (page transitions, count-up score, animated bars, reduced-motion
  support).
- **Goal-aware scoring (fixed rule for everyone):** key steps = High-priority tasks/blocks;
  `score = 70×(key done) + 30×(other done)`; **rest days not scored** ("🌿 Rest", streak-safe);
  no configurable weights.
- **Phase 3 — Lifestyle:** Habits (streaks), Wellbeing (Sleep, Mood, Workout), **Journal with
  real end-to-end AES-GCM encryption** (passphrase-derived key), Calendar (month view + events).
- **Phase 4 — Analytics:** 7/30/90-day trends, stat tiles, dependency-free SVG charts
  (client-side aggregation).
- **Phase 6 — Life Timeline:** one chronological story of a day/week/month, derived on read
  from every existing source; search + kind filters; untimed items honestly grouped under
  "Anytime"; journal entries shown as sealed markers (never decrypted there).
- **Phase 5 — AI Coach:** provider-agnostic LLM layer (Groq, no-training policy), the
  full recommendation pipeline, five coach features, NL command parsing, §10.1 safety
  rules enforced in code, a consent-gated privacy boundary with test coverage, and a
  10-case eval set run against the live provider.
- **Phase 7 (manual half) — Focus & Digital Wellbeing:** Pomodoro-style timer with
  productive/neutral/distracting tagging, optional task link, schedule-aware break nudges
  read from the day's plan, self-reported phone/laptop screen time, and a `focus` lane on
  the Life Timeline.

---

## ⏳ WHAT'S LEFT

### Phase 5 — AI Coach ✅ DONE
Built on **Groq** (`openai/gpt-oss-120b`), chosen because it is contractually barred from
training on inputs and retains nothing by default — Gemini's and Mistral's free tiers both
train on submitted content, which `PRIVACY.md` forbids for this app.

- [x] **Provider-agnostic AI layer** (`backend/src/services/ai/provider.js`) — one
      OpenAI-compatible adapter covers Groq/OpenRouter/Mistral/Cerebras, plus a native
      Gemini adapter. Swapping provider is a `.env` change. `TRAINS_ON_FREE_TIER` makes
      each provider's data policy a code-level fact.
- [x] **Recommendation pipeline** (§10): validated context → rendered deterministic facts
      → LLM → parse → Zod shape → §10.1 safety screen → present. Every stage after the
      model assumes it is wrong until proven otherwise.
- [x] **Five features:** review-my-day, review-my-week, plan-my-day, behavioural insight,
      and NL command parsing ("add DSA tomorrow at 8 AM" → structured, confirmed by you).
- [x] **AI safety rules (§10.1)** enforced **twice** — in the prompt and again in code on
      the way out. Not theatre: an unprompted model volunteered *"below the recommended
      7–9 hours"* during testing, exactly the clinical advice §10.1 forbids.
- [x] **AI data privacy** — journal has no field in the boundary schema at all (a request
      carrying one is rejected, not stripped); mood is consent-gated, rating-only, and
      blocked outright on a training-tier provider; the context is hard-capped. Disclosed
      on-screen on the Coach page.
- [x] **Eval set** — `backend/test/eval/coachEval.mjs`, 10 cases against the live
      provider, asserting behaviour (refuses to guess, respects rest days, won't over-plan)
      rather than wording. Run it on any model swap.
- [x] **Express backend stood up** — and, having found that `verifyIdToken` needs only a
      project id, **without** the Admin service-account key. See `docs/adr/0004`.
- [x] Recommendations stored in `aiRecommendations`, always dismissible, never auto-applied.
- [ ] Daily/weekly summaries **on a schedule** (needs Phase 8's scheduler; generating them
      on demand works today).
- [ ] Cache a day's review instead of regenerating on each visit — the free tier allows
      **8,000 tokens/min** and a review costs ~1,050.

### Phase 6 — Life Timeline ✅ DONE
- [x] Auto-constructed chronological view from existing data (plan blocks, tasks, habits,
      sleep, workouts, mood, journal markers, calendar events) — **derived on read**, no new
      collection (see `docs/adr/0002-timeline-derived-not-materialized.md`).
- [x] Text search, per-kind filter chips, date picker, prev/next, day/week/month replay.
- [x] Pure builder (`features/timeline/buildTimeline.js`) + 8 unit tests.
- [ ] (Later, needs AI) "story of the day" + year-in-review.

### Phase 7 — Digital Wellbeing (manual part) ✅ DONE
- [x] **Manual focus sessions** — Pomodoro-style timer (`/focus`) writing one document per
      block to `focusSessions`, with productive/neutral/distracting tagging, an optional
      label and a link to one of today's tasks. Presets: Classic 25/5, Deep work 50/10,
      Short burst 15/3; finished blocks roll straight into their break, and the break ending
      never auto-starts the next block.
- [x] **Timer that survives reality** — derived from timestamps, not tick counting, so a
      throttled background tab, a sleeping laptop or a page refresh all resume correctly
      (state persisted to `localStorage`). Pure engine + **11 unit tests**
      (`features/focus/focusEngine.test.js`).
- [x] **Self-logged screen time** — phone/laptop minutes into `screenTimeLogs/{localDate}`,
      clearly labelled self-reported; blank is stored as `null`, never `0`.
- [x] **Schedule-aware break nudges** — `focusAdvice()` compares the running block against
      today's `dailyPlans.timeBlocks`: warns when a session will overrun your next block,
      flags 90+ min of unbroken focus, and offers a session sized to fit the gap. At most
      two sentences, never blocking, nothing auto-rescheduled.
- [x] **Timeline integration** — a `focus` kind with a real `startedAt`, so blocks land at
      their actual clock position (`buildTimeline` + test).
- [x] Storage decision written up in `docs/adr/0003-focus-sessions-are-the-source-of-truth.md`.
- [ ] (Later, optional) focus stats on the Dashboard and in Phase 4 analytics trends.
- [ ] ❌ **Automatic OS screen-time tracking is not possible on web** — deferred to a native
      app (iOS DeviceActivity / Android UsageStats / desktop agent).

### Phase 8 — Production & mobile (needs accounts/credentials)
- [ ] Deploy frontend (Vercel / Firebase Hosting) and backend (Railway / Render).
- [ ] **Nightly analytics snapshots** — Cloud Function / scheduler writing `analyticsSnapshots`
      (currently analytics is live client-side aggregation only).
- [ ] Push notifications via **FCM** + reminders (tasks, habits, summaries, quiet hours).
- [ ] Offline hardening (lean on Firestore cache; conflict resolution deferred).
- [ ] Error tracking (Sentry) + basic monitoring/logging.
- [ ] **React Native / Expo mobile app** sharing the same Firebase backend.

---

## 🧹 Cross-cutting / tech debt / smaller gaps

- [x] ~~**Backend decision.**~~ Resolved in `docs/adr/0004`: Express is kept and scoped to
      the AI layer only; every other feature stays client-direct to Firestore. It runs
      verify-only (no Admin key needed).
- [ ] **Firebase Admin service-account key** — still absent. Not blocking anything today,
      but it is what would let the server build the AI context itself (closing the
      deviation in ADR 0004) and write nightly `analyticsSnapshots`.
- [ ] **Firestore composite indexes** as new queries need them; keep `firestore.indexes.json`
      updated.
- [ ] **Dashboard cards** for habits / sleep / mood / workout / focus summaries (master
      prompt §9.2).
- [ ] **Life Balance** multi-dimensional view (§9.12) — labeled app-defined indicator.
- [ ] **Gamification** (XP, levels, badges) — optional, keep restrained (§9.13).
- [ ] **Account deletion** — Firebase Auth user delete (needs re-auth); currently only app-data
      delete exists in Settings. Add passphrase-recovery guidance for Journal (E2E = unrecoverable).
- [ ] **Testing:** more unit tests (habits streaks, sleep minutes, analytics aggregation),
      integration tests for the AI endpoints (needs a test Firebase ID token). Current
      suites: `computeDay`, `buildTimeline`, `focusEngine`, `buildContext` (frontend, 42
      tests) and `aiBoundary` + `time` (backend, 19 tests) — **61 unit tests**, plus a
      10-case live-provider eval. All passing.
- [ ] **ADRs:** update stale `docs/adr/0001-live-scoring-on-client.md` (scoring changed to
      goal-aware; analytics is client-side not nightly snapshots yet); add an ADR for the Journal
      E2E encryption decision. (ADR 0002 — derived timeline, 0003 — focus session storage,
      and 0004 — the AI backend boundary — are written.)
- [ ] **Repo hygiene:** consider gitignoring the heavy reference material (`documents/`, the
      `.docx` files, the 1.6 MB PNG). Consider renaming the project folder to remove `&`/spaces
      (fixes `npm run`).
- [ ] Optional: enforce email verification before full access.

---

## Suggested order

1. ~~**Commit** current work + tidy `.gitignore`.~~ ✅
2. ~~**Phase 6 — Life Timeline.**~~ ✅
3. ~~**Phase 7 — manual focus timer.**~~ ✅
4. ~~**Stand up the Express backend** → **Phase 5 — AI Coach.**~~ ✅
5. **Phase 8** — deploy (frontend + the Express AI service), nightly snapshots, FCM, then
   the mobile app ← *next*.

### Before deploying
- **Rotate the Groq API key.** The current one was pasted into a chat transcript.
- Set `CORS_ORIGINS` on the API to the deployed frontend origin, and `VITE_API_BASE_URL`
  on the frontend to the deployed API.
- The coach degrades honestly without the API: `/ai/status` reports unavailable and the
  page says so, while every other feature keeps working.

## Hard constraints to keep (from `SCOPE.md` / master prompt §4)
Low-friction capture • design against anxiety • privacy first-class • honest, non-authoritative
metrics • deterministic-first (LLM only for language) • AI assists never decides • deliberate
empty states • timezone-correct "today".
