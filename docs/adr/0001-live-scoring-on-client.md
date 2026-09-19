# ADR 0001 — Live day-scoring on the client; server owns snapshots

- **Status:** Accepted
- **Date:** 2026-09-19
- **Phase:** 2 (core loop)

## Context

The core loop (PLAN → TRACK → COMPARE) lives or dies on **frictionless capture** and
**instant feedback**: when the user taps ✅/❌ on a time block, the productivity score and
Planned vs Actual must update immediately (Principle 2). At the same time:

- The spec says simple per-user CRUD should go **client → Firestore** directly (guarded by
  Security Rules), and trusted/aggregated computation should go through **Express**.
- The spec also says analytics should be **pre-computed into `analyticsSnapshots` nightly**
  and read back by the client (§9.8), and that metrics must be **deterministic, in code**
  (Principle 8).

Two plausible homes for the scoring math: the client (live) or Express (server-authoritative).

## Decision

Split by **timeframe**, so each metric has exactly one implementation:

1. **Live "today" score + Planned vs Actual → computed on the client**
   (`frontend/src/features/scoring/computeDay.js`, pure + unit-tested). Tasks and daily
   plans are written client-direct to Firestore and read via live `onSnapshot` listeners, so
   the score recomputes instantly with zero server round-trip and works offline.

2. **Historical / cross-day analytics → computed on the server (Phase 4)**, written to
   `analyticsSnapshots/{localDate}` by a nightly job using the Admin SDK, and read back by
   clients. This is where server-authoritative aggregation and trends live.

The Express `/dashboard` endpoint from Phase 1 remains as a server-authoritative aggregate
for future consumers (e.g. the mobile app) but is **not** on the web client's live path in
Phase 2; the web dashboard uses live Firestore data.

## Consequences

- ✅ One-tap capture feels instant; the loop is tight and offline-tolerant.
- ✅ Each number has a single implementation (no client/server formula duplication *within*
  a timeframe).
- ⚠️ The live client formula and the future nightly server formula must agree on shared
  concepts (completion rate, adherence). Mitigation: keep both pure and unit-tested against
  the same fixtures; when they grow, extract a shared package consumed by both runtimes.
- ⚠️ Live scores are computed on the client, so they are not server-verified. That is
  acceptable: scores are an app-defined, non-authoritative indicator (Principle 5), and the
  nightly snapshot provides the durable, server-side record.

## Revisit when

- We add habits/sleep/focus signals (Phase 3+) and the formula grows — consider extracting a
  shared scoring package.
- We build the mobile app (Phase 8) — it may prefer the Express aggregate over reimplementing
  live scoring.
