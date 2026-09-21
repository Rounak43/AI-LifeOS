import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase.js';
import { computeDay } from '../scoring/computeDay.js';
import { summarizeFocus } from '../focus/focusEngine.js';

/**
 * Fetch the handful of days a week review needs.
 *
 * Only four collections, each with a single-field `localDate` range (so no composite
 * index — the same approach as the Life Timeline, ADR 0002). A week review is a review
 * surface, not a capture surface, so this fetches once on demand rather than holding
 * listeners open.
 *
 * Each day is reduced to a `computeDay` result on the way out, so the caller — and
 * ultimately the model — sees conclusions, never the underlying records.
 */

const DAY = 86400000;
const parseDay = (d) => Date.parse(`${d}T00:00:00Z`);
const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Inclusive YYYY-MM-DD list, oldest first. */
export function datesBetween(start, end) {
  const out = [];
  for (let t = parseDay(start); t <= parseDay(end) && out.length < 31; t += DAY) out.push(keyOf(t));
  return out;
}

/** The Monday–Sunday week containing `anchor`, ending no later than today. */
export function weekRangeFor(anchor, today) {
  const base = parseDay(anchor);
  const back = (new Date(base).getUTCDay() + 6) % 7; // days since Monday
  const start = base - back * DAY;
  const end = Math.min(start + 6 * DAY, parseDay(today));
  return { start: keyOf(start), end: keyOf(end >= start ? end : start) };
}

async function byLocalDate(uid, coll, start, end) {
  const snap = await getDocs(
    query(collection(db, 'users', uid, coll), where('localDate', '>=', start), where('localDate', '<=', end))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const groupBy = (items, key = 'localDate') => {
  const map = new Map();
  for (const item of items) {
    const k = item[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
};

/**
 * @param {string[]} restDayIndexes  profile.restDays — needed so a rest day scores as one
 * @returns {Promise<Array<{ date, day, focus, sleep }>>} oldest first
 */
export async function fetchDaysForRange(uid, { start, end, restDays = [], weekdayOf }) {
  const [tasks, plans, focus, sleeps] = await Promise.all([
    byLocalDate(uid, 'tasks', start, end),
    byLocalDate(uid, 'dailyPlans', start, end),
    byLocalDate(uid, 'focusSessions', start, end),
    byLocalDate(uid, 'sleepLogs', start, end),
  ]);

  const tasksByDay = groupBy(tasks);
  const plansByDay = new Map(plans.map((p) => [p.localDate, p]));
  const focusByDay = groupBy(focus);
  const sleepByDay = new Map(sleeps.map((s) => [s.localDate, s]));

  return datesBetween(start, end).map((date) => ({
    date,
    day: computeDay(tasksByDay.get(date) ?? [], plansByDay.get(date) ?? null, {
      isRestDay: restDays.includes(weekdayOf(date)),
    }),
    focus: summarizeFocus(focusByDay.get(date) ?? []),
    sleep: sleepByDay.get(date) ?? null,
  }));
}
