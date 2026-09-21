/**
 * AI Coach eval set (Phase 5).
 *
 * Not a unit test: this one costs tokens and needs the network, so it is deliberately
 * kept out of `node --test`. Run it by hand whenever the model, provider or prompts
 * change, to catch the regressions a schema alone cannot:
 *
 *     node test/eval/coachEval.mjs            # summary
 *     node test/eval/coachEval.mjs --verbose  # full model output
 *
 * What it checks, per case:
 *  - the pipeline returns at all (transport, JSON mode, reasoning budget),
 *  - the output satisfies its Zod shape (already enforced in coachService),
 *  - a set of case-specific expectations about *content* — the things that silently
 *    rot when you swap models: does it respect a rest day, does it refuse to guess on
 *    an unparseable command, does it place blocks inside the day.
 *
 * Expectations are assertions about shape and behaviour, never exact wording — pinning
 * phrasing would make this fail on every temperature change and teach you to ignore it.
 */

import { dayContextSchema, weekContextSchema, commandRequestSchema } from '../../src/services/ai/schemas.js';
import { reviewDay, reviewWeek, planDay, parseCommand, behaviouralInsight } from '../../src/services/ai/coachService.js';
import { screenLine } from '../../src/services/ai/safety.js';
import { isAiConfigured, env } from '../../src/config/env.js';

const VERBOSE = process.argv.includes('--verbose');

// ---- fixtures ---------------------------------------------------------------

const busyDay = dayContextSchema.parse({
  date: '2026-09-20',
  timezone: 'Asia/Kolkata',
  goal: 'Land a backend internship',
  metrics: {
    score: 62,
    restDay: false,
    keySteps: { done: 2, total: 3 },
    tasks: { completed: 4, pending: 2, missed: 1, total: 7 },
    plan: { totalBlocks: 5, done: 3, missed: 1, plannedMinutes: 360, actualMinutes: 190, adherence: 0.53 },
    focus: { focusMin: 75, count: 3, byTag: { productive: 50, neutral: 25, distracting: 0 } },
    sleepMin: 380,
  },
  tasks: [
    { title: 'Finish DSA trees', status: 'completed', priority: 'high', estMinutes: 60, actualMinutes: 95 },
    { title: 'Write cover letter', status: 'missed', priority: 'high', estMinutes: 45 },
    { title: 'Reply to recruiter', status: 'pending', priority: 'medium', estMinutes: 15 },
  ],
  blocks: [
    { title: 'DSA practice', start: '08:00', end: '09:30', priority: 'high', status: 'done' },
    { title: 'Cover letter', start: '16:00', end: '17:00', priority: 'high', status: 'missed' },
  ],
  habits: [{ name: 'Read 20 min', doneToday: false, streakCurrent: 4 }],
});

/** The cold-start case: a brand-new account with nothing captured (Principle 6). */
const emptyDay = dayContextSchema.parse({
  date: '2026-09-20',
  timezone: 'Asia/Kolkata',
  metrics: {
    score: null,
    restDay: false,
    keySteps: { done: 0, total: 0 },
    tasks: { completed: 0, pending: 0, missed: 0, total: 0 },
    plan: { totalBlocks: 0, done: 0, missed: 0, plannedMinutes: 0, actualMinutes: 0 },
  },
});

const restDay = dayContextSchema.parse({
  ...busyDay,
  metrics: { ...busyDay.metrics, restDay: true, score: null },
});

const week = weekContextSchema.parse({
  startDate: '2026-09-14',
  endDate: '2026-09-20',
  goal: 'Land a backend internship',
  days: [
    { date: '2026-09-14', score: 78, tasksCompleted: 5, tasksMissed: 0, plannedMinutes: 300, actualMinutes: 280, focusMin: 120, sleepMin: 450 },
    { date: '2026-09-15', score: 71, tasksCompleted: 4, tasksMissed: 1, plannedMinutes: 300, actualMinutes: 240, focusMin: 100, sleepMin: 430 },
    { date: '2026-09-16', score: 44, tasksCompleted: 2, tasksMissed: 3, plannedMinutes: 420, actualMinutes: 130, focusMin: 25, sleepMin: 330 },
    { date: '2026-09-17', score: 51, tasksCompleted: 3, tasksMissed: 2, plannedMinutes: 420, actualMinutes: 170, focusMin: 50, sleepMin: 345 },
    { date: '2026-09-18', score: null, restDay: true, tasksCompleted: 0, tasksMissed: 0, plannedMinutes: 0, actualMinutes: 0 },
    { date: '2026-09-20', score: 62, tasksCompleted: 4, tasksMissed: 1, plannedMinutes: 360, actualMinutes: 190, focusMin: 75, sleepMin: 380 },
  ],
});

const cmd = (text, over = {}) =>
  commandRequestSchema.parse({
    text,
    today: '2026-09-20',
    timezone: 'Asia/Kolkata',
    openTasks: ['Reply to recruiter', 'Write cover letter'],
    blocks: [{ title: 'Workout', start: '18:00' }],
    ...over,
  });

// ---- expectations -----------------------------------------------------------

const allLines = (r) => [r.headline, ...(r.insights ?? []), ...(r.suggestions ?? []), r.note].filter(Boolean);

