/**
 * Timezone utilities — THE most important foundation in AI LifeOS.
 *
 * The whole product is organized around the USER'S local day, streaks and midnight.
 * We must always compute "today", day buckets and rollovers in the user's timezone,
 * never the server's. See ARCHITECTURE.md §Timezones.
 *
 * `localDate` is a "YYYY-MM-DD" string in the user's timezone, stored on every
 * day-bound document.
 */

const DEFAULT_TIMEZONE = 'UTC';

/**
 * Validate an IANA timezone id (e.g. "Asia/Kolkata"). Falls back to UTC if invalid.
 */
export function normalizeTimezone(timezone) {
  if (!timezone || typeof timezone !== 'string') return DEFAULT_TIMEZONE;
  try {
    // Throws RangeError for an invalid timezone.
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * The user's local calendar date as "YYYY-MM-DD".
 * 'en-CA' locale formats dates as YYYY-MM-DD, which is exactly what we want.
 *
 * @param {string} timezone  IANA timezone id
 * @param {Date}   [date]    the instant to bucket (defaults to now)
 */
export function localDate(timezone, date = new Date()) {
  const tz = normalizeTimezone(timezone);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * The user's local weekday name (e.g. "Friday") for greetings/UI.
 */
export function localWeekday(timezone, date = new Date()) {
  const tz = normalizeTimezone(timezone);
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(date);
}

/**
 * The user's local hour (0-23) — used to pick a greeting ("Good morning" etc.).
 */
export function localHour(timezone, date = new Date()) {
  const tz = normalizeTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  // Some environments emit "24" for midnight; normalize to 0.
  return Number.isFinite(hour) ? hour % 24 : 0;
}

/**
 * A time-of-day greeting based on the user's local hour.
 */
export function greetingForHour(hour) {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

export { DEFAULT_TIMEZONE };
