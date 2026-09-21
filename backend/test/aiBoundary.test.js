import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayContextSchema,
  weekContextSchema,
  commandRequestSchema,
  reviewOutputSchema,
  planOutputSchema,
  commandOutputSchema,
} from '../src/services/ai/schemas.js';
import { renderDayContext, renderWeekContext, renderCommandContext, SYSTEM } from '../src/services/ai/prompts.js';
import { screenLine, screenOutput, SAFETY_RULES } from '../src/services/ai/safety.js';
import { parseJsonReply, providerTrainsOnInput, TRAINS_ON_FREE_TIER } from '../src/services/ai/provider.js';

const D = '2026-09-20';

/** A minimal valid day context. */
const day = (over = {}) => ({
  date: D,
  timezone: 'Asia/Kolkata',
  metrics: {
    score: 62,
    restDay: false,
    keySteps: { done: 2, total: 3 },
    tasks: { completed: 4, pending: 2, missed: 1, total: 7 },
    plan: { totalBlocks: 5, done: 3, missed: 1, plannedMinutes: 360, actualMinutes: 190, adherence: 0.53 },
  },
  ...over,
});

// ---- the boundary is a privacy control --------------------------------------

test('journal text cannot enter a context, under any key', () => {
  for (const key of ['journal', 'journalText', 'journalEntries', 'entries', 'ciphertext', 'notes']) {
    const result = dayContextSchema.safeParse(day({ [key]: 'today I felt...' }));
    assert.equal(result.success, false, `"${key}" must be rejected, not silently dropped`);
  }
});

test('mood requires explicit consent and is a rating, never text', () => {
  // Present without consent → rejected outright.
  const noConsent = dayContextSchema.safeParse(day({ mood: 4 }));
  assert.equal(noConsent.success, false);
  assert.match(noConsent.error.issues[0].message, /consent/i);

  // Default consent is OFF even when the key is absent (PRIVACY.md §Consent model).
  assert.equal(dayContextSchema.parse(day()).consent.mood, false);

  // With consent → allowed.
  const withConsent = dayContextSchema.safeParse(day({ mood: 4, consent: { mood: true } }));
  assert.equal(withConsent.success, true);
  assert.equal(withConsent.data.mood, 4);

  // Free-text mood is never a valid shape.
  assert.equal(
    dayContextSchema.safeParse(day({ mood: 'awful, and here is why...', consent: { mood: true } })).success,
    false
  );
});

test('the context cannot grow without bound', () => {
  const many = (n) =>
    Array.from({ length: n }, (_, i) => ({ title: `Task ${i}`, status: 'pending', priority: 'medium' }));

  assert.equal(dayContextSchema.safeParse(day({ tasks: many(25) })).success, true);
  assert.equal(dayContextSchema.safeParse(day({ tasks: many(26) })).success, false, '26 tasks must be refused');

  // Long titles are truncated rather than rejected — a long title is not an error.
  const long = dayContextSchema.parse(day({ tasks: [{ title: 'x'.repeat(500), status: 'pending' }] }));
  assert.equal(long.tasks[0].title.length, 80);

  // A month is the ceiling for a range.
  const dayRow = { date: D, score: 50, tasksCompleted: 1, tasksMissed: 0, plannedMinutes: 60, actualMinutes: 30 };
  const week = (n) => ({ startDate: D, endDate: D, days: Array.from({ length: n }, () => dayRow) });
  assert.equal(weekContextSchema.safeParse(week(31)).success, true);
  assert.equal(weekContextSchema.safeParse(week(32)).success, false);
  assert.equal(weekContextSchema.safeParse(week(0)).success, false, 'an empty range has nothing to review');
});

