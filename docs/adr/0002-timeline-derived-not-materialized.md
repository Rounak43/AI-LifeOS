# ADR 0002 — The Life Timeline is derived on read, not materialized

- **Status:** Accepted
- **Date:** 2026-09-20
- **Phase:** 6 (Life Timeline)

## Context

`DATA-MODEL.md` sketches a `users/{uid}/timelineEvents/{eventId}` collection
(`ts, localDate, icon, type, title, source, meta`) with an index on `localDate + ts`, i.e. a
**materialized** timeline: every feature would write a timeline row alongside its own record.

By the time Phase 6 landed, every source the timeline needs already exists and is already
day-keyed: `dailyPlans`, `tasks`, `calendarEvents`, `habits.completedDates`, `sleepLogs`,
`moodLogs`, `workoutLogs`, `journalEntries`. A materialized timeline would be a **second copy**
of all of it.

Two options:

1. **Materialize** — every write path also writes a `timelineEvents` row.
2. **Derive** — read the sources for a date range and build the chronology on read.

## Decision

**Derive it.** `features/timeline/buildTimeline.js` is a pure function that takes the raw
documents for a range and returns one sorted list; `features/timeline/timelineApi.js` does the
reads. No new collection, no new writes, no new index.

Three rules the builder enforces, because deriving makes them cheap:

- **No invented times.** Only sources that actually carry a clock time get one (plan-block
  `start`, calendar `time`, sleep `wakeTime`, task `completedAt`, workout/journal `createdAt`).
  Habits, mood and uncompleted tasks are day-stamped only, so they render under "Anytime"
  rather than being placed somewhere plausible-looking (Principle 5 — honest metrics).
- **Journal stays sealed.** Journal docs contribute a marker with `type` and `createdAt`;
  `ciphertext` is never read into a timeline entry and never decrypted here (PRIVACY.md).
  Reading an entry still requires the passphrase on the Journal page.
- **Queries stay index-free.** Each collection is fetched with a single-field range on its own
  day key (`localDate`, or `date` for calendar events), so `firestore.indexes.json` is
  untouched.

## Consequences

- ✅ The timeline can never drift from the records it describes — editing or deleting a task
  changes the timeline immediately, with no backfill, migration or repair job.
- ✅ Adding a new source is one loop in `buildTimeline`, not a new write path in a feature.
- ✅ The whole chronology is pure and unit-tested (`buildTimeline.test.js`) with no Firebase.
- ⚠️ A range costs 8 reads-worth of queries instead of one. Fine for day/week/month on a
  personal dataset; if a "whole year" replay is ever added, revisit with
  `analyticsSnapshots`-style pre-aggregation rather than by resurrecting `timelineEvents`.
- ⚠️ Not real-time: the timeline fetches on range change rather than holding eight
  `onSnapshot` listeners. It is a review surface, not a capture surface, so a fetch-on-open is
  the right trade (capture stays live on Dashboard/Planner).
- 📝 `timelineEvents` in `DATA-MODEL.md` is therefore **not implemented** and its planned
  `localDate + ts` index is not needed.
