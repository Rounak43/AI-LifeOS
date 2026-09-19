import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToday } from '../hooks/useToday.js';
import {
  listenEvents,
  createEvent,
  deleteEvent,
  eventColor,
  EVENT_TYPES,
} from '../features/calendar/calendarApi.js';
import styles from './Calendar.module.css';

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Calendar() {
  const { user } = useAuth();
  const { today } = useToday();
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(today);

  const [y, mo] = useMemo(() => {
    const [yy, mm] = today.split('-').map(Number);
    return [yy, mm - 1];
  }, [today]);
  const [view, setView] = useState({ y, m: mo });

  useEffect(() => {
    if (!user) return undefined;
    return listenEvents(user.uid, setEvents);
  }, [user]);

  const byDate = useMemo(() => {
    const map = {};
    for (const e of events) (map[e.date] ??= []).push(e);
    return map;
  }, [events]);

  // Build the month grid (Sunday-first).
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < startDow; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(dateKey(view.y, view.m, d));
    return out;
  }, [view]);

  const shift = (delta) => {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const selectedEvents = (byDate[selected] ?? []).slice().sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  return (
    <div>
      <header className={styles.head}>
        <h1 className={styles.title}>Calendar</h1>
        <div className={styles.nav}>
          <button className={styles.navBtn} onClick={() => shift(-1)}>‹</button>
          <span className={styles.month}>{MONTHS[view.m]} {view.y}</span>
          <button className={styles.navBtn} onClick={() => shift(1)}>›</button>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={`card ${styles.calCard}`}>
          <div className={styles.dow}>
            {DOW.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className={styles.grid}>
            {cells.map((key, i) =>
              key === null ? (
                <div key={`b${i}`} className={styles.blank} />
              ) : (
                <button
                  key={key}
                  className={[
                    styles.day,
                    key === today ? styles.dayToday : '',
                    key === selected ? styles.daySel : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setSelected(key)}
                >
                  <span className={styles.dayNum}>{Number(key.split('-')[2])}</span>
                  <span className={styles.dots}>
                    {(byDate[key] ?? []).slice(0, 4).map((e) => (
                      <span key={e.id} className={styles.dot} style={{ background: eventColor(e.type) }} />
                    ))}
                  </span>
                </button>
              )
            )}
          </div>
        </div>

        <DayPanel
          uid={user.uid}
          date={selected}
          events={selectedEvents}
        />
      </div>
    </div>
  );
}

function DayPanel({ uid, date, events }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('class');
  const [time, setTime] = useState('');

  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    await createEvent(uid, { title: title.trim(), date, time: time || null, type });
    setTitle('');
    setTime('');
  }

  return (
    <div className={`card ${styles.panel}`}>
      <h2 className={styles.panelTitle}>{date}</h2>
      <form className={styles.addForm} onSubmit={add}>
        <input className="input" placeholder="Add event…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className={styles.addRow}>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {EVENT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
          <button className="btn" disabled={!title.trim()}>Add</button>
        </div>
      </form>

      {events.length === 0 ? (
        <p className="muted">No events this day.</p>
      ) : (
        <ul className={styles.events}>
          {events.map((e) => (
            <li key={e.id} className={styles.event}>
              <span className={styles.eventBar} style={{ background: eventColor(e.type) }} />
              <div className={styles.eventBody}>
                <span className={styles.eventTitle}>{e.title}</span>
                <span className="muted">
                  {EVENT_TYPES.find((t) => t.id === e.type)?.label}
                  {e.time ? ` · ${e.time}` : ''}
                </span>
              </div>
              <button className={styles.eventDel} onClick={() => deleteEvent(uid, e.id)}>🗑</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
