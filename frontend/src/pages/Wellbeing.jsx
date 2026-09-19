import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToday } from '../hooks/useToday.js';
import { useWellbeing } from '../hooks/useWellbeing.js';
import {
  saveSleep,
  saveMood,
  addWorkout,
  deleteWorkout,
  sleepMinutes,
  MOODS,
  WORKOUT_TYPES,
} from '../features/wellbeing/wellbeingApi.js';
import TimePicker from '../components/TimePicker.jsx';
import { formatLongDate, formatMinutes } from '../utils/time.js';
import styles from './Wellbeing.module.css';

export default function Wellbeing() {
  const { today, timezone } = useToday();
  const { sleep, mood, workouts, loading } = useWellbeing(today);

  return (
    <div>
      <header className={styles.head}>
        <h1 className={styles.title}>Wellbeing</h1>
        <p className="muted">{formatLongDate(timezone)}</p>
      </header>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className={styles.grid}>
          <SleepCard today={today} sleep={sleep} />
          <MoodCard today={today} mood={mood} />
          <WorkoutCard today={today} workouts={workouts} />
        </div>
      )}
    </div>
  );
}

function SleepCard({ today, sleep }) {
  const { user } = useAuth();
  const [bed, setBed] = useState(sleep?.sleepTime ?? '');
  const [wake, setWake] = useState(sleep?.wakeTime ?? '');
  const [quality, setQuality] = useState(sleep?.quality ?? 0);
  const [status, setStatus] = useState('');

  const preview = bed && wake ? formatMinutes(sleepMinutes(bed, wake)) : null;

  async function save() {
    if (!bed || !wake) return;
    await saveSleep(user.uid, today, { sleepTime: bed, wakeTime: wake, quality: quality || null });
    setStatus('Saved.');
  }

  return (
    <div className="card">
      <h2 className={styles.cardTitle}>😴 Sleep</h2>
      <div className={styles.row}>
        <label className={styles.f}>
          <span>Bedtime</span>
          <TimePicker value={bed} onChange={setBed} placeholder="Bed" ariaLabel="Bedtime" />
        </label>
        <label className={styles.f}>
          <span>Wake</span>
          <TimePicker value={wake} onChange={setWake} placeholder="Wake" ariaLabel="Wake time" />
        </label>
      </div>
      {preview && <p className={styles.big}>{preview} slept</p>}
      <div className={styles.f}>
        <span>Quality</span>
        <div className={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`${styles.star} ${quality >= n ? styles.starOn : ''}`}
              onClick={() => setQuality(n)}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div className={styles.actions}>
        {status && <span className={styles.ok}>{status}</span>}
        <button className="btn" onClick={save} disabled={!bed || !wake}>
          Save sleep
        </button>
      </div>
    </div>
  );
}

function MoodCard({ today, mood }) {
  const { user } = useAuth();
  const [note, setNote] = useState(mood?.note ?? '');
  const current = mood?.mood ?? 0;

  const pick = (v) => saveMood(user.uid, today, { mood: v, note: note || null });

  return (
    <div className="card">
      <h2 className={styles.cardTitle}>💭 Mood</h2>
      <div className={styles.moods}>
        {MOODS.map((m) => (
          <button
            key={m.v}
            type="button"
            className={`${styles.moodBtn} ${current === m.v ? styles.moodOn : ''}`}
            onClick={() => pick(m.v)}
            title={m.label}
          >
            <span className={styles.moodEmoji}>{m.emoji}</span>
            <span className={styles.moodLabel}>{m.label}</span>
          </button>
        ))}
      </div>
      <textarea
        className="input"
        rows={2}
        placeholder="A line about your day (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => saveMood(user.uid, today, { mood: current || null, note: note || null })}
      />
    </div>
  );
}

function WorkoutCard({ today, workouts }) {
  const { user } = useAuth();
  const [type, setType] = useState('Gym');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');

  async function add(e) {
    e.preventDefault();
    if (!duration) return;
    await addWorkout(user.uid, { type, durationMin: Number(duration), localDate: today, notes: notes || null });
    setDuration('');
    setNotes('');
  }

  const totalMin = workouts.reduce((s, w) => s + (w.durationMin || 0), 0);

  return (
    <div className="card">
      <h2 className={styles.cardTitle}>🏋 Workout</h2>
      <form className={styles.workoutForm} onSubmit={add}>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {WORKOUT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          className={`input ${styles.min}`}
          type="number"
          min="0"
          placeholder="min"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
        <button className="btn" disabled={!duration}>
          Add
        </button>
      </form>
      {workouts.length > 0 ? (
        <>
          <ul className={styles.woList}>
            {workouts.map((w) => (
              <li key={w.id}>
                <span>{w.type}</span>
                <span className="muted">{formatMinutes(w.durationMin)}</span>
                <button className={styles.woDel} onClick={() => deleteWorkout(user.uid, w.id)}>
                  🗑
                </button>
              </li>
            ))}
          </ul>
          <p className={styles.big}>{formatMinutes(totalMin)} active today</p>
        </>
      ) : (
        <p className="muted">No workouts logged yet.</p>
      )}
    </div>
  );
}
