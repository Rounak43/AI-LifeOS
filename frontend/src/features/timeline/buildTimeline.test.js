import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTimeline,
  rangeFor,
  shiftAnchor,
  datesBetween,
  clockOf,
  prettyTime,
  filterTimeline,
  groupByDay,
  summarizeDay,
} from './buildTimeline.js';

const D = '2026-09-18'; // a Friday

test('rangeFor covers the day, the Mon–Sun week and the calendar month', () => {
  assert.deepEqual(rangeFor(D, 'day'), { start: D, end: D });
  assert.deepEqual(rangeFor(D, 'week'), { start: '2026-09-14', end: '2026-09-20' });
  assert.deepEqual(rangeFor(D, 'month'), { start: '2026-09-01', end: '2026-09-30' });
  // Sunday belongs to the week that started the previous Monday.
  assert.deepEqual(rangeFor('2026-09-20', 'week'), { start: '2026-09-14', end: '2026-09-20' });
});

test('shiftAnchor steps by one view in each direction', () => {
  assert.equal(shiftAnchor(D, 'day', 1), '2026-09-19');
  assert.equal(shiftAnchor(D, 'week', -1), '2026-09-11');
  assert.equal(shiftAnchor(D, 'month', 1), '2026-10-18');
});

test('datesBetween is inclusive and oldest-first', () => {
  assert.deepEqual(datesBetween('2026-09-18', '2026-09-20'), ['2026-09-18', '2026-09-19', '2026-09-20']);
});

test('clockOf reads Timestamps, Dates and junk', () => {
  assert.equal(clockOf(new Date('2026-09-18T05:30:00Z'), 'UTC'), '05:30');
  assert.equal(clockOf({ seconds: Date.parse('2026-09-18T23:05:00Z') / 1000 }, 'UTC'), '23:05');
  assert.equal(clockOf({ toDate: () => new Date('2026-09-18T00:00:00Z') }, 'UTC'), '00:00');
  assert.equal(clockOf(null, 'UTC'), null);
  assert.equal(prettyTime('13:05'), '1:05 PM');
  assert.equal(prettyTime('00:00'), '12:00 AM');
  assert.equal(prettyTime('nope'), null);
});

test('buildTimeline pulls every source into one chronological day', () => {
  const entries = buildTimeline(
    {
      plans: [
        {
          localDate: D,
          timeBlocks: [
            { id: 'b1', title: 'DSA practice', start: '08:00', end: '09:30', type: 'focus', priority: 'high', status: 'done' },
            { id: 'b2', title: 'Gym', start: '18:00', end: '19:00', type: 'health', status: 'missed' },
          ],
        },
      ],
      tasks: [
        { id: 't1', localDate: D, title: 'Ship PR', status: 'completed', priority: 'high', completedAt: new Date('2026-09-18T10:00:00Z') },
        { id: 't2', localDate: D, title: 'Email prof', status: 'pending' },
        { id: 't3', localDate: D, title: 'Ignore me', status: 'archived' },
      ],
      events: [{ id: 'e1', date: D, title: 'Lecture', time: '11:00', type: 'class' }],
      habits: [{ id: 'h1', name: 'Read 20 min', completedDates: [D, '2026-09-17'] }],
      sleeps: [{ localDate: D, sleepTime: '23:30', wakeTime: '06:30', durationMin: 420, quality: 4 }],
      workouts: [{ id: 'w1', localDate: D, type: 'Run', durationMin: 35, createdAt: new Date('2026-09-18T17:15:00Z') }],
      moods: [{ localDate: D, mood: 4, note: 'solid day' }],
      journal: [{ id: 'j1', localDate: D, type: 'evening', ciphertext: 'xx', createdAt: new Date('2026-09-18T22:00:00Z') }],
    },
    { timezone: 'UTC', dates: [D] }
  );

  // '2026-09-17' habit day is outside the requested range and must be dropped.
  assert.equal(entries.every((e) => e.date === D), true);
  assert.equal(entries.find((e) => e.kind === 'task' && e.title === 'Ignore me'), undefined);

  const timed = entries.filter((e) => e.time).map((e) => e.time);
  assert.deepEqual(timed, [...timed].sort(), 'timed entries are in clock order');
  assert.equal(timed[0], '06:30', 'the day starts at wake time');

  const untimed = entries.filter((e) => !e.time);
  assert.equal(entries.slice(-untimed.length).every((e) => !e.time), true, 'untimed entries sort last');
  assert.deepEqual(
    untimed.map((e) => e.kind).sort(),
    ['habit', 'mood', 'task'],
    'only day-stamped sources are untimed'
  );

  const journal = entries.find((e) => e.kind === 'journal');
  assert.equal(journal.locked, true);
  assert.equal(journal.detail.includes('encrypted'), true);
  assert.equal('ciphertext' in journal, false, 'ciphertext never reaches the timeline');

  assert.equal(entries.find((e) => e.title === 'DSA practice').keyStep, true);
  assert.equal(entries.find((e) => e.title === 'Slept 7h').time, '06:30');
});

test('focus sessions join the timeline at the time they started', () => {
  const entries = buildTimeline(
    {
      focus: [
        {
          id: 'f1',
          localDate: D,
          label: 'DSA practice',
          tag: 'productive',
          actualMin: 25,
          completed: true,
          startedAt: new Date('2026-09-18T08:00:00Z'),
        },
        {
          id: 'f2',
          localDate: D,
          tag: 'distracting',
          actualMin: 9,
          completed: false,
          startedAt: new Date('2026-09-18T14:30:00Z'),
        },
      ],
    },
    { timezone: 'UTC', dates: [D] }
  );

  assert.equal(entries.length, 2);
  assert.equal(entries[0].time, '08:00');
  assert.equal(entries[0].title, 'DSA practice · 25m');
  assert.equal(entries[0].detail, 'Productive');

  // An unlabelled block still reads as something; stopping early is said out loud but
  // is never recorded as a miss — the minutes genuinely happened.
  const cutShort = entries[1];
  assert.equal(cutShort.title, 'Focus session · 9m');
  assert.equal(cutShort.detail, 'Distracting · stopped early');
  assert.equal(cutShort.status, 'done');
});

test('buildTimeline is empty and safe with no data', () => {
  assert.deepEqual(buildTimeline(), []);
  assert.deepEqual(buildTimeline({}, { dates: [D] }), []);
});

test('filterTimeline matches on kind and free text', () => {
  const entries = [
    { kind: 'task', title: 'Ship PR', detail: 'work' },
    { kind: 'habit', title: 'Read 20 min', detail: 'Habit completed' },
  ];
  assert.equal(filterTimeline(entries, { kinds: new Set(['habit']) }).length, 1);
  assert.equal(filterTimeline(entries, { q: 'ship' })[0].title, 'Ship PR');
  assert.equal(filterTimeline(entries, { q: 'work' }).length, 1, 'detail is searched too');
  assert.equal(filterTimeline(entries, {}).length, 2, 'no filter means everything');
});

test('groupByDay and summarizeDay describe a day honestly', () => {
  const entries = [
    { date: '2026-09-19', status: 'done' },
    { date: D, status: 'done' },
    { date: D, status: 'missed' },
    { date: D, status: 'open' },
    { date: D, status: null },
  ];
  const days = groupByDay(entries);
  assert.deepEqual(days.map((d) => d.date), ['2026-09-19', D]);
  assert.deepEqual(summarizeDay(days[1].entries), { total: 4, done: 1, missed: 1, open: 1 });
});
