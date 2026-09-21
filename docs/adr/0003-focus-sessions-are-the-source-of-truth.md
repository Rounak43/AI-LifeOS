# ADR 0003 — Focus sessions are the source of truth; `screenTimeLogs` is a self-report plus a mirror

- **Status:** Accepted
- **Date:** 2026-09-20
- **Phase:** 7 (Digital Wellbeing — the manual half)

## Context

`DATA-MODEL.md` sketches a single per-day document, `screenTimeLogs/{localDate}`, holding
`{ phoneMin, laptopMin, focusMin, idleMin, byCategory{} }`. That shape answers "how did today
go?" but cannot answer "what did I actually do, when?" — it has no room for an individual
Pomodoro block, its label, its tag, or the task it belonged to.

Phase 7 needs both:

- **Per-block records**, because the Life Timeline (ADR 0002) renders a day as a chronology
  and a focus block is one of the few things in this app that carries a genuinely known start
  and end time.
- **A per-day number**, because self-reported phone/laptop minutes have no other home, and
  because Phase 4 analytics and the Phase 5 AI context both want a cheap daily read rather
  than a scan of every session.

`ARCHITECTURE.md` §4 constrains all of this: a web app **cannot** read OS screen time, so
every number here is self-logged. That makes honesty (Principle 5) the governing concern —
the app must never present a figure the user did not actually give it.

## Decision

Two collections, with a clear owner for every number.

**`focusSessions/{sessionId}` is the source of truth.** One document per focus block that
actually ran, day-keyed by `localDate` exactly like `tasks`, `workoutLogs` and the rest:

```jsonc
{
  "localDate": "2026-09-20",
  "tag": "productive",        // productive | neutral | distracting — self-assigned
  "label": "DSA practice",
  "linkedTaskId": "task_abc",
  "presetId": "classic",
  "plannedMin": 25,
  "actualMin": 25,            // what you actually sat through
  "startedAt": Timestamp,
  "endedAt": Timestamp,
  "completed": true           // false = stopped early, and it still counts
}
```

**`screenTimeLogs/{localDate}` holds the self-report, plus a mirror.** `phoneMin`, `laptopMin`
and `note` are the numbers only the user can supply — they have no other source. Alongside
them sits a focus roll-up (`focusMin`, `sessionCount`, `byCategory`) that is **recomputed
wholesale from the day's sessions on every write, never incremented**.

Three supporting choices:

- **Only focus phases are logged.** Breaks are part of the rhythm, not an achievement, so
  they produce no documents. `idleMin` from the original sketch is therefore never written:
  nothing in a web app can observe idleness, and inventing it would be a lie.
- **The timer maths lives in a pure module** (`features/focus/focusEngine.js`), derived from
  timestamps rather than counted in ticks — a throttled background tab, a sleeping laptop or
  a page refresh all resolve to the correct remaining time. It is unit-tested with no
  Firebase and no React (`focusEngine.test.js`).
- **Schedule-aware nudges read the plan; they never write to it.** `focusAdvice()` compares
  the running block against `dailyPlans.timeBlocks` and returns at most two plain sentences.
  Nothing blocks, nothing auto-reschedules (Principle 4 — design against anxiety, and §10.1 —
  AI and the app assist, they don't decide).

## Consequences

- ✅ The timeline gets a genuinely timed source. Focus blocks carry a real `startedAt`, so
  they never land in the "Anytime" bucket that ADR 0002 reserves for day-stamped records.
- ✅ The mirror cannot drift. Because it is a full recompute of a list the client already
  holds, a deleted session immediately produces a correct total — no repair job, no counter
  that slowly goes wrong.
- ✅ Queries stay index-free: both collections are read by a single-field `localDate`
  equality or range, so `firestore.indexes.json` is untouched.
- ✅ Blank stays blank. An unanswered screen-time field is stored as `null`, never `0`, so
  "I didn't log it" can never render as "I used my phone for zero minutes".
- ⚠️ Two writes per completed block (the session, then the roll-up). Acceptable at personal
  scale, and both are owner-scoped writes the existing rules already cover.
- ⚠️ The roll-up is written by the client, so it is only as correct as the last client to
  touch that day. It is a cache for reads, and anything that must be exact — analytics,
  AI context — should recompute from `focusSessions`. When Phase 8 adds nightly
  `analyticsSnapshots`, that job becomes the authoritative producer of the daily figure.
- 📝 `idleMin` in `DATA-MODEL.md` is **not implemented** and should not be added without a
  native agent that can actually observe it.
