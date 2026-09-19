# ARCHITECTURE — AI LifeOS

This document explains how the pieces fit together, where the trust boundary sits, and the
risky decisions we're making on purpose.

---

## High-level diagram

```
                 ┌────────────────────────────┐
   React Web ────┤                            │
                 │  Firebase (Auth, Firestore,│──── real-time sync,
 React Native ───┤  Storage, FCM)             │     offline cache,
 (future)        │                            │     file storage
                 └───────────▲────────────────┘
                             │ Admin SDK
                             │ (verify ID token)
                 ┌───────────┴────────────────┐
   React Web ────┤   Node + Express API       │──── AI pipeline,
                 │   /api/v1/...              │     analytics,
                 │   business logic + secrets │     scoring,
                 └───────────▲────────────────┘     3rd-party APIs
                             │
                 ┌───────────┴────────────────┐
                 │  LLM provider (Gemini/Groq/ │
                 │  OpenRouter) + Open-Meteo    │
                 └─────────────────────────────┘
```

All devices sync the same user account through Firebase. Express is **stateless** and
horizontally scalable.

---

## The core decision: Firebase *and* Express

We use both. The boundary must stay clean, or the app becomes impossible to reason about.

### Firebase does

- **Authentication** — email/password, Google, verification, reset. We do **not** hand-roll
  auth.
- **Real-time data reads/writes** from the client for simple CRUD.
- **File storage** (attachments, profile pictures).
- **Push** (FCM).
- **Offline cache & basic sync** — provided for free by Firestore.

### Express does

Anything that must be **trusted, aggregated, or orchestrated**:

- The AI pipeline (and it holds the only copy of the LLM keys).
- Analytics computation and nightly snapshots.
- "Planned vs Actual" calculation and productivity/life-balance scoring.
- Third-party API calls (LLM providers, weather).
- Any write that must be validated server-side.

Express uses the **Firebase Admin SDK** and **verifies the client's Firebase ID token on
every request** (see `middleware/auth`).

### Rule of thumb

> Simple, per-user CRUD (tasks, habits, planner blocks) → **client talks to Firestore
> directly**, guarded by Security Rules.
>
> Trusted computation, secrets, or cross-record logic → **goes through Express.**
>
> **Never put API keys or LLM keys in the frontend.**

---

## Request flow (Express)

```
Routes → Controllers → Services → Firestore (Admin SDK)
```

Keep business logic **out of routes**. Routes wire HTTP to controllers; controllers validate
and delegate; services hold the actual logic (scoring, AI orchestration, aggregation).

### Backend structure

```
backend/src/
├── config/        # firebase-admin init, env loading
├── routes/        # /api/v1/... route definitions
├── controllers/   # request/response handling
├── services/      # business logic, AI pipeline, scoring, analytics
├── middleware/    # auth (verify Firebase ID token), validation, rate limit
├── validators/    # Zod/Joi schemas
├── jobs/          # nightly snapshots, summaries
├── utils/
└── app.js
```

### Frontend structure

```
frontend/src/
├── components/
├── pages/
├── layouts/
├── hooks/
├── services/   # firebase client, api client
├── context/
├── features/
├── utils/
└── assets/
```

---

## API surface

Base path: `/api/v1/`. Consistent JSON envelopes and HTTP status codes; documented with
OpenAPI/Swagger (`API-DESIGN.md`, added as we go).

Route groups: `/auth`, `/users`, `/dashboard` (aggregate), `/tasks`, `/planner`, `/habits`,
`/calendar`, `/timeline`, `/analytics`, `/ai`, `/wellbeing`, `/sleep`, `/workouts`,
`/journal`, `/notifications`, `/settings`, `/files`.

> v1 only implements the subset needed for the core loop: `/auth`, `/users`, `/dashboard`,
> `/tasks`, `/planner`, `/settings`. The rest are placeholders until their phase.

---

## Risky decisions (called out on purpose)

### 1. Timezones — decide before writing any date query

The whole app is organized around the **user's local day**, streaks and midnight. This is
easy to get catastrophically wrong.

- Store the user's timezone in their profile (`profile.timezone`).
- Store a `localDate` string (`YYYY-MM-DD` in the user's timezone) on **every day-bound
  document**.
- Always compute "today," streaks and rollovers in the **user's timezone**, never the
  server's.
- Store instants as Firestore `Timestamp`; use `localDate` for day-bucketed queries.

### 2. Auth — don't hand-roll it

Firebase Auth handles email/password, Google, verification and reset. Express trusts a
request only after verifying its Firebase ID token via the Admin SDK. HTTPS only, secure
headers, rate limiting, server-side input validation.

### 3. Offline & sync — deferred

Firestore gives an offline cache and basic sync for free; we lean on that. True offline-first
with custom conflict resolution is research-grade — **deferred**. When we eventually need it,
use an existing sync engine rather than hand-rolling conflict resolution.

### 4. Digital wellbeing tracking — feasibility-gated

A web app **cannot** read OS-level screen time. iOS Screen Time (DeviceActivity) APIs are
heavily restricted; Android needs a native app with special `UsageStats` permission; desktop
needs a separately installed agent. So: v1–v2 ship **manual focus-session logging**
(Pomodoro-style) and self-logged screen time. Automatic OS tracking is a late-phase
native/desktop effort and must **never block the core product**.

### 5. AI is orchestrated server-side, never trusted for math

The LLM is used only for language, summarization and suggestions. All metrics are computed
deterministically in code (Section: AI pipeline in the master prompt). We never send the whole
database to the LLM — see the aggregation pipeline in `AI.md` (added in Phase 5).

### 6. Aggregate reads, pre-compute analytics

Build ONE aggregate `/dashboard` endpoint rather than firing 8 separate reads. Pre-compute
analytics into `analyticsSnapshots` nightly and read snapshots on the client. Add the
composite Firestore indexes each common query needs (e.g. tasks by `localDate` + `status`).

---

## Observability & performance

- Error tracking (e.g. Sentry) and basic structured logging from early on.
- Unit tests for scoring/metrics; integration tests for the AI pipeline and key endpoints.
- Keep a small eval set for AI prompts so model swaps don't silently regress.

---

## Deployment targets

| Component | Target |
| --- | --- |
| React web | Vercel (or Firebase Hosting) |
| Express API | Railway / Render |
| Auth / DB / Storage / Push | Firebase |
| Mobile (later) | Expo → App Store / Google Play |

Environment variables carry: Firebase Admin credentials, LLM API key(s), external service
creds. **Never ship secrets to the client.**
