import { doc, onSnapshot, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase.js';

/**
 * Daily plan — one document per local day (users/{uid}/dailyPlans/{localDate}),
 * holding an ordered array of time blocks. A day's block list is small, so we read
 * the current array from state and write the whole array back on any mutation.
 *
 * The one-tap done/missed capture writes here — it must feel instant, so writes are
 * client-direct and the UI updates optimistically via the live listener.
 */

export const BLOCK_TYPES = ['focus', 'break', 'meeting', 'personal', 'health', 'other'];
export const BLOCK_PRIORITIES = ['low', 'medium', 'high'];

function planRef(uid, localDate) {
  return doc(db, 'users', uid, 'dailyPlans', localDate);
}

function emptyPlan(localDate) {
  return { id: localDate, localDate, timeBlocks: [] };
}

export function listenPlan(uid, localDate, onData, onError) {
  return onSnapshot(
    planRef(uid, localDate),
    (snap) => onData(snap.exists() ? { id: snap.id, ...snap.data() } : emptyPlan(localDate)),
    onError
  );
}

export async function getPlan(uid, localDate) {
  const snap = await getDoc(planRef(uid, localDate));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Persist the full ordered block list for a day. */
export function savePlanBlocks(uid, localDate, timeBlocks) {
  return setDoc(
    planRef(uid, localDate),
    { localDate, timeBlocks, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** A new block with a stable id. High priority marks it as a "key step" for scoring. */
export function makeBlock({ title, start, end, type = 'focus', priority = 'medium', linkedTaskId = null }) {
  return {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `blk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    start,
    end,
    type,
    priority: BLOCK_PRIORITIES.includes(priority) ? priority : 'medium',
    linkedTaskId,
    planned: true,
    status: null, // null = not yet captured; 'done' | 'missed' after one-tap
    actualMinutes: null,
  };
}

/** Sort blocks by start time (client-side ordering). */
export function sortBlocks(blocks = []) {
  return [...blocks].sort((a, b) => String(a.start).localeCompare(String(b.start)));
}
