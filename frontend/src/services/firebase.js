import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// PUBLIC web config — safe on the client. Secrets never live here (see PRIVACY.md).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Initialize only when configured. Otherwise leave these null so the app degrades
// to the "configure Firebase" empty state instead of crashing to a blank page
// (Principle 6 — solve the cold start). getAuth() throws auth/invalid-api-key on an
// empty config, so we must not call it unguarded.
let app = null;
let auth = null;
let db = null;
let googleProvider = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
  // Keep the session across reloads/tabs (best-effort; ignore private-mode failures).
  setPersistence(auth, browserLocalPersistence).catch(() => {});

  // Optional Analytics — only when a measurementId is present and the environment
  // supports it. Loaded lazily so it never blocks or breaks app startup.
  if (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) {
    import('firebase/analytics')
      .then(({ isSupported, getAnalytics }) =>
        isSupported().then((ok) => {
          if (ok) getAnalytics(app);
        })
      )
      .catch(() => {});
  }
} else {
  // eslint-disable-next-line no-console
  console.warn(
    'Firebase is not configured. Copy frontend/.env.example to .env.local and add your ' +
      'Firebase web config. The app will show a setup notice until then.'
  );
}

export { auth, db, googleProvider };
export default app;
