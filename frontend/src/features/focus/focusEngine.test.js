import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS,
  presetById,
  phaseMinutes,
  startRun,
  elapsedMs,
  remainingMs,
  progress,
  isComplete,
  pauseRun,
  resumeRun,
  nextPhase,
  formatClock,
  creditedMinutes,
  summarizeFocus,
  toMinutes,
  fromMinutes,
  nextPlannedBlock,
  continuousFocusMin,
  focusAdvice,
  normalizeTag,
} from './focusEngine.js';

const T0 = 1_758_000_000_000; // an arbitrary fixed "now"
const MIN = 60_000;
const classic = presetById('classic');

test('presets resolve, and an unknown id falls back to the first', () => {
  assert.equal(presetById('deep').focusMin, 50);
  assert.equal(presetById('nope').id, PRESETS[0].id);
  assert.equal(phaseMinutes(classic, 'focus'), 25);
  assert.equal(phaseMinutes(classic, 'short'), 5);
  assert.equal(phaseMinutes(classic, 'long'), 15);
});

test('a run measures elapsed time from timestamps, not from ticks', () => {
  const run = startRun({ preset: classic, now: T0 });
  assert.equal(run.durationMs, 25 * MIN);
  assert.equal(elapsedMs(run, T0), 0);
  assert.equal(remainingMs(run, T0), 25 * MIN);

  // The tab was backgrounded for 10 minutes; no interval fired. The clock still knows.
  assert.equal(elapsedMs(run, T0 + 10 * MIN), 10 * MIN);
  assert.equal(remainingMs(run, T0 + 10 * MIN), 15 * MIN);
  assert.equal(progress(run, T0 + 10 * MIN), 0.4);

  // Past the end it clamps rather than going negative / over 100%.
  assert.equal(remainingMs(run, T0 + 99 * MIN), 0);
  assert.equal(progress(run, T0 + 99 * MIN), 1);
  assert.equal(isComplete(run, T0 + 99 * MIN), true);
  assert.equal(isComplete(run, T0 + 24 * MIN), false);
});

test('pausing freezes the clock and resuming does not lose the pause', () => {
  const run = startRun({ preset: classic, now: T0 });
  const paused = pauseRun(run, T0 + 5 * MIN);

  // Five minutes later, still 5 minutes elapsed.
  assert.equal(elapsedMs(paused, T0 + 10 * MIN), 5 * MIN);
  assert.equal(remainingMs(paused, T0 + 10 * MIN), 20 * MIN);
  assert.equal(pauseRun(paused, T0 + 9 * MIN), paused, 'pausing twice is a no-op');

  const resumed = resumeRun(paused, T0 + 10 * MIN);
  assert.equal(resumed.pausedMs, 5 * MIN);
  assert.equal(elapsedMs(resumed, T0 + 12 * MIN), 7 * MIN, 'the paused stretch is excluded');
  assert.equal(resumeRun(resumed, T0 + 13 * MIN), resumed, 'resuming twice is a no-op');
});

test('phases cycle focus → short break, with a long break on the last cycle', () => {
  assert.deepEqual(nextPhase(classic, { phase: 'focus', cycle: 1 }), { phase: 'short', cycle: 1 });
  assert.deepEqual(nextPhase(classic, { phase: 'short', cycle: 1 }), { phase: 'focus', cycle: 2 });
  assert.deepEqual(nextPhase(classic, { phase: 'focus', cycle: 4 }), { phase: 'long', cycle: 4 });
  assert.deepEqual(nextPhase(classic, { phase: 'long', cycle: 4 }), { phase: 'focus', cycle: 1 });
  // "Deep work" earns its long break a cycle sooner.
  assert.deepEqual(nextPhase(presetById('deep'), { phase: 'focus', cycle: 3 }), { phase: 'long', cycle: 3 });
});

test('formatClock and creditedMinutes round honestly', () => {
  assert.equal(formatClock(25 * MIN), '25:00');
  assert.equal(formatClock(65 * 1000), '01:05');
  assert.equal(formatClock(65 * MIN), '1:05:00');
  assert.equal(formatClock(-5), '00:00');

  assert.equal(creditedMinutes(0), 0);
  assert.equal(creditedMinutes(25 * MIN), 25);
  assert.equal(creditedMinutes(90 * 1000), 2);
  // Real work is never rounded away to nothing.
  assert.equal(creditedMinutes(20 * 1000), 1);
});

test('summarizeFocus reports only what was captured', () => {
  const s = summarizeFocus([
    { actualMin: 25, tag: 'productive', completed: true },
    { actualMin: 12, tag: 'distracting', completed: false },
    { actualMin: 50, tag: 'productive', completed: true },
    { actualMin: 8, tag: 'made-up', completed: true }, // unknown tags land in neutral
  ]);
  assert.equal(s.count, 4);
  assert.equal(s.focusMin, 95);
  assert.equal(s.longestMin, 50);
  assert.equal(s.completed, 3);
  assert.equal(s.stoppedEarly, 1);
  assert.deepEqual(s.byTag, { productive: 75, neutral: 8, distracting: 12 });

  assert.deepEqual(summarizeFocus().byTag, { productive: 0, neutral: 0, distracting: 0 });
  assert.equal(summarizeFocus().focusMin, 0);
  assert.equal(normalizeTag('nonsense'), 'neutral');
});

