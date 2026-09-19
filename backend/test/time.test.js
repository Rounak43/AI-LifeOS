import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localDate,
  normalizeTimezone,
  greetingForHour,
  DEFAULT_TIMEZONE,
} from '../src/utils/time.js';

test('normalizeTimezone falls back to UTC for invalid input', () => {
  assert.equal(normalizeTimezone('Not/AZone'), DEFAULT_TIMEZONE);
  assert.equal(normalizeTimezone(''), DEFAULT_TIMEZONE);
  assert.equal(normalizeTimezone(undefined), DEFAULT_TIMEZONE);
  assert.equal(normalizeTimezone('Asia/Kolkata'), 'Asia/Kolkata');
});

test('localDate buckets an instant into the USER timezone, not the server', () => {
  // 2026-01-01T02:30:00Z is still 2025-12-31 in New York (UTC-5),
  // but already 2026-01-01 in Kolkata (UTC+5:30).
  const instant = new Date('2026-01-01T02:30:00Z');
  assert.equal(localDate('America/New_York', instant), '2025-12-31');
  assert.equal(localDate('Asia/Kolkata', instant), '2026-01-01');
  assert.equal(localDate('UTC', instant), '2026-01-01');
});

test('localDate returns YYYY-MM-DD format', () => {
  const s = localDate('UTC', new Date('2026-09-18T12:00:00Z'));
  assert.match(s, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(s, '2026-09-18');
});

test('greetingForHour picks a sensible greeting', () => {
  assert.equal(greetingForHour(2), 'Good night');
  assert.equal(greetingForHour(9), 'Good morning');
  assert.equal(greetingForHour(14), 'Good afternoon');
  assert.equal(greetingForHour(19), 'Good evening');
  assert.equal(greetingForHour(23), 'Good night');
});
