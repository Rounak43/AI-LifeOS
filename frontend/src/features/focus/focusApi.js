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
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase.js';
import { localMinutesOfDay, toDateSafe } from '../../utils/time.js';
import { normalizeTag, summarizeFocus } from './focusEngine.js';

/**
 * Focus sessions & self-logged screen time — Phase 7.
 *
 * Storage split (see docs/adr/0003):
 *  - `focusSessions/{id}` is the **source of truth**: one document per focus block you
 *    actually ran, day-keyed by `localDate` like every other capture collection.
 *  - `screenTimeLogs/{localDate}` holds the numbers that have no other source — the
 *    phone/laptop minutes you type in yourself — plus a focus roll-up that is
 *    **recomputed wholesale** from the day's sessions on every write, never incremented,
 *    so the mirror cannot drift away from the sessions it summarizes.
 */

function sessionsCol(uid) {
  return collection(db, 'users', uid, 'focusSessions');
}

function screenTimeRef(uid, localDate) {
  return doc(db, 'users', uid, 'screenTimeLogs', localDate);
}

// ---- focus sessions ---------------------------------------------------------

/** Live focus sessions for one local day. Sorted client-side — no composite index. */
export function listenFocusSessions(uid, localDate, cb, onError) {
  return onSnapshot(
    query(sessionsCol(uid), where('localDate', '==', localDate)),
    (snap) => cb(sortSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
    onError
  );
}

/** Newest first. Sessions without a usable start time (shouldn't happen) sort last. */
export function sortSessions(sessions = []) {
  const at = (s) => toDateSafe(s.startedAt)?.getTime() ?? 0;
  return [...sessions].sort((a, b) => at(b) - at(a));
}

/**
 * Record a focus block that has ended — whether it ran to completion or you stopped it
 * early. Only focus phases are logged; breaks are part of the rhythm, not an achievement.
 */
export function logFocusSession(uid, session) {
  const { localDate, tag, label, linkedTaskId, presetId, plannedMin, actualMin, startedAt, endedAt, completed } =
    session;

  return addDoc(sessionsCol(uid), {
    localDate,
    tag: normalizeTag(tag),
    label: label?.trim() || null,
    linkedTaskId: linkedTaskId || null,
    presetId: presetId ?? null,
    plannedMin: Math.max(0, Math.round(Number(plannedMin) || 0)),
    actualMin: Math.max(0, Math.round(Number(actualMin) || 0)),
    startedAt: Timestamp.fromMillis(startedAt),
    endedAt: Timestamp.fromMillis(endedAt),
    completed: Boolean(completed),
    createdAt: serverTimestamp(),
  });
}

export function deleteFocusSession(uid, id) {
  return deleteDoc(doc(db, 'users', uid, 'focusSessions', id));
}

// ---- self-logged screen time ------------------------------------------------

export function listenScreenTime(uid, localDate, cb, onError) {
  return onSnapshot(
    screenTimeRef(uid, localDate),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  );
}

/**
 * Save the numbers only you can know. Blank stays blank: an unanswered field is stored
 * as null, never as 0, so "I didn't log it" never renders as "I used my phone 0 minutes".
 */
export function saveScreenTime(uid, localDate, { phoneMin, laptopMin, note }) {
  const num = (v) => (v === '' || v == null ? null : Math.max(0, Math.round(Number(v) || 0)));
  return setDoc(
    screenTimeRef(uid, localDate),
    {
      localDate,
      phoneMin: num(phoneMin),
      laptopMin: num(laptopMin),
      note: note?.trim() || null,
      selfReported: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Mirror the day's focus totals onto `screenTimeLogs/{localDate}` for cheap later reads
 * (analytics, and the AI context in Phase 5). Always a full recompute from the session
 * list the client already holds — see the drift note at the top of this file.
 */
export function rollUpFocus(uid, localDate, sessions = []) {
  const s = summarizeFocus(sessions);
  return setDoc(
    screenTimeRef(uid, localDate),
    {
      localDate,
      focusMin: s.focusMin,
      sessionCount: s.count,
      byCategory: s.byTag,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ---- bridging stored sessions into the engine -------------------------------

/**
 * Sessions → minute-of-day spans for `continuousFocusMin`. Sessions whose timestamps
 * haven't landed yet (an optimistic local write) are simply skipped rather than guessed at.
 */
export function sessionSpans(sessions = [], timezone) {
  const spans = [];
  for (const s of sessions) {
    const startMin = localMinutesOfDay(timezone, s.startedAt);
    const endMin = localMinutesOfDay(timezone, s.endedAt);
    if (startMin == null || endMin == null) continue;
    // A session that ran across midnight would wrap; credit it to the day it started in.
    spans.push({ startMin, endMin: endMin >= startMin ? endMin : startMin + (s.actualMin || 0) });
  }
  return spans;
}
