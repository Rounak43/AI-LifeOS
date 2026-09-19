import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile as updateAuthProfile,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

import { auth, db, googleProvider } from '../services/firebase.js';
import { detectTimezone } from '../utils/time.js';
import { applyTheme } from '../features/settings/theme.js';
import { generateAnonymousName } from '../features/profile/anonymousName.js';
import { DEFAULT_REST_DAYS } from '../features/profile/goals.js';

const AuthContext = createContext(null);

/**
 * Ensure a users/{uid} document exists. This is "simple per-user CRUD", so the
 * client writes it directly to Firestore (guarded by Security Rules) rather than
 * going through Express. Idempotent; sets the timezone from the browser on create.
 */
async function ensureProfileDoc(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const profileDoc = {
    profile: {
      name: user.displayName ?? null,
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      avatarId: null,
      occupation: null,
      timezone: detectTimezone(),
      // Goal-aware scoring inputs (set during onboarding).
      goals: { primary: null, field: null, secondary: null },
      restDays: DEFAULT_REST_DAYS, // Sat & Sun by default; editable
      // Fun default identity; the user can keep or change it during onboarding.
      anonymousName: generateAnonymousName(),
      // Gate flag — first-run profile setup must be completed before entering the app.
      onboardingComplete: false,
      createdAt: serverTimestamp(),
    },
    settings: {
      theme: 'system',
      notifications: true,
      aiEnabled: false,
      dataPermissions: {},
    },
  };
  await setDoc(ref, profileDoc, { merge: true });
  return profileDoc;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const docUnsubRef = useRef(null);

  useEffect(() => {
    // No Firebase config → no auth. Resolve immediately as signed-out so the app
    // renders the setup notice instead of hanging on a spinner.
    if (!auth) {
      setLoading(false);
      return undefined;
    }

    const stopDocListener = () => {
      if (docUnsubRef.current) {
        docUnsubRef.current();
        docUnsubRef.current = null;
      }
    };

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      stopDocListener();

      if (!fbUser) {
        setProfile(null);
        setSettings(null);
        setLoading(false);
        return;
      }

      try {
        await ensureProfileDoc(fbUser);
      } catch {
        /* offline / rules — the live listener below will still try */
      }

      // Subscribe live so profile/settings changes (name, theme, weights) propagate
      // across the whole app instantly.
      docUnsubRef.current = onSnapshot(
        doc(db, 'users', fbUser.uid),
        (snap) => {
          const data = snap.exists() ? snap.data() : {};
          setProfile(data.profile ?? null);
          setSettings(data.settings ?? null);
          if (data.settings?.theme) applyTheme(data.settings.theme);
          setLoading(false);
        },
        () => setLoading(false)
      );
    });

    return () => {
      stopDocListener();
      unsub();
    };
  }, []);

  const signUp = useCallback(async (email, password, name) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) await updateAuthProfile(cred.user, { displayName: name });
    await ensureProfileDoc(cred.user);
    await sendEmailVerification(cred.user).catch(() => {});
    return cred.user;
  }, []);

  const signIn = useCallback(
    (email, password) => signInWithEmailAndPassword(auth, email, password),
    []
  );

  const signInWithGoogle = useCallback(() => signInWithPopup(auth, googleProvider), []);

  const resetPassword = useCallback((email) => sendPasswordResetEmail(auth, email), []);

  const resendVerification = useCallback(() => {
    if (auth.currentUser) return sendEmailVerification(auth.currentUser);
    return Promise.resolve();
  }, []);

  const logout = useCallback(() => signOut(auth), []);

  const value = useMemo(
    () => ({
      user,
      profile,
      settings,
      loading,
      signUp,
      signIn,
      signInWithGoogle,
      resetPassword,
      resendVerification,
      logout,
    }),
    [user, profile, settings, loading, signUp, signIn, signInWithGoogle, resetPassword, resendVerification, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
