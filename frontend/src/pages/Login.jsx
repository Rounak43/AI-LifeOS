import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { isFirebaseConfigured } from '../services/firebase.js';
import Logo from '../components/Logo.jsx';
import styles from './Auth.module.css';

export default function Login() {
  const { signIn, signInWithGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setBusy(true);
    try {
      await signInWithGoogle();
      navigate(from, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (!email) return setError('Enter your email above first, then tap reset.');
    setError('');
    try {
      await resetPassword(email);
      setNotice('Password reset email sent. Check your inbox.');
    } catch (err) {
      setError(friendlyAuthError(err));
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <Logo size={32} />
        </div>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>Plan your day, track what actually happened.</p>

        {!isFirebaseConfigured && <ConfigWarning />}
        {error && <div className={styles.error}>{error}</div>}
        {notice && <div className={styles.notice}>{notice}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.field}>
            <span>Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
            <span>Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <button className={styles.link} type="button" onClick={handleReset}>
          Forgot password?
        </button>

        <div className={styles.divider}><span>or</span></div>

        <button className="btn btn-secondary" type="button" onClick={handleGoogle} disabled={busy}>
          Continue with Google
        </button>

        <p className={styles.foot}>
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </div>
    </div>
  );
}

function ConfigWarning() {
  return (
    <div className={styles.warn}>
      Firebase isn’t configured yet. Copy <code>frontend/.env.example</code> to{' '}
      <code>.env.local</code> and add your Firebase web config.
    </div>
  );
}

export function friendlyAuthError(err) {
  const code = err?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'That email is already registered. Try signing in.';
    case 'auth/weak-password':
      return 'Please choose a password of at least 6 characters.';
    case 'auth/invalid-email':
      return 'That doesn’t look like a valid email.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return err?.message ?? 'Something went wrong. Please try again.';
  }
}
