# SCOPE — AI LifeOS v1

> This is the most valuable document in the repo. It draws a hard line around v1.
> If it isn't listed **IN** below, it is **OUT** of v1 — no exceptions without updating
> this file first.

The guiding rule (Principle 1): **fewer features done well over many features done poorly.**
Ship the core loop, get a handful of real users logging real days, then earn each next
feature.

---

## The one thing v1 must nail

The **Planned vs Actual loop**:

```
plan the day in time blocks → capture what actually happened (one tap) →
show the difference → show a simple productivity score
```

The entire product depends on the user reliably capturing what they actually did.
**Low-friction capture is a first-class engineering problem, not a UI detail.** If logging
the real day takes effort, the core feature collapses.

---

## ✅ IN scope for v1

| Area | What ships |
| --- | --- |
| **Auth** | Firebase Auth: email/password + Google sign-in. Email verification, password reset. Express routes protected by Firebase ID-token verification. |
| **Daily Planner** | Create time blocks (start/end, title, priority, notes). One-tap ✅ done / ❌ missed on each block. Optional quick "actual time" adjust. |
| **Tasks** | Create, edit, set status, ✅/❌. Core fields only (title, priority, status, due date, category). |
| **Dashboard** | Today's plan, progress (completed/pending/missed), and a simple **Planned vs Actual** summary. Served by ONE aggregate `/dashboard` endpoint (no N+1 reads). |
| **Productivity score** | A **minimal, deterministic** score computed in code. No AI required. Weights configurable. Clearly labeled as an app-defined indicator. |
| **Foundations** | Timezone-correct "today" (per user), solid empty states everywhere, Firestore Security Rules scoping data to its owner, responsive on desktop + mobile browser. |

---

## ❌ OUT of scope for v1 (explicitly deferred)

These are **not** in v1. They arrive in later phases (see phase in parentheses).

- Habit tracker (Phase 3)
- Sleep tracking (Phase 3)
- Workout tracking (Phase 3)
- Mood + Journal, incl. encryption (Phase 3)
- Calendar & external calendar sync (Phase 3)
- Analytics beyond the daily summary; nightly snapshots; charts (Phase 4)
- AI Coach, recommendation pipeline, NL commands, daily/weekly AI summaries (Phase 5)
- Life Timeline / "story of the day" / year in review (Phase 6)
- Digital Wellbeing (manual focus logging then native tracking) (Phase 7)
- Gamification (XP, levels, badges) (later / optional)
- Life Balance multi-dimensional view (later)
- Push notifications via FCM (Phase 8)
- Offline-first with custom conflict resolution (deferred; lean on Firestore's cache)
- Mobile app (React Native / Expo) (Phase 8)

---

## Non-negotiables that still apply to v1

Even though v1 is small, these hard constraints apply from day one:

1. **Timezone correctness** — store the user's timezone and a `localDate` (YYYY-MM-DD) on
   every day-bound document. Compute "today," streaks, and rollovers in the user's
   timezone, never the server's. Decide this **before writing any date query.**
2. **Privacy & rules** — Firestore Security Rules scope every read/write to `users/{uid}/**`.
   No secrets in the frontend.
3. **Honest, configurable metrics** — the productivity score is deterministic, code-computed,
   configurable, and never presented as authoritative or scientific.
4. **Deliberate empty states** — a brand-new user (zero history) must see a friendly
   "plan your first day" experience, not empty score widgets.
5. **Low-friction capture** — if a screen adds friction, cut fields.

---

## How to change this document

Scope creep is the default failure mode. To move something from OUT to IN:

1. Open a discussion / ADR explaining why it belongs in v1.
2. Update this file in the same change.
3. Only then write the code.

"We'll just quickly add X" is how the core loop never ships. Resist it.
