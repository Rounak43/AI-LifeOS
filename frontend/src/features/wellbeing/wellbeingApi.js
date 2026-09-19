import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  setDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase.js';

/** Sleep, mood and workouts — client-direct per-user CRUD, one doc/day for sleep & mood. */

// ---- Sleep (one per local day) --------------------------------------------
export function sleepMinutes(sleepTime, wakeTime) {
  const toMin = (s) => {
    const [h, m] = String(s ?? '').split(':').map(Number);
    return Number.isFinite(h) ? h * 60 + (m || 0) : NaN;
  };
  let d = toMin(wakeTime) - toMin(sleepTime);
  if (!Number.isFinite(d)) return 0;
  if (d <= 0) d += 24 * 60; // slept over midnight
  return d;
}

export function listenSleep(uid, localDate, cb, onError) {
  return onSnapshot(
    doc(db, 'users', uid, 'sleepLogs', localDate),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  );
}

export function saveSleep(uid, localDate, { sleepTime, wakeTime, quality }) {
  return setDoc(
    doc(db, 'users', uid, 'sleepLogs', localDate),
    {
      localDate,
      sleepTime,
      wakeTime,
      quality: quality ?? null,
      durationMin: sleepMinutes(sleepTime, wakeTime),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ---- Mood (one per local day) ---------------------------------------------
export const MOODS = [
  { v: 1, emoji: '😞', label: 'Rough' },
  { v: 2, emoji: '😕', label: 'Meh' },
  { v: 3, emoji: '😐', label: 'Okay' },
  { v: 4, emoji: '🙂', label: 'Good' },
  { v: 5, emoji: '😄', label: 'Great' },
];

export function listenMood(uid, localDate, cb, onError) {
  return onSnapshot(
    doc(db, 'users', uid, 'moodLogs', localDate),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  );
}

export function saveMood(uid, localDate, { mood, note }) {
  return setDoc(
    doc(db, 'users', uid, 'moodLogs', localDate),
    { localDate, mood: mood ?? null, note: note ?? null, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// ---- Workouts (many per day) ----------------------------------------------
export const WORKOUT_TYPES = ['Gym', 'Run', 'Walk', 'Cycling', 'Sport', 'Yoga', 'Other'];

function workoutsCol(uid) {
  return collection(db, 'users', uid, 'workoutLogs');
}

export function listenWorkouts(uid, localDate, cb, onError) {
  return onSnapshot(
    query(workoutsCol(uid), where('localDate', '==', localDate)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export function addWorkout(uid, { type, durationMin, localDate, notes }) {
  return addDoc(workoutsCol(uid), {
    type,
    durationMin: Number(durationMin) || 0,
    localDate,
    notes: notes ?? null,
    completed: true,
    createdAt: serverTimestamp(),
  });
}

export function deleteWorkout(uid, id) {
  return deleteDoc(doc(db, 'users', uid, 'workoutLogs', id));
}
