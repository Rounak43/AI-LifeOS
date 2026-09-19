import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase.js';

/**
 * Habits — simple per-user CRUD in Firestore. Each habit keeps its own list of
 * completed dates (YYYY-MM-DD) inline, so one live listener covers all habits and
 * streaks compute on the client with no extra reads. Dates older than 120 days are
 * pruned to keep the doc small.
 */
export const HABIT_COLORS = ['#5b5bd6', '#16a34a', '#f97316', '#e11d54', '#0ea5e9', '#a855f7', '#eab308'];

function habitsCol(uid) {
  return collection(db, 'users', uid, 'habits');
}

export function listenHabits(uid, onData, onError) {
  return onSnapshot(
    habitsCol(uid),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export function createHabit(uid, { name, color }) {
  return addDoc(habitsCol(uid), {
    name,
    color: HABIT_COLORS.includes(color) ? color : HABIT_COLORS[0],
    completedDates: [],
    createdAt: serverTimestamp(),
    archived: false,
  });
}

export function deleteHabit(uid, id) {
  return deleteDoc(doc(db, 'users', uid, 'habits', id));
}

function pruneOld(dates, cutoffDays = 120) {
  const cutoff = new Date(Date.now() - cutoffDays * 86400000).toISOString().slice(0, 10);
  return dates.filter((d) => d >= cutoff);
}

/** Toggle whether a habit is done for the given local day. */
export function toggleHabitDay(uid, habit, localDate) {
  const set = new Set(habit.completedDates ?? []);
  if (set.has(localDate)) set.delete(localDate);
  else set.add(localDate);
  const next = pruneOld([...set].sort());
  return updateDoc(doc(db, 'users', uid, 'habits', habit.id), { completedDates: next });
}

/**
 * Current streak: consecutive completed days ending today (if today is done) or
 * yesterday (if today isn't done yet). Pure + easy to reason about.
 */
export function currentStreak(completedDates = [], today) {
  const set = new Set(completedDates);
  const dayMs = 86400000;
  const parse = (s) => new Date(`${s}T00:00:00Z`).getTime();
  let cursor = parse(today);
  // If today isn't done, start counting from yesterday so a pending today doesn't zero it.
  if (!set.has(today)) cursor -= dayMs;
  let streak = 0;
  while (set.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak++;
    cursor -= dayMs;
  }
  return streak;
}

/** The last N local dates (YYYY-MM-DD), oldest first, for a weekly dot strip. */
export function recentDates(today, n = 7) {
  const dayMs = 86400000;
  const base = new Date(`${today}T00:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) =>
    new Date(base - (n - 1 - i) * dayMs).toISOString().slice(0, 10)
  );
}
