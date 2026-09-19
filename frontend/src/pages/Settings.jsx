import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  updateProfile,
  updateSettings,
  exportUserData,
  deleteUserData,
} from '../features/settings/settingsApi.js';
import { applyTheme, THEME_OPTIONS } from '../features/settings/theme.js';
import AvatarPicker from '../features/profile/AvatarPicker.jsx';
import { GOALS, getGoal, WEEKDAYS, DEFAULT_REST_DAYS } from '../features/profile/goals.js';
import { detectTimezone } from '../utils/time.js';
import styles from './Settings.module.css';

export default function Settings() {
  const { user, profile, settings, logout } = useAuth();
  const uid = user?.uid;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Settings</h1>
        <p className="muted">Profile, focus, appearance, and your data.</p>
      </header>

      <ProfileSection uid={uid} profile={profile} email={user?.email} />
      <GoalsSection uid={uid} profile={profile} />
      <AppearanceSection uid={uid} settings={settings} />
      <DataSection uid={uid} />
      <AccountSection user={user} onLogout={logout} />
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <section className={`card ${styles.section}`}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ProfileSection({ uid, profile, email }) {
  const [name, setName] = useState(profile?.name ?? '');
  const [occupation, setOccupation] = useState(profile?.occupation ?? '');
  const [timezone, setTimezone] = useState(profile?.timezone ?? detectTimezone());
  const [avatar, setAvatar] = useState({
    avatarId: profile?.avatarId ?? null,
    photoURL: profile?.photoURL ?? null,
  });
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setStatus('');
    try {
      await updateProfile(uid, {
        name: name.trim() || null,
        occupation: occupation.trim() || null,
        timezone,
        avatarId: avatar.avatarId ?? null,
        photoURL: avatar.photoURL ?? null,
      });
      setStatus('Saved.');
    } catch {
      setStatus('Could not save. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Profile" description="How you show up in the app.">
      <form className={styles.form} onSubmit={save}>
        <div className={styles.field}>
          <span>Photo or avatar</span>
          <AvatarPicker value={avatar} onChange={setAvatar} name={name} />
        </div>
        <label className={styles.field}>
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Occupation</span>
          <input
            className="input"
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            placeholder="e.g. Student, Developer"
          />
        </label>
        <label className={styles.field}>
          <span>Email</span>
          <input className="input" value={email ?? ''} disabled />
        </label>
        <label className={styles.field}>
          <span>
            Timezone{' '}
            <button
              type="button"
              className={styles.inlineLink}
              onClick={() => setTimezone(detectTimezone())}
            >
              use detected ({detectTimezone()})
            </button>
          </span>
          <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          <small className="muted">
            IANA id (e.g. Asia/Kolkata). Everything day-bound uses this for “today”.
          </small>
        </label>
        <div className={styles.formActions}>
          {status && <span className={styles.status}>{status}</span>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </Section>
  );
}

function AppearanceSection({ uid, settings }) {
  const current = settings?.theme ?? 'system';
  const [theme, setTheme] = useState(current);

  function choose(next) {
    setTheme(next);
    applyTheme(next); // instant
    if (uid) updateSettings(uid, { theme: next }); // persist (AuthContext also reacts)
  }

  return (
    <Section title="Appearance" description="Pick a theme that's easy on your eyes.">
      <div className={styles.themeGrid}>
        {THEME_OPTIONS.map((t) => (
          <button
            key={t.id}
            className={`${styles.themeCard} ${theme === t.id ? styles.themeActive : ''}`}
            onClick={() => choose(t.id)}
            type="button"
          >
            <span className={styles.swatch} style={{ background: t.swatch[0] }}>
              <span className={styles.swatchSurface} style={{ background: t.swatch[1] }} />
              <span className={styles.swatchDot} style={{ background: t.swatch[2] }} />
            </span>
            <span className={styles.themeName}>{t.label}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function GoalsSection({ uid, profile }) {
  const [goal, setGoal] = useState(profile?.goals?.primary || '');
  const [goalField, setGoalField] = useState(profile?.goals?.field || '');
  const [restDays, setRestDays] = useState(profile?.restDays || DEFAULT_REST_DAYS);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const goalMeta = getGoal(goal);

  const toggleDay = (i) =>
    setRestDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort((a, b) => a - b)));

  async function save() {
    setSaving(true);
    setStatus('');
    try {
      await updateProfile(uid, {
        goals: { primary: goal || null, field: goalField.trim() || null, secondary: null },
        restDays,
      });
      setStatus('Saved.');
    } catch {
      setStatus('Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="Focus & rest days"
      description="Your main goal and rest days shape your score. High-priority tasks & blocks are your key steps (70% of the score); rest days aren't scored."
    >
      <label className={styles.field}>
        <span>Main focus</span>
        <select className="input" value={goal} onChange={(e) => setGoal(e.target.value)}>
          <option value="">Not set</option>
          {GOALS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
      {goalMeta?.needsField && (
        <label className={styles.field}>
          <span>{goalMeta.fieldLabel}</span>
          <input className="input" value={goalField} onChange={(e) => setGoalField(e.target.value)} />
        </label>
      )}
      <div className={styles.field}>
        <span>Rest days</span>
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
      </div>
      <div className={styles.formActions}>
        {status && <span className={styles.status}>{status}</span>}
        <button className="btn" type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save focus'}
        </button>
      </div>
    </Section>
  );
}

function DataSection({ uid }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [status, setStatus] = useState('');

  async function doExport() {
    setBusy(true);
    setStatus('');
    try {
      const data = await exportUserData(uid);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-lifeos-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Export downloaded.');
    } catch {
      setStatus('Export failed.');
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    setStatus('');
    try {
      await deleteUserData(uid);
      setConfirming(false);
      setConfirmText('');
      setStatus('Your tasks and plans were deleted.');
    } catch {
      setStatus('Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Your data"
      description="Your data is yours — take it with you or clear it out."
    >
      <div className={styles.dataRow}>
        <button className="btn btn-secondary" onClick={doExport} disabled={busy}>
          Export my data (JSON)
        </button>
        {!confirming ? (
          <button className={styles.danger} onClick={() => setConfirming(true)} disabled={busy}>
            Delete my data
          </button>
        ) : null}
      </div>

      {confirming && (
        <div className={styles.confirmBox}>
          <p>
            This permanently deletes all your <strong>tasks and daily plans</strong>. Your
            account stays. Type <code>DELETE</code> to confirm.
          </p>
          <div className={styles.dataRow}>
            <input
              className="input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
            <button
              className={styles.danger}
              onClick={doDelete}
              disabled={busy || confirmText !== 'DELETE'}
            >
              {busy ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setConfirming(false);
                setConfirmText('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status && <p className={styles.status}>{status}</p>}
    </Section>
  );
}

function AccountSection({ user, onLogout }) {
  return (
    <Section title="Account">
      <div className={styles.accountRow}>
        <div>
          <div>{user?.email}</div>
          <small className="muted">
            {user?.emailVerified ? 'Email verified' : 'Email not verified'}
          </small>
        </div>
        <button className="btn btn-secondary" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </Section>
  );
}
