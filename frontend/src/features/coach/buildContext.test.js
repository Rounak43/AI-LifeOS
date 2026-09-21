import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDayContext, buildWeekContext, buildCommandContext } from './buildContext.js';

const D = '2026-09-20';

/** A realistic computeDay() result. */
const day = (over = {}) => ({
  restDay: false,
  hasData: true,
  score: 62,
  keySteps: { done: 2, total: 3 },
  tasks: { completed: 4, pending: 1, inProgress: 1, missed: 1, total: 7 },
  plan: { totalBlocks: 5, done: 3, missed: 1, plannedMinutes: 360, actualMinutes: 190, adherence: 0.6 },
  ...over,
});

test('a day context carries the computed numbers, not the raw records', () => {
  const ctx = buildDayContext({
    date: D,
    timezone: 'Asia/Kolkata',
    day: day(),
    goal: 'Land a backend internship',
  });

  assert.equal(ctx.date, D);
  assert.equal(ctx.metrics.score, 62);
  assert.deepEqual(ctx.metrics.keySteps, { done: 2, total: 3 });
  // pending folds in in-progress — one "not done yet" number, as the UI shows it.
  assert.equal(ctx.metrics.tasks.pending, 2);
  assert.equal(ctx.goal, 'Land a backend internship');
});

test('journal never appears, in any form', () => {
  const ctx = buildDayContext({
    date: D,
    day: day(),
    // Whatever a caller passes, nothing journal-shaped is read.
    journal: [{ ciphertext: 'xxx', localDate: D }],
    journalEntries: [{ ciphertext: 'yyy' }],
  });

  const serialized = JSON.stringify(ctx);
  assert.doesNotMatch(serialized, /journal/i);
  assert.doesNotMatch(serialized, /ciphertext/i);
  assert.doesNotMatch(serialized, /xxx|yyy/);
});

test('mood is withheld without consent, and the note never travels', () => {
  const mood = { mood: 4, note: 'a private sentence about my day' };

  const without = buildDayContext({ date: D, day: day(), mood });
  assert.equal(without.mood, undefined);
  assert.equal(without.consent.mood, false);
  assert.doesNotMatch(JSON.stringify(without), /private sentence/);

  const with_ = buildDayContext({ date: D, day: day(), mood, consent: { mood: true } });
  assert.equal(with_.mood, 4);
  assert.equal(with_.consent.mood, true);
  // Consent covers the rating. It has never covered the free text.
  assert.doesNotMatch(JSON.stringify(with_), /private sentence/);
});

test('task notes, descriptions and tags are left behind', () => {
  const ctx = buildDayContext({
    date: D,
    day: day(),
    tasks: [
      {
        title: 'Write cover letter',
        status: 'missed',
        priority: 'high',
        estMinutes: 45,
        notes: 'mention the thing I am embarrassed about',
        description: 'long private description',
        tags: ['personal'],
        subtasks: [{ title: 'secret' }],
      },
    ],
  });

  assert.deepEqual(ctx.tasks[0], {
    title: 'Write cover letter',
    status: 'missed',
    priority: 'high',
    estMinutes: 45,
  });
  const serialized = JSON.stringify(ctx);
  assert.doesNotMatch(serialized, /embarrassed|private description|secret/);
});

test('cancelled and archived tasks are dropped; the rest are capped', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ title: `Task ${i}`, status: 'pending' }));
  const ctx = buildDayContext({
    date: D,
    day: day(),
    tasks: [
      ...many,
      { title: 'Cancelled', status: 'cancelled' },
      { title: 'Archived', status: 'archived' },
      { title: '   ', status: 'pending' },
    ],
  });

  assert.equal(ctx.tasks.length, 25, 'capped at the schema limit');
  assert.equal(ctx.tasks.some((t) => t.title === 'Cancelled'), false);
  assert.equal(ctx.tasks.some((t) => t.title === 'Archived'), false);
  assert.equal(ctx.tasks.every((t) => t.title), true, 'no blank titles');
});

