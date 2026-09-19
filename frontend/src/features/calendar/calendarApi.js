import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase.js';

/** Calendar events — client-direct per-user CRUD. Each event is bound to a day (YYYY-MM-DD). */
export const EVENT_TYPES = [
  { id: 'class', label: 'Class', color: '#0ea5e9' },
  { id: 'exam', label: 'Exam', color: '#e11d54' },
  { id: 'assignment', label: 'Assignment', color: '#f97316' },
  { id: 'meeting', label: 'Meeting', color: '#5b5bd6' },
  { id: 'deadline', label: 'Deadline', color: '#dc2626' },
  { id: 'personal', label: 'Personal', color: '#16a34a' },
  { id: 'birthday', label: 'Birthday', color: '#a855f7' },
  { id: 'other', label: 'Other', color: '#64748b' },
];

export function eventColor(type) {
  return EVENT_TYPES.find((t) => t.id === type)?.color ?? '#64748b';
}

function eventsCol(uid) {
  return collection(db, 'users', uid, 'calendarEvents');
}

export function listenEvents(uid, cb, onError) {
  return onSnapshot(
    eventsCol(uid),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export function createEvent(uid, { title, date, time, type, notes }) {
  return addDoc(eventsCol(uid), {
    title,
    date,
    time: time || null,
    type: type ?? 'other',
    notes: notes ?? null,
    createdAt: serverTimestamp(),
  });
}

export function deleteEvent(uid, id) {
  return deleteDoc(doc(db, 'users', uid, 'calendarEvents', id));
}
