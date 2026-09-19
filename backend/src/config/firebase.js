import admin from 'firebase-admin';
import { env, assertFirebaseConfig } from './env.js';

/**
 * Lazily initialize the Firebase Admin SDK exactly once.
 *
 * Admin SDK writes bypass Firestore Security Rules, so all trusted / cross-record /
 * validation-heavy writes live here on the server (see ARCHITECTURE.md).
 */
let app;

function getApp() {
  if (app) return app;
  assertFirebaseConfig();
  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.firebase.projectId,
      clientEmail: env.firebase.clientEmail,
      privateKey: env.firebase.privateKey,
    }),
  });
  return app;
}

export function getAuth() {
  return admin.auth(getApp());
}

export function getFirestore() {
  const db = admin.firestore(getApp());
  return db;
}

export { admin };
