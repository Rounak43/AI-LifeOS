# PRIVACY — AI LifeOS

Privacy is **first-class, not a settings tab** (Principle 4). AI LifeOS stores some of the
most sensitive data a person has: mood, journals, sleep, health signals, and behavior
patterns. This document is the promise we make to the user and the rules we hold ourselves to.

---

## The promise

1. **Your data is yours.** Every read and write is scoped to your account. No other user, and
   no unrelated service, can access it.
2. **You can leave with everything.** Full **data export** is available.
3. **You can be forgotten.** Full **data delete** (account + data) is available.
4. **We tell you what leaves your device.** Before any data goes to an AI provider, you know
   what and to whom (see §AI).
5. **We never judge you.** Scores and "balance" are encouraging indicators, never
   surveillance or punishment.

---

## What is stored, and where

| Data | Sensitivity | Storage |
| --- | --- | --- |
| Profile (name, occupation, timezone) | Low | Firestore, owner-scoped |
| Tasks, planner blocks, habits | Low–medium | Firestore, owner-scoped |
| Sleep, workout | Medium | Firestore, owner-scoped |
| Focus sessions, screen time | Medium | Firestore, owner-scoped — **self-reported only** |
| Mood logs | High | Firestore, owner-scoped |
| **Journal entries** | **Highest** | Firestore, **encrypted before storage** |
| Attachments, profile picture | Varies | Firebase Cloud Storage, owner-scoped |
| LLM API keys, Firebase Admin creds | Secret | **Server env only — never in the frontend** |

All Firestore access is governed by Security Rules that scope every read/write to
`users/{uid}/**` (see DATA-MODEL §Security).

### Nothing is measured in the background

The Focus page records only blocks you started yourself, and screen-time minutes only if you
type them in. The app does not read your device's screen time, does not watch which apps or
tabs you use, and cannot — a web app has no such access (ARCHITECTURE §4). Should a native
app ever add real OS tracking, it will be **opt-in, per-device, and disclosed at the point
it is turned on**, never enabled by an update.

---

## Encryption

- **Journal text** (and any field of equal sensitivity, e.g. free-text mood notes if we later
  judge them sensitive) is **encrypted before it is written** to Firestore. Security Rules
  cannot enforce encryption, so this is enforced in application code.
- Data in transit is always over **HTTPS**.
- Firestore encrypts data at rest by default; our field-level encryption is an **additional**
  layer for the most sensitive fields, so that even a database read does not reveal journal
  contents in plaintext.

> Key management detail (to be finalized before journals ship in Phase 3): where the
> encryption key lives and how it is derived is an explicit design decision recorded in an ADR
> at that time. Do not ship journals without that ADR.

---

## What goes to AI providers (critical)

This ties directly to Principle 4 and the AI section of the master prompt.

### Hard rules

- **Never send the whole database to the LLM.** Only a small, structured, aggregated context
  built server-side for a specific request.
- **Deterministic first.** All metrics (scores, completion %, planned-vs-actual) are computed
  in code. The LLM only receives already-computed summaries, never raw sensitive logs to do
  math on.
- **Journal and mood text is highly sensitive.** It is **never** routed to any free tier that
  trains on inputs. Specifically:
  - **Do not** send journal/mood through providers whose free tier trains on your data.
    Verified as of September 2026: **Google Gemini's free tier trains on submitted content
    and allows human review**; **Mistral's free "Experiment" tier trains on input**. The
    paid-terms exception for Gemini applies only in the EEA/Switzerland/UK. **Groq is
    contractually barred from training on inputs and retains nothing by default** — which
    is why it is the configured provider. This list lives in code as
    `TRAINS_ON_FREE_TIER` (`backend/src/services/ai/provider.js`) and the pipeline
    **refuses** to send consent-gated data to a provider on it.
  - Prefer providers with a **no-training** data policy for any sensitive content.
  - Gate journal/mood use behind **explicit, per-feature consent**.
  - Consider **stripping or summarizing** sensitive text before it is sent, or not sending it
    at all.
- **Always disclose** to the user what data leaves the device and to whom.

### Consent model

`settings.dataPermissions` records, per data category, whether the AI Coach may use it. The
AI Coach uses tasks/plans/habits/calendar/sleep/workout/screen-time/analytics/goals by
permission, and **journal/mood only if explicitly allowed**. Default for journal/mood: **off**.

**As built (Phase 5), this is enforced in code, not just promised:**

- **Journal is not "off by default" — it is impossible.** The AI boundary schema
  (`backend/src/services/ai/schemas.js`) is `.strict()` and has no journal field of any
  kind. A request carrying one is rejected with a 400 rather than silently stripped. The
  client-side builder never reads journal documents at all.
- **Mood requires `dataPermissions.mood === true`**, is sent as the **1–5 rating only**,
  and the free-text note a user writes with it never leaves the device — consent or not.
  The Coach page shows the toggle, off by default, next to a plain statement of what is
  sent. On a training-tier provider the toggle is disabled outright.
- **Task notes, descriptions, subtasks and tags are never sent** — only titles, statuses,
  priorities and estimates.
- **The context is capped**, not merely "small": 25 tasks, 20 blocks, 15 habits, 31 days,
  80-character titles. Enforced by the parser on both sides.
- **The server stores nothing.** It receives a context, returns language, and keeps no
  copy. Recommendations are written to the user's own Firestore subtree by their own
  client (docs/adr/0004).

---

## Security posture

- **Auth:** Firebase Auth (no hand-rolled auth). Express verifies the Firebase ID token on
  every request.
- **Transport:** HTTPS only, secure headers, rate limiting.
- **Validation:** server-side input validation (Zod/Joi) for anything trusted; Security Rules
  for cheap shape checks.
- **Secrets:** LLM keys and Firebase Admin credentials live in server environment variables
  only. They are **never** shipped to or reachable from the frontend. `.env` is gitignored;
  see `.env.example` for the variable list.
- **Least privilege:** data permissions default to the minimum; the user opts in to more.

---

## User controls (Settings → Privacy)

- Tracking permission and data-collection toggles.
- **Data export** (everything the account holds).
- **Data delete** (account + all associated data).
- Per-category AI data permissions.

---

## Design against anxiety (privacy of experience, not just of bytes)

Even correctly-stored data can feel like surveillance. So:

- Scores and streaks are framed to encourage, never to shame.
- "Balance" and productivity scores are clearly labeled **app-defined, configurable
  indicators** — never presented as scientific or authoritative.
- The app never makes a user feel judged for a bad day.

---

## AI safety (hard rules that also protect the user)

The AI must **not**: diagnose medical/mental-health conditions, give unsafe medical advice,
encourage extreme productivity or sleep deprivation, make unsupported psychological claims,
manipulate the user, or make decisions that belong to the user. Every recommendation is
dismissible.