test('malformed dates, times and scores are refused', () => {
  assert.equal(dayContextSchema.safeParse(day({ date: '20-09-2026' })).success, false);
  assert.equal(dayContextSchema.safeParse({ ...day(), metrics: { ...day().metrics, score: 140 } }).success, false);
  assert.equal(
    dayContextSchema.safeParse(day({ blocks: [{ title: 'x', start: '25:00', end: '26:00' }] })).success,
    false
  );
  assert.equal(commandRequestSchema.safeParse({ text: '', today: D }).success, false);
  assert.equal(commandRequestSchema.safeParse({ text: 'x'.repeat(201), today: D }).success, false);
});

// ---- what actually leaves the server ----------------------------------------

test('the rendered prompt contains the figures and nothing else', () => {
  const ctx = dayContextSchema.parse(
    day({
      goal: 'Land a backend internship',
      tasks: [{ title: 'Ship PR', status: 'completed', priority: 'high', estMinutes: 60 }],
      blocks: [{ title: 'DSA', start: '08:00', end: '09:30', priority: 'high', status: 'done' }],
      habits: [{ name: 'Read', doneToday: true, streakCurrent: 4 }],
      metrics: { ...day().metrics, focus: { focusMin: 75, count: 3 }, sleepMin: 380 },
    })
  );
  const rendered = renderDayContext(ctx);

  assert.match(rendered, /SCORE: 62\/100/);
  assert.match(rendered, /app-defined indicator/, 'the score is always framed honestly');
  assert.match(rendered, /KEY STEPS: 2 of 3/);
  assert.match(rendered, /planned 6h, captured 3h 10m/);
  assert.match(rendered, /FOCUS: 1h 15m across 3 self-logged/);
  assert.match(rendered, /SLEEP: 6h 20m \(self-logged\)/);
  assert.match(rendered, /Land a backend internship/);
  assert.match(rendered, /- 08:00-09:30 DSA \[key\] \[done\]/);
  assert.doesNotMatch(rendered, /MOOD/, 'no mood line when none was consented');
});

test('an unscored and a rest day are described honestly, not as failures', () => {
  const unscored = renderDayContext(
    dayContextSchema.parse(day({ metrics: { ...day().metrics, score: null } }))
  );
  assert.match(unscored, /not enough captured to score/);
  assert.doesNotMatch(unscored, /SCORE: 0/, 'missing data must never render as zero');

  const rest = renderDayContext(
    dayContextSchema.parse(day({ metrics: { ...day().metrics, restDay: true } }))
  );
  assert.match(rest, /REST DAY: yes/);
  assert.match(rest, /no work expected/);
});

test('a week renders as one row per day, and a command carries only titles', () => {
  const week = renderWeekContext(
    weekContextSchema.parse({
      startDate: '2026-09-14',
      endDate: '2026-09-15',
      days: [
        { date: '2026-09-14', score: 70, tasksCompleted: 3, tasksMissed: 1, plannedMinutes: 240, actualMinutes: 200 },
        { date: '2026-09-15', score: null, restDay: true, tasksCompleted: 0, tasksMissed: 0, plannedMinutes: 0, actualMinutes: 0 },
      ],
    })
  );
  assert.match(week, /- 2026-09-14: score 70/);
  assert.match(week, /- 2026-09-15: rest day \(not scored\)/);

  const cmd = renderCommandContext(
    commandRequestSchema.parse({ text: 'add DSA tomorrow at 8 AM', today: D, openTasks: ['Ship PR'] })
  );
  assert.match(cmd, /INSTRUCTION: add DSA tomorrow at 8 AM/);
  assert.match(cmd, /TODAY: 2026-09-20/);
});

test('every system prompt carries the safety rules', () => {
  for (const [name, prompt] of Object.entries(SYSTEM)) {
    if (name === 'command') continue; // extraction only — it generates no advice
    assert.ok(prompt.includes(SAFETY_RULES), `${name} must include the safety rules`);
    assert.match(prompt, /JSON only/i, `${name} must demand JSON`);
  }
});

// ---- safety screening -------------------------------------------------------

