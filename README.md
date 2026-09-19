# AI LifeOS

> Understand your day, improve your routine, and build a better life one day at a time.

AI LifeOS is a cross-platform, AI-powered personal productivity and digital-wellbeing
system. It helps a user **plan their day, track what actually happened, compare the two,
understand their patterns, and improve tomorrow** — not just another to-do app.

The whole product is built around a single loop:

```
PLAN → TRACK → COMPARE → UNDERSTAND → RECOMMEND → IMPROVE → PLAN AGAIN
```

If you build only one thing, build the **"Planned vs Actual" loop**: plan the day in time
blocks → capture what actually happened with one tap → show the difference → suggest one
improvement. Everything else (habits, sleep, workouts, timeline, AI coach) is expansion.

---

## Status

🚧 **Phase 2 (Core loop) built.** On top of the Phase 1 foundation (Express API +
React/Vite client, Firebase Auth, Firestore Security Rules, timezone utilities), the MVP
loop now works: **Daily Planner** with one-tap done/missed capture, **Tasks** CRUD, a live
**Dashboard** showing Planned vs Actual and a **deterministic productivity score** — all
computed live from Firestore with real-time updates and deliberate empty states.
See [SCOPE.md](SCOPE.md), [ADR 0001](docs/adr/0001-live-scoring-on-client.md), and the
[phases](#development-phases) below.

To use the authenticated features you must connect a Firebase project (fill in
`frontend/.env.local` and `backend/.env`). Without it, the app renders a friendly setup
notice rather than crashing.

## What this is (and is not)

- **Is:** a system that helps users understand *how they spend their time* and continuously
  improve *how they plan their lives*.
- **Is not:** "another to-do app." Completing every task while sleeping badly and burning
  out is not a "great day," and AI LifeOS is designed to notice that.

## Core principles (hard constraints)

These are constraints, not suggestions. Full detail in the master prompt (Section 4).

1. **Scope discipline** — ship the core loop first; earn each next feature.
2. **Low friction beats rich data** — every logging interaction must be fast (one-tap
   done/missed). Tedious manual logging is the #1 thing that kills apps like this.
3. **Design against anxiety** — scores, streaks and "balance" must feel encouraging, never
   punishing or surveilling.
4. **Privacy is first-class** — mood, journals, sleep and behavior are among the most
   sensitive data a person has. See [PRIVACY.md](PRIVACY.md).
5. **Honest metrics** — the productivity and life-balance scores are app-defined,
   configurable indicators, never presented as scientific or authoritative.
6. **Solve the cold start** — the app must feel useful on day one with zero history.
   Every empty state is designed deliberately.
7. **AI assists, never decides** — the user can always ignore or override any suggestion.
8. **Deterministic first, AI second** — compute metrics in code; use the LLM only for
   language, summarization and suggestions, never for math or facts it can hallucinate.

## Tech stack

| Layer | Technology |
| --- | --- |
| Web frontend | React + Vite + plain CSS (CSS Modules) |
| Mobile (later) | React Native / Expo, sharing the same backend |
| Backend API | Node.js + Express |
| Auth | Firebase Authentication (email/password, Google, verification, reset) |
| Database | Cloud Firestore (NoSQL, real-time sync, offline cache) |
| File storage | Firebase Cloud Storage |
| Push | Firebase Cloud Messaging (FCM) |
| Scheduled jobs | Cloud Functions / scheduler on the Express host |
| AI / LLM | Provider-agnostic layer (Gemini Flash / Groq, OpenRouter fallback) |
| Weather | Open-Meteo (free, no API key) |

**Responsibility split:** simple per-user CRUD (tasks, habits, planner blocks) → the React
client talks to Firestore directly, guarded by Security Rules. Trusted computation, secrets,
or cross-record logic (AI pipeline, analytics, scoring, third-party calls) → goes through
Express, which verifies the Firebase ID token on every request. **Never put API keys or LLM
keys in the frontend.** See [ARCHITECTURE.md](ARCHITECTURE.md).

## Repository layout (planned)

```
/                         # docs live at the root
  frontend/               # React + Vite web app
  backend/                # Node + Express API
  docs/                   # supplementary design docs (added as we go)
```

Backend and frontend source structure is defined in the master prompt (Section 16) and will
be created in Phase 1.

## Getting started (local development)

> These steps describe the intended setup. They become real in **Phase 1**; there is no
> runnable code yet.

### Prerequisites

- Node.js 20+ and npm
- A Firebase project (Auth + Firestore + Storage + Cloud Messaging enabled)
- An API key for at least one LLM provider (Groq or Google Gemini recommended to start)

### Setup

```bash
# 1. backend
cd backend
cp .env.example .env          # fill in Firebase Admin service-account values
npm install
node src/server.js            # http://localhost:4000  (see Windows note below)

# 2. frontend (second terminal)
cd frontend
cp .env.example .env.local    # fill in the PUBLIC Firebase web config
npm install
node ./node_modules/vite/bin/vite.js   # http://localhost:5173
```

The app runs without Firebase configured — the API returns 401 on protected routes and the
dashboard shows a friendly local shell — so you can see the UI before wiring credentials.

Never commit `.env`. Secrets belong on the server only. See [PRIVACY.md](PRIVACY.md) and
`.env.example`.

> **⚠ Windows note — the `&` in the folder name.** This project currently lives in a folder
> whose name contains `&` (`AI-Powered Personal Productivity & Digital Wellbeing System`).
> On Windows, npm runs package scripts through `cmd.exe`, which treats `&` as a command
> separator — so `npm run dev` / `npm run build` **fail** with errors like
> `'Digital' is not recognized`. Two options:
> 1. **Recommended:** rename the project folder to something without `&` or spaces (e.g.
>    `ai-lifeos`). Then `npm run dev` and `npm run build` work normally.
> 2. Or invoke the tools directly (works from any shell), as shown above:
>    `node ./node_modules/vite/bin/vite.js` for the frontend, `node src/server.js` for the
>    backend.

## Development phases

Build **in this order**. Do not build features out of order.

1. **Foundation** — project structure, Firebase + Auth + Firestore + Security Rules, user
   profile, timezone handling, dashboard shell.
2. **Core loop (MVP)** — Daily Planner, Tasks, done/missed capture, Dashboard,
   deterministic productivity score, Planned vs Actual summary, empty states.
3. **Lifestyle** — Habits, Sleep, Workout, Mood, Journal (encrypted), Calendar.
4. **Analytics** — daily/weekly/monthly analytics, nightly snapshots, richer Planned vs
   Actual, minimal charts.
5. **AI** — provider-agnostic layer, recommendation pipeline, AI Coach, summaries, NL
   commands, safety + evals.
6. **Life Timeline** — auto timeline, search/filter, day/week/month replay, AI story of the
   day, year in review.
7. **Digital Wellbeing** — manual focus logging first; native/desktop tracking later
   (feasibility-gated).
8. **Production & mobile** — React Native app, FCM push, offline hardening, monitoring,
   error tracking, deployment.

## Definition of done (v1)

A user can sign up, plan a day in time blocks, capture what actually happened with one tap,
and see a dashboard that shows planned vs actual plus a simple productivity score — all
timezone-correct, with clean empty states, on both desktop and mobile browser. No secrets in
the frontend; Firestore rules scope all data to its owner.

## Documentation

| Doc | Purpose |
| --- | --- |
| [SCOPE.md](SCOPE.md) | Explicit IN/OUT for v1. The most valuable doc here. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Firebase + Express split, diagram, risky decisions. |
| [DATA-MODEL.md](DATA-MODEL.md) | Firestore collections + security-rule intentions. |
| [PRIVACY.md](PRIVACY.md) | What's stored, encrypted, sent to AI; export/delete promise. |

Added as the project grows: `API-DESIGN.md`, `ROADMAP.md`, ADRs, `CONTRIBUTING.md`,
`DESIGN-SYSTEM.md`, `AI.md`, `TESTING.md`, `CHANGELOG.md`.

## License

See [LICENSE](LICENSE).