test('clock strings convert both ways and reject junk', () => {
  assert.equal(toMinutes('08:30'), 510);
  assert.equal(toMinutes('00:00'), 0);
  assert.equal(toMinutes('nope'), null);
  assert.equal(toMinutes(null), null);
  assert.equal(fromMinutes(510), '08:30');
  assert.equal(fromMinutes(0), '00:00');
});

test('nextPlannedBlock skips the past and anything already captured', () => {
  const blocks = [
    { title: 'Standup', start: '09:00', status: 'done' },
    { title: 'DSA', start: '10:00' },
    { title: 'Gym', start: '18:00' },
    { title: 'Skipped', start: '11:00', status: 'missed' },
    { title: 'Broken', start: 'later' },
  ];
  assert.equal(nextPlannedBlock(blocks, toMinutes('08:00')).title, 'DSA');
  assert.equal(nextPlannedBlock(blocks, toMinutes('10:30')).title, 'Gym');
  assert.equal(nextPlannedBlock(blocks, toMinutes('19:00')), null);
  assert.equal(nextPlannedBlock(blocks, null), null);
  assert.equal(nextPlannedBlock([], 600), null);
});

test('continuousFocusMin resets after a real break', () => {
  const back2back = [
    { startMin: 540, endMin: 565 }, // 09:00–09:25
    { startMin: 570, endMin: 620 }, // 09:30–10:20  (5 min gap — same stretch)
  ];
  assert.equal(continuousFocusMin(back2back), 75);

  const withBreak = [
    { startMin: 540, endMin: 565 },
    { startMin: 600, endMin: 625 }, // 35 min gap — you rested, the count restarts
  ];
  assert.equal(continuousFocusMin(withBreak), 25);

  // Nothing running and the last stretch ended an hour ago: not "still going".
  assert.equal(continuousFocusMin(back2back, { nowMin: 680 }), 0);
  assert.equal(continuousFocusMin(back2back, { nowMin: 625 }), 75);
  assert.equal(continuousFocusMin([]), 0);
  assert.equal(continuousFocusMin([{ startMin: NaN, endMin: 5 }]), 0);
});

test('focusAdvice warns about overruns and suggests what fits', () => {
  const blocks = [{ title: 'Gym', start: '18:00' }];
  const nowMin = toMinutes('17:50');

  const overrun = focusAdvice({
    blocks,
    nowMin,
    run: { phase: 'focus' },
    remainingMin: 25,
  });
  assert.equal(overrun[0].id, 'overrun');
  assert.equal(overrun[0].tone, 'warn');
  assert.match(overrun[0].text, /Gym/);

  // A session that finishes before the block is fine — nothing to say about it.
  const fine = focusAdvice({ blocks, nowMin, run: { phase: 'focus' }, remainingMin: 5 });
  assert.equal(fine.find((a) => a.id === 'overrun'), undefined);

  // Breaks never trigger the overrun warning.
  const onBreak = focusAdvice({ blocks, nowMin, run: { phase: 'short' }, remainingMin: 25 });
  assert.equal(onBreak.find((a) => a.id === 'overrun'), undefined);

  // Idle with room: suggest a session that fits inside the gap.
  const fits = focusAdvice({ blocks, nowMin: toMinutes('17:00') });
  assert.equal(fits[0].id, 'fits');
  assert.match(fits[0].text, /60 min until/);

  // Idle with almost no room: say so instead of suggesting a doomed session.
  assert.equal(focusAdvice({ blocks, nowMin: toMinutes('17:55') })[0].id, 'tight');
});

test('focusAdvice nudges for a break, stays quiet otherwise, and caps at two', () => {
  const longHaul = focusAdvice({ sinceBreakMin: 95, run: { phase: 'focus' }, remainingMin: 10 });
  assert.equal(longHaul[0].id, 'break');
  assert.match(longHaul[0].text, /95 min/);
  assert.equal(focusAdvice({ sinceBreakMin: 40, run: { phase: 'focus' } }).length, 0);

  // Nothing planned, nothing running, nothing to say.
  assert.deepEqual(focusAdvice(), []);
  assert.deepEqual(focusAdvice({ blocks: [], nowMin: 600 }), []);

  // Rest day is an offer, not a push.
  assert.equal(focusAdvice({ restDay: true })[0].id, 'rest');
  assert.equal(focusAdvice({ restDay: true, run: { phase: 'focus' } }).length, 0);

  // Warnings come first and the list never floods the page.
  const noisy = focusAdvice({
    blocks: [{ title: 'Gym', start: '18:00' }],
    nowMin: toMinutes('17:50'),
    run: { phase: 'focus' },
    remainingMin: 25,
    sinceBreakMin: 120,
    restDay: true,
  });
  assert.equal(noisy.length, 2);
  assert.equal(noisy.every((a) => a.tone === 'warn'), true);
});
