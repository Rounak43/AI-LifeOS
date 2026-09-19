import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToday } from '../hooks/useToday.js';
import { useHabits } from '../hooks/useHabits.js';
import {
  createHabit,
  deleteHabit,
  toggleHabitDay,
  currentStreak,
  recentDates,
  HABIT_COLORS,
} from '../features/habits/habitsApi.js';
import { formatLongDate } from '../utils/time.js';
import styles from './Habits.module.css';

export default function Habits() {
  const { user } = useAuth();
  const { today, timezone } = useToday();
  const { habits, loading } = useHabits();

  const [name, setName] = useState('');
  const [color, setColor] = useState(HABIT_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const week = recentDates(today, 7);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createHabit(user.uid, { name: name.trim(), color });
      setName('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Habits</h1>
          <p className="muted">{formatLongDate(timezone)}</p>
        </div>
      </header>

      <form className={styles.addRow} onSubmit={add}>
        <input
          className="input"
          placeholder="New habit — e.g. Read 20 min, Meditate, Gym"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className={styles.colors}>
          {HABIT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.colorDot} ${color === c ? styles.colorSel : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <button className="btn" disabled={busy || !name.trim()}>
          Add
        </button>
      </form>

      {loading ? (
        <p className="muted">Loading habits…</p>
      ) : habits.length === 0 ? (
        <div className={`card ${styles.empty}`}>
          <div className={styles.emptyEmoji}>↻</div>
          <div className={styles.emptyTitle}>No habits yet</div>
          <p className="muted">Add a small daily habit and check it off each day to build a streak.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {habits.map((h) => {
            const doneToday = (h.completedDates ?? []).includes(today);
            const streak = currentStreak(h.completedDates ?? [], today);
            return (
              <li key={h.id} className={styles.item}>
                <button
                  className={styles.check}
                  style={doneToday ? { background: h.color, borderColor: h.color } : { borderColor: h.color }}
                  onClick={() => toggleHabitDay(user.uid, h, today)}
                  aria-label={doneToday ? 'Mark not done' : 'Mark done'}
                >
                  {doneToday ? '✓' : ''}
                </button>
                <div className={styles.body}>
                  <span className={styles.name}>{h.name}</span>
                  <span className={styles.week}>
                    {week.map((d) => (
                      <span
                        key={d}
                        className={styles.dot}
                        style={
                          (h.completedDates ?? []).includes(d)
                            ? { background: h.color }
                            : undefined
                        }
                        title={d}
                      />
                    ))}
                  </span>
                </div>
                <span className={styles.streak} title="Current streak">
                  🔥 {streak}
                </span>
                <button className={styles.del} onClick={() => deleteHabit(user.uid, h.id)} title="Delete">
                  🗑
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
