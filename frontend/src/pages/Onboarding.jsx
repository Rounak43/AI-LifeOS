import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { updateProfile } from '../features/settings/settingsApi.js';
import AvatarPicker from '../features/profile/AvatarPicker.jsx';
import { generateAnonymousName } from '../features/profile/anonymousName.js';
import { GOALS, getGoal, WEEKDAYS, DEFAULT_REST_DAYS } from '../features/profile/goals.js';
import { detectTimezone } from '../utils/time.js';
import Logo from '../components/Logo.jsx';
import styles from './Onboarding.module.css';

/**
 * Mandatory first-run profile setup. Shown until profile.onboardingComplete is true.
 * There is no skip — new users complete this before entering the app (they can still
 * sign out). Collects name, occupation, timezone, and an avatar/photo.
 */
export default function Onboarding() {
  const { user, profile, logout } = useAuth();

  const [name, setName] = useState(profile?.name || profile?.anonymousName || generateAnonymousName());
  const [occupation, setOccupation] = useState(profile?.occupation || '');
  const [timezone, setTimezone] = useState(profile?.timezone || detectTimezone());
  const [avatar, setAvatar] = useState({
    avatarId: profile?.avatarId ?? 'fox',
    photoURL: profile?.photoURL ?? null,
  });
  const [goal, setGoal] = useState(profile?.goals?.primary || '');
  const [goalField, setGoalField] = useState(profile?.goals?.field || '');
  const [restDays, setRestDays] = useState(profile?.restDays || DEFAULT_REST_DAYS);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const goalMeta = getGoal(goal);
  const canSubmit = name.trim() && occupation.trim() && goal;

  const toggleDay = (i) =>
    setRestDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort((a, b) => a - b)));

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) {
      setError('Please fill in your name, what you do, and your main focus.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await updateProfile(user.uid, {
        name: name.trim(),
        occupation: occupation.trim(),
        timezone,
        avatarId: avatar.avatarId ?? null,
        photoURL: avatar.photoURL ?? null,
        goals: { primary: goal, field: goalField.trim() || null, secondary: null },
        restDays,
        onboardingComplete: true,
      });
      // The live user-doc listener flips the gate and drops us into the app.
    } catch (err) {
      setError(err?.message || 'Could not save. Check your connection and try again.');
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <div className={styles.brand}>
          <Logo size={30} />
        </div>
        <h1 className={styles.title}>Let’s set up your profile</h1>
        <p className={styles.subtitle}>
          A few quick details so the app is yours. This takes about a minute.
        </p>

        <label className={styles.field}>
          <span className={styles.labelRow}>
            Display name
            <button
              type="button"
              className={styles.shuffle}
              onClick={() => setName(generateAnonymousName())}
              title="Give me a random anonymous name"
            >
              🎲 shuffle
            </button>
          </span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
          />
          <small className="muted">
            We picked a fun anonymous handle to start — keep it or make it your own.
          </small>
        </label>

        <label className={styles.field}>
          <span>What do you do?</span>
          <input
            className="input"
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            placeholder="e.g. Student, Developer, Designer"
            maxLength={120}
            required
          />
        </label>

        <label className={styles.field}>
          <span>What’s your main focus?</span>
          <select className="input" value={goal} onChange={(e) => setGoal(e.target.value)} required>
            <option value="" disabled>
              Choose your main goal…
            </option>
            {GOALS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          <small className="muted">
            Your High-priority tasks &amp; blocks become “key steps” — the score rewards
            finishing those first.
          </small>
        </label>

        {goalMeta?.needsField && (
          <label className={styles.field}>
            <span>{goalMeta.fieldLabel}</span>
            <input
              className="input"
              value={goalField}
              onChange={(e) => setGoalField(e.target.value)}
              placeholder="Optional"
            />
          </label>
        )}

        <div className={styles.field}>
          <span>Which days are your rest days?</span>
          <div className={styles.days}>
            {WEEKDAYS.map((d) => (
              <button
                key={d.i}
                type="button"
                className={`${styles.dayChip} ${restDays.includes(d.i) ? styles.dayOn : ''}`}
                onClick={() => toggleDay(d.i)}
              >
                {d.short}
              </button>
            ))}
          </div>
          <small className="muted">On rest days there’s no score pressure — your streak stays safe.</small>
        </div>

        <label className={styles.field}>
          <span className={styles.labelRow}>
            Timezone
            <button
              type="button"
              className={styles.shuffle}
              onClick={() => setTimezone(detectTimezone())}
            >
              use detected
            </button>
          </span>
          <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          <small className="muted">Used for your day, streaks and “today”.</small>
        </label>

        <div className={styles.field}>
          <span>Choose a photo or avatar</span>
          <AvatarPicker value={avatar} onChange={setAvatar} name={name} />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button className={`btn ${styles.submit}`} type="submit" disabled={saving || !canSubmit}>
          {saving ? 'Setting up…' : 'Enter AI LifeOS'}
        </button>

        <p className={styles.footer}>
          Signed in as {user?.email} ·{' '}
          <button type="button" className={styles.link} onClick={logout}>
            Not you? Sign out
          </button>
        </p>
      </form>
    </div>
  );
}
