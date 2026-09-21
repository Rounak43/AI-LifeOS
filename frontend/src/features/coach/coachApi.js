import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase.js';
import { api } from '../../services/apiClient.js';

/**
 * AI Coach — Phase 5 client.
 *
 * Two halves, deliberately separate:
 *  - **Generating** goes through the Express API, because the LLM key must never reach a
 *    browser. The server is stateless: it takes a context, returns language, stores nothing.
 *  - **Keeping** goes straight to Firestore, like every other feature in this app. The
 *    server has no Admin credentials, and there is no reason for a recommendation about
 *    your day to be held anywhere but your own account (docs/adr/0004).
 *
 * Nothing is ever acted on automatically. A recommendation is stored as `new`, and only
 * the user moves it to `accepted` or `dismissed` (Principle 7 — AI assists, never decides).
 */

// ---- generating -------------------------------------------------------------

/** Is the coach available at all? Called once so the UI can hide itself rather than error. */
export function getCoachStatus() {
  return api.get('/ai/status');
}

export const reviewDay = (context) => api.post('/ai/review/day', { context });
export const reviewWeek = (context) => api.post('/ai/review/week', { context });
export const getInsight = (context) => api.post('/ai/insight', { context });
export const planDay = (context) => api.post('/ai/plan-day', { context });
export const runCommand = (payload) => api.post('/ai/command', payload);

// ---- keeping ----------------------------------------------------------------

function recsCol(uid) {
  return collection(db, 'users', uid, 'aiRecommendations');
}

export const REC_STATUSES = ['new', 'accepted', 'dismissed'];

/**
 * Live recommendations for one local day. Sorted client-side to avoid a composite index
 * (the same pattern the rest of the app uses).
 */
export function listenRecommendations(uid, localDate, cb, onError) {
  return onSnapshot(
    query(recsCol(uid), where('localDate', '==', localDate)),
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const at = (r) => r.createdAt?.toMillis?.() ?? 0;
      cb(items.sort((a, b) => at(b) - at(a)));
    },
    onError
  );
}

/**
 * Store a generated result. `meta` records which model said it, so a recommendation
 * from a model you later stopped trusting is identifiable rather than anonymous.
 */
export function saveRecommendation(uid, { localDate, type, result, meta }) {
  return addDoc(recsCol(uid), {
    localDate,
    type,
    status: 'new',
    headline: result.headline ?? null,
    insights: result.insights ?? [],
    suggestions: result.suggestions ?? [],
    blocks: result.blocks ?? [],
    note: result.note ?? null,
    meta: {
      model: meta?.model ?? null,
      provider: meta?.provider ?? null,
      tokens: meta?.tokens ?? null,
      // How many lines the server's safety screen withheld, so the UI can be honest.
      filtered: meta?.filtered ?? 0,
    },
    createdAt: serverTimestamp(),
  });
}

/** The user's verdict. Always theirs — nothing here is set by the app. */
export function setRecommendationStatus(uid, id, status) {
  if (!REC_STATUSES.includes(status)) throw new Error(`Unknown status "${status}".`);
  return updateDoc(doc(db, 'users', uid, 'aiRecommendations', id), {
    status,
    decidedAt: serverTimestamp(),
  });
}
