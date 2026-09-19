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

## ✅ DONE (Phases 1–4 + extras)

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

---

## ⏳ WHAT'S LEFT

### Phase 5 — AI Coach ⭐ (needs a free LLM API key)
The headline differentiator. **Blocked until a key is provided** (Groq or Google Gemini —
free, no card). Build:
- [ ] Provider-agnostic AI layer behind one interface (base-URL swap): Groq / Gemini / OpenRouter.
- [ ] **Recommendation pipeline** (server-side, per master prompt §10): retrieve → aggregate →
      **deterministic metrics in code** → build small structured context → LLM → validate output
      → store in `aiRecommendations` → present (always dismissible).
- [ ] AI Coach features: plan-my-day, review-my-day/week, optimize/move missed tasks,
      behavioral insight, goal planning.
- [ ] Natural-language commands ("add DSA tomorrow at 8 AM", "move workout to 7 PM").
- [ ] Daily/weekly AI summaries.
- [ ] **AI safety rules** (§10.1): no medical/mental-health diagnosis, no extreme-productivity or
      sleep-deprivation advice, no manipulation; every suggestion rejectable.
- [ ] **AI data privacy** (`PRIVACY.md`): never send journal/mood to a training-tier provider;
      gate journal/mood behind per-feature consent; disclose what leaves the device.
- [ ] Small **eval set** (prompts + expected-shape outputs) so model swaps don't regress.
- [ ] **Requires standing up the Express backend** (AI orchestration + secrets must not be in
      the frontend) — needs a Firebase Admin service-account key + a host (Railway/Render).

### Phase 6 — Life Timeline (fully buildable now)
- [ ] Auto-construct a chronological day view from existing data (tasks, planner captures,
      habits, sleep, workouts, mood, journal, calendar events).
- [ ] Search / filter, view a specific date, day/week/month replay.
- [ ] (Later, needs AI) "story of the day" + year-in-review.

### Phase 7 — Digital Wellbeing (manual part buildable now)
- [ ] **Manual focus sessions** — Pomodoro-style timer + self-logged focus/screen time into
      `screenTimeLogs`, with productive/distracting/neutral tagging.
- [ ] Schedule-aware break nudges.
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

- [ ] **Backend decision:** the Express API is scaffolded but unused. Either deploy it (for AI +
      snapshots + trusted writes) or formally commit to serverless + Cloud Functions. Document
      in an ADR.
- [ ] **Firestore composite indexes** as new queries need them; keep `firestore.indexes.json`
      updated.
- [ ] **Dashboard cards** for habits / sleep / mood / workout summaries (master prompt §9.2).
- [ ] **Life Balance** multi-dimensional view (§9.12) — labeled app-defined indicator.
- [ ] **Gamification** (XP, levels, badges) — optional, keep restrained (§9.13).
- [ ] **Account deletion** — Firebase Auth user delete (needs re-auth); currently only app-data
      delete exists in Settings. Add passphrase-recovery guidance for Journal (E2E = unrecoverable).
- [ ] **Testing:** more unit tests (habits streaks, sleep minutes, analytics aggregation),
      integration tests for the AI pipeline once it exists.
- [ ] **ADRs:** update stale `docs/adr/0001-live-scoring-on-client.md` (scoring changed to
      goal-aware; analytics is client-side not nightly snapshots yet); add an ADR for the Journal
      E2E encryption decision.
- [ ] **Repo hygiene:** consider gitignoring the heavy reference material (`documents/`, the
      `.docx` files, the 1.6 MB PNG). Consider renaming the project folder to remove `&`/spaces
      (fixes `npm run`).
- [ ] **Commit** the latest uncommitted UI/motion work.
- [ ] Optional: enforce email verification before full access.

---

## Suggested order

1. **Commit** current work + tidy `.gitignore`.
2. **Phase 6 — Life Timeline** (no external deps, high user value, uses data you already have).
3. **Phase 7 — manual focus timer** (small, self-contained).
4. **Stand up the Express backend** (Admin key + host) → unblock **Phase 5 — AI Coach**.
5. **Phase 8** — deploy, snapshots, FCM, then the mobile app.

## Hard constraints to keep (from `SCOPE.md` / master prompt §4)
Low-friction capture • design against anxiety • privacy first-class • honest, non-authoritative
metrics • deterministic-first (LLM only for language) • AI assists never decides • deliberate
empty states • timezone-correct "today".
