import { getFirestore, admin } from '../config/firebase.js';
import { normalizeTimezone, DEFAULT_TIMEZONE } from '../utils/time.js';

/**
 * User profile & settings, read/written via the Admin SDK.
 *
 * Note: the client can also create/read its own profile directly against Firestore
 * (guarded by Security Rules). These server methods exist for trusted flows and for
 * endpoints (like /dashboard) that must read the profile to compute the local day.
 */

const DEFAULT_SETTINGS = {
  theme: 'system',
  notifications: true,
  quietHours: null,
  aiEnabled: false,
  aiFrequency: 'daily',
  // Per-category permissions for what the AI Coach may use (all off by default;
  // journal/mood stay off until explicit consent — see PRIVACY.md).
  dataPermissions: {},
  // Deterministic productivity-score weights (configurable, app-defined indicator).
  scoreWeights: {
    taskCompletion: 0.5,
    habitCompletion: 0.2,
    focusTime: 0.15,
    sleepConsistency: 0.15,
  },
};

function userDoc(uid) {
  return getFirestore().collection('users').doc(uid);
}

export async function getProfile(uid) {
  const snap = await userDoc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return data.profile ?? null;
}

export async function getUserDocument(uid) {
  const snap = await userDoc(uid).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Ensure a user document exists with sane defaults. Idempotent: called on first
 * sign-in (from the client or server). Does not overwrite existing fields.
 *
 * @param {string} uid
 * @param {{ email?: string|null, name?: string|null, timezone?: string|null }} seed
 */
export async function ensureUser(uid, seed = {}) {
  const ref = userDoc(uid);
  const snap = await ref.get();

  if (snap.exists) return snap.data();

  const timezone = normalizeTimezone(seed.timezone ?? DEFAULT_TIMEZONE);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const doc = {
    profile: {
      name: seed.name ?? null,
      email: seed.email ?? null,
      photoURL: null,
      occupation: null,
      timezone,
      createdAt: now,
    },
    settings: DEFAULT_SETTINGS,
  };
  await ref.set(doc, { merge: true });
  return doc;
}

/**
 * Update profile fields. Only whitelisted keys (already validated) are applied.
 */
export async function updateProfile(uid, patch) {
  const ref = userDoc(uid);
  const update = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const v = key === 'timezone' ? normalizeTimezone(value) : value;
    update[`profile.${key}`] = v;
  }
  if (Object.keys(update).length === 0) return getProfile(uid);
  await ref.set(update, { merge: true });
  return getProfile(uid);
}

export async function updateSettings(uid, patch) {
  const ref = userDoc(uid);
  const update = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    update[`settings.${key}`] = value;
  }
  if (Object.keys(update).length) await ref.set(update, { merge: true });
  const doc = await getUserDocument(uid);
  return doc?.settings ?? DEFAULT_SETTINGS;
}

export { DEFAULT_SETTINGS };
