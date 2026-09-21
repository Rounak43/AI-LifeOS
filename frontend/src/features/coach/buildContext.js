/**
 * Coach context builders — Phase 5, client side of the AI boundary.
 *
 * These turn what the app already has in memory into the small, structured payload the
 * `/api/v1/ai` endpoints accept. The server re-validates everything with Zod
 * (`services/ai/schemas.js`) and rejects anything that doesn't fit, so this file is a
 * convenience, not the enforcement — but it is where the *omissions* are decided, and
 * they are deliberate:
 *
 *  - **No journal, ever.** Not the text, not the ciphertext, not a count. Journal
 *    entries are end-to-end encrypted and this device is the only place they can be
 *    read; sending anything derived from them would break that promise (PRIVACY.md).
 *  - **Mood only on explicit consent**, and only as the 1–5 rating. The free-text note
 *    a user writes with their mood never leaves the device.
 *  - **Numbers arrive pre-computed.** Everything here comes from `computeDay` /
 *    `summarizeFocus` — the same deterministic modules the UI renders. The model is
 *    handed conclusions, never asked to do arithmetic (ARCHITECTURE §5).
 *
 * Pure and framework-free so the exact payload is unit-tested without a network.
 */

/** Titles are capped here too, so an over-long one is trimmed rather than 400-ing. */
const trim = (s, max = 80) => String(s ?? '').trim().slice(0, max) || null;

const int = (n) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

const LIMITS = { tasks: 25, blocks: 20, habits: 15, days: 31 };

/**
 * One day of context.
 *
 * @param {Object} o
 * @param {string} o.date        the local day, YYYY-MM-DD
 * @param {string} o.timezone
 * @param {Object} o.day         the result of computeDay()
 * @param {Array}  [o.tasks]     today's task documents
 * @param {Object} [o.plan]      today's dailyPlan document
 * @param {Array}  [o.habits]    habit documents (with completedDates)
 * @param {Object} [o.focus]     the result of summarizeFocus()
 * @param {Object} [o.sleep]     today's sleepLog
 * @param {Object} [o.mood]      today's moodLog — used ONLY when consent.mood is true
 * @param {string} [o.goal]      the user's main goal
 * @param {Object} [o.consent]   { mood: boolean }
 */
export function buildDayContext({
  date,
  timezone = 'UTC',
  day,
  tasks = [],
  plan = null,
  habits = [],
  focus = null,
  sleep = null,
  mood = null,
  goal = null,
  consent = { mood: false },
}) {
  const moodAllowed = consent?.mood === true && Number.isFinite(mood?.mood);

  const context = {
    date,
    timezone,
    metrics: {
      score: Number.isFinite(day?.score) ? day.score : null,
      restDay: Boolean(day?.restDay),
      keySteps: { done: int(day?.keySteps?.done), total: int(day?.keySteps?.total) },
      tasks: {
        completed: int(day?.tasks?.completed),
        pending: int(day?.tasks?.pending) + int(day?.tasks?.inProgress),
        missed: int(day?.tasks?.missed),
        total: int(day?.tasks?.total),
      },
      plan: {
        totalBlocks: int(day?.plan?.totalBlocks),
        done: int(day?.plan?.done),
        missed: int(day?.plan?.missed),
        plannedMinutes: int(day?.plan?.plannedMinutes),
        actualMinutes: int(day?.plan?.actualMinutes),
        adherence: Number.isFinite(day?.plan?.adherence) ? day.plan.adherence : null,
      },
    },
    tasks: tasks
      .filter((t) => t.status !== 'cancelled' && t.status !== 'archived' && trim(t.title))
      .slice(0, LIMITS.tasks)
      .map((t) => ({
        title: trim(t.title),
        status: t.status ?? 'pending',
        priority: t.priority ?? 'medium',
        // Note what is NOT copied: notes, description, subtasks, tags.
        ...(Number.isFinite(t.estMinutes) ? { estMinutes: int(t.estMinutes) } : {}),
        ...(Number.isFinite(t.actualMinutes) ? { actualMinutes: int(t.actualMinutes) } : {}),
        ...(trim(t.category, 40) ? { category: trim(t.category, 40) } : {}),
      })),
    blocks: (plan?.timeBlocks ?? [])
      .filter((b) => trim(b.title) && b.start && b.end)
      .slice(0, LIMITS.blocks)
      .map((b) => ({
        title: trim(b.title),
        start: b.start,
        end: b.end,
        ...(b.type ? { type: String(b.type).slice(0, 20) } : {}),
        ...(b.priority ? { priority: b.priority } : {}),
        ...(b.status === 'done' || b.status === 'missed' ? { status: b.status } : {}),
      })),
    habits: habits
      .filter((h) => trim(h.name, 60))
      .slice(0, LIMITS.habits)
      .map((h) => ({
        name: trim(h.name, 60),
        doneToday: Boolean(h.completedDates?.includes(date)),
        ...(Number.isFinite(h.streakCurrent) ? { streakCurrent: int(h.streakCurrent) } : {}),
      })),
    consent: { mood: consent?.mood === true },
  };

  if (goal) context.goal = trim(goal, 120);

  if (focus && int(focus.count) > 0) {
    context.metrics.focus = {
      focusMin: int(focus.focusMin),
      count: int(focus.count),
      byTag: {
        productive: int(focus.byTag?.productive),
        neutral: int(focus.byTag?.neutral),
        distracting: int(focus.byTag?.distracting),
      },
    };
  }

  if (Number.isFinite(sleep?.durationMin) && sleep.durationMin > 0) {
    context.metrics.sleepMin = int(sleep.durationMin);
  }

  // The rating only. `mood.note` is free text the user wrote about their day and is
  // never included, consent or not.
  if (moodAllowed) context.mood = mood.mood;

  return context;
}

/**
 * A stretch of days, one summary row each — for week reviews and behavioural insight.
 *
 * @param {Array} days  [{ date, day (computeDay result), focus?, sleep? }]
 */
export function buildWeekContext({ startDate, endDate, timezone = 'UTC', days = [], goal = null, consent = { mood: false } }) {
  const context = {
    startDate,
    endDate,
    timezone,
    days: days.slice(0, LIMITS.days).map(({ date, day, focus, sleep }) => {
      const row = {
        date,
        score: Number.isFinite(day?.score) ? day.score : null,
        restDay: Boolean(day?.restDay),
        tasksCompleted: int(day?.tasks?.completed),
        tasksMissed: int(day?.tasks?.missed),
        plannedMinutes: int(day?.plan?.plannedMinutes),
        actualMinutes: int(day?.plan?.actualMinutes),
      };
      if (focus && int(focus.focusMin) > 0) row.focusMin = int(focus.focusMin);
      if (Number.isFinite(sleep?.durationMin) && sleep.durationMin > 0) row.sleepMin = int(sleep.durationMin);
      return row;
    }),
    consent: { mood: consent?.mood === true },
  };
  if (goal) context.goal = trim(goal, 120);
  return context;
}

/** The payload for an NL command. Titles only — enough to resolve "move my workout". */
export function buildCommandContext({ text, today, timezone = 'UTC', tasks = [], plan = null }) {
  return {
    text: String(text ?? '').trim().slice(0, 200),
    today,
    timezone,
    openTasks: tasks
      .filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'archived')
      .map((t) => trim(t.title))
      .filter(Boolean)
      .slice(0, 25),
    blocks: (plan?.timeBlocks ?? [])
      .filter((b) => trim(b.title) && b.start)
      .slice(0, 20)
      .map((b) => ({ title: trim(b.title), start: b.start })),
  };
}
