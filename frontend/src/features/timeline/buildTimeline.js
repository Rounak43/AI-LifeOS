/**
 * Life Timeline — turns the data you already captured into one chronological story
 * of a day (Phase 6). Nothing new is written: the timeline is *derived*, so it can
 * never drift from the source records.
 *
 * Pure and framework-free (no Firestore, no React) so it is unit-tested directly.
 * The reads live in timelineApi.js.
 *
 * Honesty rules baked in (Principle 5):
 *  - Only items that carry a real clock time get one. Everything else lands in
 *    "Anytime" rather than being given an invented position in the day.
 *  - Journal entries appear as markers only. Their text is end-to-end encrypted and
 *    is never decrypted here (PRIVACY.md) — the timeline shows that an entry exists.
 */

import { formatMinutes } from '../../utils/time.js';

const DAY = 86400000;
const parseDay = (d) => Date.parse(`${d}T00:00:00Z`);
const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** The kinds of thing that can appear on the timeline (also drives the filter chips). */
export const TIMELINE_KINDS = [
  { id: 'plan', label: 'Plan', icon: '▤', color: '#5b5bd6' },
  { id: 'task', label: 'Tasks', icon: '✓', color: '#0ea5e9' },
  { id: 'event', label: 'Calendar', icon: '▦', color: '#e11d54' },
  { id: 'habit', label: 'Habits', icon: '↻', color: '#16a34a' },
  { id: 'workout', label: 'Workout', icon: '◈', color: '#f97316' },
  { id: 'sleep', label: 'Sleep', icon: '☾', color: '#6366f1' },
  { id: 'mood', label: 'Mood', icon: '☺', color: '#a855f7' },
  { id: 'journal', label: 'Journal', icon: '✎', color: '#64748b' },
];

export const KIND_IDS = TIMELINE_KINDS.map((k) => k.id);
const kindMeta = Object.fromEntries(TIMELINE_KINDS.map((k) => [k.id, k]));

// ---- date ranges ------------------------------------------------------------

/** Inclusive list of YYYY-MM-DD between two dates (oldest first). */
export function datesBetween(start, end) {
  const out = [];
  for (let t = parseDay(start); t <= parseDay(end); t += DAY) out.push(keyOf(t));
  return out;
}

/**
 * The range a view covers around an anchor date.
 *  - day   → that date
 *  - week  → the Monday–Sunday week containing it
 *  - month → the calendar month containing it
 */
export function rangeFor(anchor, mode = 'day') {
  const base = parseDay(anchor);
  if (mode === 'week') {
    const dow = new Date(base).getUTCDay(); // 0 = Sunday
    const back = (dow + 6) % 7; // days since Monday
    const start = base - back * DAY;
    return { start: keyOf(start), end: keyOf(start + 6 * DAY) };
  }
  if (mode === 'month') {
    const d = new Date(base);
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
    return { start: keyOf(start), end: keyOf(end) };
  }
  return { start: anchor, end: anchor };
}

/** Step an anchor date by ±1 view (day / week / month). */
export function shiftAnchor(anchor, mode, dir) {
  const base = parseDay(anchor);
  if (mode === 'week') return keyOf(base + dir * 7 * DAY);
  if (mode === 'month') {
    const d = new Date(base);
    return keyOf(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, d.getUTCDate()));
  }
  return keyOf(base + dir * DAY);
}

// ---- helpers ----------------------------------------------------------------

/** Firestore Timestamp | Date | {seconds} → "HH:MM" in the user's timezone, or null. */
export function clockOf(stamp, timezone) {
  const date =
    stamp?.toDate?.() ??
    (stamp instanceof Date
      ? stamp
      : Number.isFinite(stamp?.seconds)
        ? new Date(stamp.seconds * 1000)
        : null);
  if (!date || Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return null;
  }
}

