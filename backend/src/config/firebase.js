import admin from 'firebase-admin';
import { env, assertFirebaseConfig } from './env.js';

/**
 * Lazily initialize the Firebase Admin SDK exactly once.
 *
 * Two modes, because they need different credentials:
 *
 *  - **Verify-only** (project id alone). `verifyIdToken()` checks a JWT's signature
 *    against Google's *public* certificates, so it needs no private key — only the
 *    project id, to check the token's audience. This is enough to authenticate every
 *    request, which is all the Phase 5 AI endpoints require.
 *  - **Full admin** (service-account key). Required for Firestore access, Storage, and
 *    minting custom tokens. Admin writes bypass Security Rules, so trusted/cross-record
 *    writes live behind this (ARCHITECTURE.md).
 *
 * Starting verify-only means the AI Coach ships without waiting on a service-account
 * key; the moment one is added to `.env`, Firestore access lights up with no code change.
 * See docs/adr/0004.
 */
let app;

export function hasAdminCredentials() {
  return Boolean(env.firebase.clientEmail && env.firebase.privateKey);
}

function getApp() {
  if (app) return app;

  if (!env.firebase.projectId) {
    throw new Error(
      'Firebase is not configured. Missing env: FIREBASE_PROJECT_ID. ' +
        'Copy .env.example to .env and fill it in.'
    );
  }

  if (hasAdminCredentials()) {
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.firebase.projectId,
        clientEmail: env.firebase.clientEmail,
        privateKey: env.firebase.privateKey,
      }),
    });
  } else {
    // Enough to verify who is calling; not enough to read their data.
    app = admin.initializeApp({ projectId: env.firebase.projectId });
  }

  return app;
}

export function getAuth() {
  return admin.auth(getApp());
}

/**
 * Firestore genuinely needs the service account. Fail with the actionable message rather
 * than whatever the SDK would throw three frames deeper.
 */
export function getFirestore() {
  assertFirebaseConfig();
  return admin.firestore(getApp());
}

export { admin };
