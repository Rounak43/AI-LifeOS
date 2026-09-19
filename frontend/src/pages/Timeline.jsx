import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToday } from '../hooks/useToday.js';
import { fetchTimeline } from '../features/timeline/timelineApi.js';
import {
  TIMELINE_KINDS,
  rangeFor,
  shiftAnchor,
  filterTimeline,
  groupByDay,
  summarizeDay,
  prettyTime,
} from '../features/timeline/buildTimeline.js';
import styles from './Timeline.module.css';

const MODES = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

/** "2026-09-18" → "Friday, 18 September" (no timezone maths: the string is already local). */
function labelDay(date, today) {
  if (date === today) return 'Today';
  const d = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d);
}

function labelRange({ start, end }, mode, today) {
  if (mode === 'day') return labelDay(start, today);
  const fmt = (d, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(`${d}T00:00:00Z`));
  if (mode === 'month') return fmt(start, { month: 'long', year: 'numeric' });
  return `${fmt(start, { day: 'numeric', month: 'short' })} – ${fmt(end, { day: 'numeric', month: 'short' })}`;
}

export default function Timeline() {
  const { user } = useAuth();
  const { today, timezone } = useToday();

  const [mode, setMode] = useState('day');
  const [anchor, setAnchor] = useState(today);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [kinds, setKinds] = useState(() => new Set());

  // The anchor starts unset until the profile timezone resolves "today".
  useEffect(() => setAnchor((a) => a || today), [today]);

  const range = useMemo(() => rangeFor(anchor || today, mode), [anchor, today, mode]);

  useEffect(() => {
    if (!user || !range.start) return undefined;
    let alive = true;
    setLoading(true);
    setError(false);
    fetchTimeline(user.uid, { ...range, timezone })
      .then((r) => alive && setEntries(r.entries))
      .catch(() => {
        if (!alive) return;
        setEntries([]);
        setError(true);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user, range.start, range.end, timezone]);

  const visible = useMemo(() => filterTimeline(entries, { kinds, q }), [entries, kinds, q]);
  const days = useMemo(() => groupByDay(visible), [visible]);
  const filtering = kinds.size > 0 || q.trim().length > 0;

  function toggleKind(id) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Life Timeline</h1>
          <p className="muted">Everything you captured, in the order it happened.</p>
        </div>
        <div className={styles.modes}>
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`${styles.modeBtn} ${mode === m.id ? styles.modeOn : ''}`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.nav}>
        <button className={styles.step} onClick={() => setAnchor((a) => shiftAnchor(a || today, mode, -1))} aria-label="Previous">
          ‹
        </button>
        <div className={styles.navMid}>
          <span className={styles.rangeLabel}>{labelRange(range, mode, today)}</span>
          <input
            className={styles.dateInput}
            type="date"
            value={anchor || today}
            max={today}
            onChange={(e) => e.target.value && setAnchor(e.target.value)}
          />
        </div>
        <button
          className={styles.step}
          onClick={() => setAnchor((a) => shiftAnchor(a || today, mode, 1))}
          aria-label="Next"
          disabled={range.end >= today}
        >
          ›
        </button>
        {(anchor || today) !== today && (
          <button className={styles.todayBtn} onClick={() => setAnchor(today)}>
            Today
          </button>
        )}
      </div>

      <div className={styles.filters}>
        <input
          className={`input ${styles.search}`}
          placeholder="Search this range…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className={styles.chips}>
          {TIMELINE_KINDS.map((k) => (
            <button
              key={k.id}
              className={`${styles.chip} ${kinds.has(k.id) ? styles.chipOn : ''}`}
              style={kinds.has(k.id) ? { borderColor: k.color, color: k.color } : undefined}
              onClick={() => toggleKind(k.id)}
            >
              <span aria-hidden>{k.icon}</span> {k.label}
            </button>
          ))}
          {filtering && (
            <button
              className={styles.clear}
              onClick={() => {
                setKinds(new Set());
                setQ('');
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="muted">Replaying {labelRange(range, mode, today).toLowerCase()}…</p>
      ) : error ? (
        <p className={styles.err}>Couldn’t load your timeline. Check your connection and try again.</p>
      ) : days.length === 0 ? (
        <div className={`card ${styles.empty}`}>
          <div className={styles.emptyIcon}>⋮</div>
          <div className={styles.emptyTitle}>{filtering ? 'Nothing matches those filters' : 'Nothing recorded here yet'}</div>
          <p className="muted">
            {filtering ? (
              'Try a different search or clear the filters.'
            ) : (
              <>
                The timeline builds itself from what you capture. Plan a day in the{' '}
                <Link to="/planner">Planner</Link> or tick something off in <Link to="/tasks">Tasks</Link> and it
                will show up here.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className={styles.days}>
          {days.map((day) => {
            const s = summarizeDay(day.entries);
            return (
              <section key={day.date} className={styles.day}>
                <div className={styles.dayHead}>
                  <h2 className={styles.dayTitle}>{labelDay(day.date, today)}</h2>
                  <span className={styles.dayMeta}>
                    {s.total} {s.total === 1 ? 'entry' : 'entries'}
                    {s.done > 0 && <> · {s.done} done</>}
                    {s.missed > 0 && <> · {s.missed} missed</>}
                    {s.open > 0 && <> · {s.open} open</>}
                  </span>
                </div>

                <ol className={styles.track}>
                  {day.entries.map((e) => (
                    <li key={e.id} className={styles.row}>
                      <div className={styles.when}>{e.time ? prettyTime(e.time) : <span className={styles.anytime}>Anytime</span>}</div>
                      <div className={styles.rail}>
                        <span className={styles.dot} style={{ background: e.color, borderColor: e.color }} aria-hidden>
                          {e.icon}
                        </span>
                      </div>
                      <div className={`${styles.card} ${e.status === 'missed' ? styles.missed : ''}`}>
                        <div className={styles.cardTop}>
                          <span className={styles.entryTitle}>{e.title}</span>
                          {e.keyStep && <span className={styles.key}>Key step</span>}
                          {e.status === 'done' && <span className={`${styles.badge} ${styles.badgeDone}`}>Done</span>}
                          {e.status === 'missed' && <span className={`${styles.badge} ${styles.badgeMissed}`}>Missed</span>}
                          {e.status === 'open' && <span className={`${styles.badge} ${styles.badgeOpen}`}>Not captured</span>}
                          {e.locked && <span className={styles.lock} title="End-to-end encrypted — open Journal to read">🔒</span>}
                        </div>
                        {e.detail && <div className={styles.detail}>{e.detail}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}

      {!loading && !error && days.length > 0 && (
        <p className={styles.note}>
          Built from your own records — nothing here is inferred. Items without a recorded time are
          grouped under “Anytime”. Journal entries stay encrypted; open{' '}
          <Link to="/journal">Journal</Link> with your passphrase to read them.
        </p>
      )}
    </div>
  );
}