test('the screen catches the advice §10.1 forbids', () => {
  const unsafe = [
    'Sleep duration is slightly below the recommended 7-9 hours.',
    'You should get at least 8 hours of sleep.',
    'These may be signs of burnout.',
    "You're clearly depressed.",
    'Try melatonin to fix your sleep.',
    'Wake up earlier to catch up on what you missed.',
    'You need to push through and stop making excuses.',
    'You failed to hit your targets today.',
    "Don't break the chain — keep the streak alive!",
    'Your poor sleep is causing your low score.',
  ];
  for (const line of unsafe) {
    assert.equal(screenLine(line).safe, false, `should be caught: "${line}"`);
  }
});

test('the screen leaves ordinary coaching alone', () => {
  const safe = [
    'You captured 3h 10m against a 6h plan.',
    'You slept 6h 20m and logged 75 minutes of focus.',
    'On the days you logged less sleep, you also captured fewer planned minutes.',
    'Your morning blocks held up; the afternoon ones slipped.',
    'You could try planning one fewer block tomorrow.',
    'There is not enough captured here to say anything useful yet.',
  ];
  for (const line of safe) {
    assert.equal(screenLine(line).safe, true, `should pass: "${line}"`);
  }
});

test('screenOutput drops bad lines but keeps the response usable', () => {
  const { output, removed } = screenOutput({
    headline: 'A solid day',
    insights: ['You captured 3h of 6h planned.', 'You should get 8 hours of sleep.'],
    suggestions: ["Don't break the chain!", 'Consider planning one fewer block.'],
  });

  assert.equal(output.insights.length, 1);
  assert.equal(output.suggestions.length, 1);
  assert.equal(output.headline, 'A solid day', 'a clean headline is untouched');
  assert.equal(removed.length, 2);
  assert.deepEqual(removed.map((r) => r.field).sort(), ['insights', 'suggestions']);
});

test('an unsafe headline is replaced, never left empty', () => {
  const { output } = screenOutput({ headline: 'You failed today', insights: ['ok'] });
  assert.equal(output.headline, 'Here is what your day shows');
  assert.ok(output.headline.length > 0, 'the shape requires a headline');
});

// ---- output contract --------------------------------------------------------

test('model output is validated, not trusted', () => {
  // Over-long and over-many are refused.
  assert.equal(reviewOutputSchema.safeParse({ headline: 'x'.repeat(91), insights: ['a'] }).success, false);
  assert.equal(
    reviewOutputSchema.safeParse({ headline: 'ok', insights: ['a', 'b', 'c', 'd', 'e'] }).success,
    false
  );
  assert.equal(reviewOutputSchema.safeParse({ headline: 'ok', insights: [] }).success, false);

  // Extra keys a model might invent are stripped rather than passed through.
  const parsed = reviewOutputSchema.parse({
    headline: 'ok',
    insights: ['a'],
    somethingInvented: { nested: true },
  });
  assert.equal('somethingInvented' in parsed, false);

  // A proposed block must carry real clock times.
  assert.equal(
    planOutputSchema.safeParse({ headline: 'ok', blocks: [{ title: 'DSA', start: 'morning', end: '10:00' }] }).success,
    false
  );

  // "I don't know" is a first-class answer for commands.
  const unknown = commandOutputSchema.parse({ intent: 'unknown', confidence: 0.2 });
  assert.equal(unknown.intent, 'unknown');
  assert.equal(unknown.task, undefined);
});

test('a code-fenced reply is tolerated; junk is refused', () => {
  assert.deepEqual(parseJsonReply('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonReply('  {"a":1}  '), { a: 1 });
  assert.throws(() => parseJsonReply('Sure! Here is your review:'), /unreadable/i);
});

test('providers that train on free-tier input are known to the code', () => {
  assert.equal(TRAINS_ON_FREE_TIER.has('gemini'), true);
  assert.equal(TRAINS_ON_FREE_TIER.has('mistral'), true);
  assert.equal(providerTrainsOnInput('groq'), false, 'Groq is contractually no-training');
});
