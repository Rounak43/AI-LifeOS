import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDay, summarizeTasks, summarizePlan, blockDurationMinutes } from './computeDay.js';

const task = (status, priority = 'medium') => ({ status, priority });
const block = (status, priority = 'medium', start = '08:00', end = '09:00') => ({
  status,
  priority,
  start,
  end,
});

test('summarizeTasks counts states, ignores cancelled/archived', () => {
  const s = summarizeTasks([task('completed'), task('completed'), task('pending'), task('cancelled')]);
  assert.equal(s.completed, 2);
  assert.equal(s.total, 3);
});

test('blockDurationMinutes handles HH:MM and bad input', () => {
  assert.equal(blockDurationMinutes({ start: '08:00', end: '09:30' }), 90);
  assert.equal(blockDurationMinutes({ start: '09:00', end: '08:00' }), 0);
});

test('summarizePlan aggregates adherence and minutes', () => {
  const p = summarizePlan({
    timeBlocks: [block('done'), block('done', 'medium', '10:00', '10:30'), block('missed')],
  });
  assert.equal(p.totalBlocks, 3);
  assert.equal(p.done, 2);
  assert.equal(p.adherence, 2 / 3);
});

test('rest day is not scored', () => {
  const r = computeDay([task('completed', 'high')], null, { isRestDay: true });
  assert.equal(r.restDay, true);
  assert.equal(r.score, null);
});

test('cold start: no data → null score', () => {
  const r = computeDay([], null);
  assert.equal(r.hasData, false);
  assert.equal(r.score, null);
});

test('all key steps done, no extras → 70', () => {
  const r = computeDay([task('completed', 'high'), task('completed', 'high')], null);
  assert.equal(r.keySteps.total, 2);
  assert.equal(r.keySteps.done, 2);
  assert.equal(r.score, 70);
});

test('all key steps + all other done → 100', () => {
  const r = computeDay(
    [task('completed', 'high'), task('completed', 'medium')],
    { timeBlocks: [block('done', 'low')] }
  );
  // key: 1/1 → 70 ; other: 2/2 → 30 → 100
  assert.equal(r.score, 100);
});

test('half key steps, no extras → 35', () => {
  const r = computeDay([task('completed', 'high'), task('pending', 'high')], null);
  // 70 * 0.5 = 35
  assert.equal(r.score, 35);
});

test('key done but other unfinished caps below 100', () => {
  const r = computeDay(
    [task('completed', 'high'), task('pending', 'medium'), task('pending', 'medium')],
    null
  );
  // key 1/1 → 70 ; other 0/2 → 0 → 70
  assert.equal(r.score, 70);
});

test('no key steps flagged → judged on plain completion', () => {
  const r = computeDay([task('completed', 'medium'), task('pending', 'medium')], null);
  // no high-priority items → 100 * 1/2 = 50
  assert.equal(r.keySteps.total, 0);
  assert.equal(r.score, 50);
});

test('high-priority blocks count as key steps too', () => {
  const r = computeDay([], { timeBlocks: [block('done', 'high'), block('missed', 'high')] });
  // key 1/2 → 70*0.5 = 35 ; no other → 35
  assert.equal(r.keySteps.total, 2);
  assert.equal(r.score, 35);
});
