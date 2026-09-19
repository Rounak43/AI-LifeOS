import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../services/firebase.js';
import { normalizeTimezone } from '../../utils/time.js';

/**
 * Profile & settings writes — simple per-user CRUD straight to Firestore
 * (users/{uid}), guarded by Security Rules. AuthContext subscribes live, so the
 * whole app reacts to these updates (sidebar name, theme, score weights).
 */

function userRef(uid) {
  return doc(db, 'users', uid);
}

/** Patch nested profile fields, e.g. { name, occupation, timezone }. */
export function updateProfile(uid, patch) {
  const clean = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    clean[`profile.${k}`] = k === 'timezone' ? normalizeTimezone(v) : v;
  }
  if (Object.keys(clean).length === 0) return Promise.resolve();
  return updateDoc(userRef(uid), clean);
}

/** Patch nested settings fields, e.g. { theme, scoreWeights }. */
export function updateSettings(uid, patch) {
  const clean = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    clean[`settings.${k}`] = v;
  }
  if (Object.keys(clean).length === 0) return Promise.resolve();
  return updateDoc(userRef(uid), clean);
}

const DAY_COLLECTIONS = ['tasks', 'dailyPlans'];

/**
 * Export everything this account holds as a plain object (for a JSON download).
 * Fulfills the PRIVACY.md "you can leave with everything" promise.
 */
export async function exportUserData(uid) {
  const out = { exportedAt: new Date().toISOString(), uid, user: null, collections: {} };
  const userSnap = await getDoc(userRef(uid));
  out.user = userSnap.exists() ? userSnap.data() : null;

  for (const name of DAY_COLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', uid, name));
    out.collections[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return out;
}

/**
 * Delete this account's app data (tasks + daily plans + the user doc's app fields).
 * Destructive — callers must confirm explicitly in the UI. Does NOT delete the Firebase
 * Auth account itself (that needs recent re-auth; handled separately later).
 */
export async function deleteUserData(uid) {
  for (const name of DAY_COLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', uid, name));
    // Batch in chunks of 400 (Firestore batch limit is 500).
    let batch = writeBatch(db);
    let count = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      count++;
      if (count % 400 === 0) {
        // eslint-disable-next-line no-await-in-loop
        await batch.commit();
        batch = writeBatch(db);
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  // Reset the user doc's app data but keep the profile shell so the account still works.
  await setDoc(
    userRef(uid),
    { settings: { theme: 'system', notifications: true, aiEnabled: false, dataPermissions: {} } },
    { merge: true }
  );
}