/** "08:30" → "8:30 AM". Untimed entries render as "Anytime" in the UI instead. */
export function prettyTime(hhmm) {
  const [h, m] = String(hhmm ?? '').split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(Number.isFinite(m) ? m : 0).padStart(2, '0')} ${suffix}`;
}

const MOOD_LABELS = { 1: '😞 Rough', 2: '😕 Meh', 3: '😐 Okay', 4: '🙂 Good', 5: '😄 Great' };

function entry(e) {
  const meta = kindMeta[e.kind] ?? {};
  return {
    status: null,
    detail: null,
    time: null,
    icon: meta.icon ?? '•',
    color: meta.color ?? 'var(--text-muted)',
    ...e,
  };
}

// ---- the builder ------------------------------------------------------------

/**
 * @param {Object} data   raw documents, already scoped to the range (see timelineApi)
 * @param {{ timezone?: string, dates?: string[] }} opts
 * @returns {Array} flat, chronologically sorted entries across the whole range
 */
export function buildTimeline(data = {}, opts = {}) {
  const {
    plans = [],
    tasks = [],
    habits = [],
    sleeps = [],
    moods = [],
    workouts = [],
    events = [],
    journal = [],
  } = data;
  const { timezone, dates } = opts;
  const allowed = dates?.length ? new Set(dates) : null;

  const out = [];
  const push = (e) => {
    if (!e.date || (allowed && !allowed.has(e.date))) return;
    out.push(entry(e));
  };

  // Planned time blocks — the only source with real planned clock times.
  for (const plan of plans) {
    for (const b of plan.timeBlocks ?? []) {
      push({
        id: `plan:${plan.localDate}:${b.id}`,
        date: plan.localDate,
        time: b.start || null,
        kind: 'plan',
        title: b.title || 'Time block',
        detail:
          [b.start && b.end ? `${b.start}–${b.end}` : null, b.type].filter(Boolean).join(' · ') || null,
        status: b.status === 'done' ? 'done' : b.status === 'missed' ? 'missed' : 'open',
        keyStep: b.priority === 'high',
      });
    }
  }

  // Tasks — only completed ones carry a real time (completedAt).
  for (const t of tasks) {
    if (t.status === 'cancelled' || t.status === 'archived') continue;
    const done = t.status === 'completed';
    push({
      id: `task:${t.id}`,
      date: t.localDate,
      time: done ? clockOf(t.completedAt, timezone) : null,
      kind: 'task',
      title: t.title || 'Task',
      detail:
        [t.category, Number.isFinite(t.estMinutes) ? formatMinutes(t.estMinutes) : null]
          .filter(Boolean)
          .join(' · ') || null,
      status: done ? 'done' : t.status === 'missed' ? 'missed' : 'open',
      keyStep: t.priority === 'high',
    });
  }

  // Calendar events.
  for (const ev of events) {
    push({
      id: `event:${ev.id}`,
      date: ev.date,
      time: ev.time || null,
      kind: 'event',
      title: ev.title || 'Event',
      detail: ev.type || null,
      color: ev.color ?? kindMeta.event.color,
    });
  }

  // Habits — completions are day-stamped only, so they stay untimed.
  for (const h of habits) {
    for (const d of h.completedDates ?? []) {
      push({
        id: `habit:${h.id}:${d}`,
        date: d,
        kind: 'habit',
        title: h.name || 'Habit',
        detail: 'Habit completed',
        status: 'done',
        color: h.color ?? kindMeta.habit.color,
      });
    }
  }

  // Sleep — placed at wake time, which is when the day actually started.
  for (const s of sleeps) {
    push({
      id: `sleep:${s.localDate}`,
      date: s.localDate,
      time: s.wakeTime || null,
      kind: 'sleep',
      title: `Slept ${formatMinutes(s.durationMin)}`,
      detail:
        [
          s.sleepTime && s.wakeTime ? `${s.sleepTime} → ${s.wakeTime}` : null,
          s.quality ? `quality ${s.quality}/5` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
    });
  }

  for (const w of workouts) {
    push({
      id: `workout:${w.id}`,
      date: w.localDate,
      time: clockOf(w.createdAt, timezone),
      kind: 'workout',
      title: `${w.type || 'Workout'} · ${formatMinutes(w.durationMin)}`,
      detail: w.notes || null,
      status: 'done',
    });
  }

  for (const m of moods) {
    if (m.mood == null) continue;
    push({
      id: `mood:${m.localDate}`,
      date: m.localDate,
      kind: 'mood',
      title: MOOD_LABELS[m.mood] ?? `Mood ${m.mood}/5`,
      detail: m.note || null,
    });
  }

  // Journal — marker only. Text stays encrypted; we never decrypt it here.
  for (const j of journal) {
    push({
      id: `journal:${j.id}`,
      date: j.localDate,
      time: clockOf(j.createdAt, timezone),
      kind: 'journal',
      title: 'Journal entry',
      detail: `${j.type ?? 'note'} · encrypted`,
      locked: true,
    });
  }

  return sortTimeline(out);
}

/** Newest day first; within a day, timed entries in clock order then untimed ones. */
export function sortTimeline(entries = []) {
  const rank = (e) => KIND_IDS.indexOf(e.kind);
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (Boolean(a.time) !== Boolean(b.time)) return a.time ? -1 : 1;
    if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
    return rank(a) - rank(b) || String(a.title).localeCompare(String(b.title));
  });
}

/** Text search + kind filter. `kinds` is a Set; an empty/absent set means "all". */
export function filterTimeline(entries = [], { kinds, q } = {}) {
  const needle = String(q ?? '').trim().toLowerCase();
  return entries.filter((e) => {
    if (kinds?.size && !kinds.has(e.kind)) return false;
    if (!needle) return true;
    return `${e.title} ${e.detail ?? ''}`.toLowerCase().includes(needle);
  });
}

/** Group a sorted flat list into days, keeping the sort order. */
export function groupByDay(entries = []) {
  const days = [];
  let current = null;
  for (const e of entries) {
    if (!current || current.date !== e.date) {
      current = { date: e.date, entries: [] };
      days.push(current);
    }
    current.entries.push(e);
  }
  return days;
}

/** Honest per-day counts for the day header — captured items only, nothing inferred. */
export function summarizeDay(entries = []) {
  let done = 0;
  let missed = 0;
  let open = 0;
  for (const e of entries) {
    if (e.status === 'done') done++;
    else if (e.status === 'missed') missed++;
    else if (e.status === 'open') open++;
  }
  return { total: entries.length, done, missed, open };
}
