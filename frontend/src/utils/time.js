/**
 * Client-side timezone helpers. Mirrors backend/src/utils/time.js so "today" is
 * computed identically on both sides (in the user's timezone, never the device/server).
 */

/** The browser's best guess at the user's IANA timezone, e.g. "Asia/Kolkata". */
export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Validate an IANA timezone id; fall back to the detected zone if invalid. */
export function normalizeTimezone(timezone) {
  if (!timezone || typeof timezone !== 'string') return detectTimezone();
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return timezone;
  } catch {
    return detectTimezone();
  }
}

/** "YYYY-MM-DD" in the given timezone (defaults to the detected one). */
export function localDate(timezone = detectTimezone(), date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA').format(date);
  }
}

/** The user's local hour (0-23) in the given timezone. */
export function localHour(timezone = detectTimezone(), date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    return Number.isFinite(h) ? h % 24 : new Date().getHours();
  } catch {
    return new Date().getHours();
  }
}

/** A time-of-day greeting based on the user's local hour. */
export function greeting(timezone = detectTimezone(), date = new Date()) {
  const h = localHour(timezone, date);
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

/** Format minutes as "1h 30m" / "45m" / "0m". */
export function formatMinutes(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}

/** The user's local weekday index in the given timezone (0 = Sunday … 6 = Saturday). */
export function localWeekdayIndex(timezone = detectTimezone(), date = new Date()) {
  try {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
  } catch {
    return date.getDay();
  }
}

/** A friendly long date like "Friday, 18 September 2026". */
export function formatLongDate(timezone = detectTimezone(), date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

/** Firestore Timestamp | Date | {seconds} | ms | ISO string → Date, or null if unusable. */
export function toDateSafe(stamp) {
  const d =
    stamp?.toDate?.() ??
    (stamp instanceof Date
      ? stamp
      : Number.isFinite(stamp?.seconds)
        ? new Date(stamp.seconds * 1000)
        : typeof stamp === 'number' || typeof stamp === 'string'
          ? new Date(stamp)
          : null);
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/**
 * Minutes since midnight (0–1439) in the user's timezone, or null if the instant is
 * unusable. Used to compare "now" against plan blocks, which are stored as "HH:MM".
 */
export function localMinutesOfDay(timezone = detectTimezone(), stamp = new Date()) {
  const date = toDateSafe(stamp);
  if (!date) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return (h % 24) * 60 + m;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}
