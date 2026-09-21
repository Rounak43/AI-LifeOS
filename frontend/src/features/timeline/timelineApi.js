import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase.js';
import { buildTimeline, datesBetween } from './buildTimeline.js';

/**
 * Life Timeline reads. Every collection is fetched with a single-field range on its
 * day key, so no composite index is needed. Habits are fetched whole (each doc keeps
 * its own completedDates array — see habitsApi) and filtered in the builder.
 *
 * Journal documents are read for their metadata only; `ciphertext` is never touched
 * here and the timeline shows an encrypted marker instead (PRIVACY.md).
 */

async function fetchByDayField(uid, coll, field, start, end) {
  const snap = await getDocs(
    query(collection(db, 'users', uid, coll), where(field, '>=', start), where(field, '<=', end))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Raw documents for a date range, unshaped. Exported for tests/debugging. */
export async function fetchTimelineData(uid, start, end) {
  const byLocalDate = (coll) => fetchByDayField(uid, coll, 'localDate', start, end);

  const [plans, tasks, sleeps, moods, workouts, journal, focus, events, habitsSnap] = await Promise.all([
    byLocalDate('dailyPlans'),
    byLocalDate('tasks'),
    byLocalDate('sleepLogs'),
    byLocalDate('moodLogs'),
    byLocalDate('workoutLogs'),
    byLocalDate('journalEntries'),
    byLocalDate('focusSessions'),
    fetchByDayField(uid, 'calendarEvents', 'date', start, end), // events key off `date`
    getDocs(collection(db, 'users', uid, 'habits')),
  ]);

  return {
    plans,
    tasks,
    sleeps,
    moods,
    workouts,
    journal,
    focus,
    events,
    habits: habitsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

/** Fetch + build the chronological timeline for an inclusive date range. */
export async function fetchTimeline(uid, { start, end, timezone } = {}) {
  const data = await fetchTimelineData(uid, start, end);
  const dates = datesBetween(start, end);
  return { dates, entries: buildTimeline(data, { timezone, dates }) };
}