/** Every case gets this: nothing that survived the pipeline may trip the safety screen. */
const isSafe = (r) => {
  const bad = allLines(r).find((l) => !screenLine(l).safe);
  return bad ? `unsafe line survived: "${bad}"` : true;
};

const within = (hhmm) => /^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm);

const CASES = [
  {
    name: 'review a busy day',
    run: () => reviewDay(busyDay),
    expect: [
      isSafe,
      (r) => r.insights.length >= 1 || 'expected at least one insight',
      // The model must not invent a figure that was never supplied.
      (r) => !/\b(?:8|9|10)h\b/.test(allLines(r).join(' ')) || 'mentions hours not present in the context',
    ],
  },
  {
    name: 'review an empty day (cold start)',
    run: () => reviewDay(emptyDay),
    expect: [
      isSafe,
      // With nothing captured, the honest answer is to say so — not to invent a review.
      (r) =>
        /\b(?:no|nothing|not (?:enough|much)|empty|yet|haven'?t|start)\b/i.test(allLines(r).join(' ')) ||
        'expected it to admit there is nothing to review',
      (r) => (r.suggestions?.length ?? 0) <= 2 || 'should not pile on suggestions for an empty day',
    ],
  },
  {
    name: 'review a rest day',
    run: () => reviewDay(restDay),
    expect: [
      isSafe,
      (r) => /\brest\b/i.test(allLines(r).join(' ')) || 'expected the rest day to be acknowledged',
    ],
  },
  {
    name: 'review a week',
    run: () => reviewWeek(week),
    expect: [isSafe, (r) => r.insights.length >= 1 || 'expected at least one insight'],
  },
  {
    name: 'behavioural insight across a week',
    run: () => behaviouralInsight(week),
    expect: [
      isSafe,
      (r) => r.insights.length >= 1 || 'expected a pattern',
      (r) => r.insights.length <= 3 || 'insight should stay focused (max 3)',
    ],
  },
  {
    name: 'plan a day',
    run: () => planDay(busyDay),
    expect: [
      isSafe,
      (r) => r.blocks.length > 0 || 'expected at least one proposed block',
      (r) => r.blocks.every((b) => within(b.start) && within(b.end)) || 'block times must be real HH:MM',
      (r) => r.blocks.every((b) => b.start < b.end) || 'a block must end after it starts',
      // The whole point of this app: it must not hand back an over-full day.
      (r) => r.blocks.length <= 6 || `proposed ${r.blocks.length} blocks — too many`,
    ],
  },
  {
    name: 'plan a rest day proposes nothing',
    run: () => planDay(restDay),
    expect: [
      isSafe,
      (r) => r.blocks.length === 0 || `proposed ${r.blocks.length} blocks on a rest day`,
    ],
  },
  {
    name: 'command: create a task tomorrow',
    run: () => parseCommand(cmd('add DSA practice tomorrow at 8 AM')),
    expect: [
      (r) => ['create_task', 'create_block'].includes(r.intent) || `got intent "${r.intent}"`,
      (r) => r.task?.date === '2026-09-21' || `resolved "tomorrow" to ${r.task?.date}`,
      (r) => r.task?.start === '08:00' || `resolved "8 AM" to ${r.task?.start}`,
    ],
  },
  {
    name: 'command: move an existing block',
    run: () => parseCommand(cmd('move workout to 7 PM')),
    expect: [
      (r) => r.intent === 'move_block' || `got intent "${r.intent}"`,
      (r) => r.task?.start === '19:00' || `resolved "7 PM" to ${r.task?.start}`,
    ],
  },
  {
    name: 'command: refuses to guess at nonsense',
    run: () => parseCommand(cmd('what is the weather in Paris')),
    expect: [
      (r) => r.intent === 'unknown' || `guessed "${r.intent}" instead of admitting it did not understand`,
      (r) => r.task === undefined || 'returned a task for an instruction it did not understand',
    ],
  },
];

// ---- runner -----------------------------------------------------------------

if (!isAiConfigured()) {
  console.error(`No API key for provider "${env.ai.provider}". Set it in backend/.env first.`);
  process.exit(2);
}

console.log(`Eval: provider=${env.ai.provider} model=${env.ai.model} fast=${env.ai.fastModel}\n`);

let passed = 0;
let failed = 0;
const started = Date.now();

for (const testCase of CASES) {
  let result;
  try {
    const out = await testCase.run();
    result = out.result;
    if (VERBOSE) console.log(`\n${testCase.name}:\n${JSON.stringify(result, null, 1)}\n`);

    const failures = testCase.expect
      .map((check) => {
        try {
          return check(result);
        } catch (err) {
          return `check threw: ${err.message}`;
        }
      })
      .filter((v) => v !== true);

    if (failures.length === 0) {
      passed += 1;
      console.log(`  ok   ${testCase.name}  (${out.meta.ms}ms, ${out.meta.tokens ?? '?'} tok)`);
    } else {
      failed += 1;
      console.log(`  FAIL ${testCase.name}`);
      for (const f of failures) console.log(`       - ${f}`);
      if (!VERBOSE) console.log(`       output: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    failed += 1;
    console.log(`  ERROR ${testCase.name}: ${err.code ?? ''} ${err.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(failed > 0 ? 1 : 0);