test('long titles are trimmed rather than rejected', () => {
  const ctx = buildDayContext({
    date: D,
    day: day(),
    tasks: [{ title: 'x'.repeat(300), status: 'pending' }],
    goal: 'g'.repeat(300),
  });
  assert.equal(ctx.tasks[0].title.length, 80);
  assert.equal(ctx.goal.length, 120);
});

test('focus and sleep only appear when there is something to report', () => {
  const none = buildDayContext({ date: D, day: day(), focus: { count: 0, focusMin: 0 }, sleep: { durationMin: 0 } });
  assert.equal(none.metrics.focus, undefined, 'zero focus blocks is absent, not a zero');
  assert.equal(none.metrics.sleepMin, undefined, 'unlogged sleep is absent, not a zero');

  const some = buildDayContext({
    date: D,
    day: day(),
    focus: { count: 3, focusMin: 75, byTag: { productive: 50, neutral: 25, distracting: 0 } },
    sleep: { durationMin: 380 },
  });
  assert.deepEqual(some.metrics.focus, {
    focusMin: 75,
    count: 3,
    byTag: { productive: 50, neutral: 25, distracting: 0 },
  });
  assert.equal(some.metrics.sleepMin, 380);
});

test('habits report only whether they are done today', () => {
  const ctx = buildDayContext({
    date: D,
    day: day(),
    habits: [
      { name: 'Read 20 min', completedDates: [D, '2026-09-19'], streakCurrent: 4, color: '#fff' },
      { name: 'Meditate', completedDates: ['2026-09-19'], streakCurrent: 0 },
    ],
  });
  assert.deepEqual(ctx.habits[0], { name: 'Read 20 min', doneToday: true, streakCurrent: 4 });
  assert.equal(ctx.habits[1].doneToday, false);
  assert.doesNotMatch(JSON.stringify(ctx), /completedDates|#fff/);
});

test('a missing score stays null and never becomes zero', () => {
  const ctx = buildDayContext({ date: D, day: day({ score: null, hasData: false }) });
  assert.equal(ctx.metrics.score, null);

  const rest = buildDayContext({ date: D, day: day({ restDay: true, score: null }) });
  assert.equal(rest.metrics.restDay, true);
  assert.equal(rest.metrics.score, null);
});

test('a week context is one row per day', () => {
  const ctx = buildWeekContext({
    startDate: '2026-09-14',
    endDate: '2026-09-20',
    days: [
      { date: '2026-09-14', day: day(), focus: { focusMin: 120 }, sleep: { durationMin: 450 } },
      { date: '2026-09-15', day: day({ restDay: true, score: null }) },
    ],
  });

  assert.equal(ctx.days.length, 2);
  assert.equal(ctx.days[0].focusMin, 120);
  assert.equal(ctx.days[0].sleepMin, 450);
  assert.equal(ctx.days[1].restDay, true);
  assert.equal(ctx.days[1].score, null);
  assert.equal(ctx.days[1].focusMin, undefined);
  // No task titles, no block titles — a week is figures only.
  assert.doesNotMatch(JSON.stringify(ctx), /title/);
});

test('a command context carries titles only, and is length-capped', () => {
  const ctx = buildCommandContext({
    text: 'move workout to 7 PM',
    today: D,
    tasks: [
      { title: 'Reply to recruiter', status: 'pending', notes: 'private' },
      { title: 'Done thing', status: 'completed' },
    ],
    plan: { timeBlocks: [{ title: 'Workout', start: '18:00', end: '19:00', linkedTaskId: 'abc' }] },
  });

  assert.equal(ctx.text, 'move workout to 7 PM');
  assert.deepEqual(ctx.openTasks, ['Reply to recruiter'], 'completed tasks are irrelevant here');
  assert.deepEqual(ctx.blocks, [{ title: 'Workout', start: '18:00' }], 'no ids, no end times');
  assert.doesNotMatch(JSON.stringify(ctx), /private|abc/);

  const long = buildCommandContext({ text: 'x'.repeat(500), today: D });
  assert.equal(long.text.length, 200);
});
