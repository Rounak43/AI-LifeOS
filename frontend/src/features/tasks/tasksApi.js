import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase.js';

/**
 * Tasks — simple per-user CRUD written directly to Firestore, guarded by Security
 * Rules (users/{uid}/tasks/**). Live via onSnapshot so the UI updates instantly.
 */

export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'missed', 'cancelled', 'archived'];
export const TASK_PRIORITIES = ['low', 'medium', 'high'];

function tasksCol(uid) {
  return collection(db, 'users', uid, 'tasks');
}

/**
 * Live listener for a single local day's tasks. Sorting is done client-side to
 * avoid needing a composite index.
 */
export function listenTasksForDate(uid, localDate, onData, onError) {
  const q = query(tasksCol(uid), where('localDate', '==', localDate));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export function createTask(uid, data) {
  return addDoc(tasksCol(uid), {
    title: data.title,
    notes: data.notes ?? null,
    priority: TASK_PRIORITIES.includes(data.priority) ? data.priority : 'medium',
    status: 'pending',
    category: data.category ?? null,
    estMinutes: Number.isFinite(data.estMinutes) ? data.estMinutes : null,
    actualMinutes: null,
    localDate: data.localDate,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updateTask(uid, id, patch) {
  return updateDoc(doc(db, 'users', uid, 'tasks', id), { ...patch, updatedAt: serverTimestamp() });
}

/** One-tap status change. Stamps completedAt when completing. */
export function setTaskStatus(uid, id, status) {
  const patch = { status, updatedAt: serverTimestamp() };
  if (status === 'completed') patch.completedAt = serverTimestamp();
  return updateDoc(doc(db, 'users', uid, 'tasks', id), patch);
}

export function deleteTask(uid, id) {
  return deleteDoc(doc(db, 'users', uid, 'tasks', id));
}
