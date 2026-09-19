import { getUserDocument, ensureUser } from './userService.js';
import { localDate, localWeekday, localHour, greetingForHour, DEFAULT_TIMEZONE } from '../utils/time.js';

/**
 * The ONE aggregate read for the dashboard (see ARCHITECTURE.md — avoid N+1 reads).
 *
 * Phase 1 returns the dashboard SHELL: identity, the correct local day, a greeting,
 * and deliberately-empty sections with `hasData:false` so the client can render
 * friendly empty states (Principle 6 — solve the cold start).
 *
 * Phase 2 fills `plan`, `tasks` and a deterministic `productivityScore` from the
 * user's dailyPlans/{localDate} and tasks. The shape below is forward-compatible.
 */
export async function getDashboard(uid, seed = {}) {
  // Make sure a user document exists (first sign-in may hit here before the client write lands).
  let doc = await getUserDocument(uid);
  if (!doc) doc = await ensureUser(uid, seed);

  const profile = doc?.profile ?? {};
  const timezone = profile.timezone ?? DEFAULT_TIMEZONE;

  const today = localDate(timezone);
  const weekday = localWeekday(timezone);
  const hour = localHour(timezone);

  return {
    localDate: today,
    weekday,
    timezone,
    greeting: greetingForHour(hour),
    profile: {
      name: profile.name ?? null,
      photoURL: profile.photoURL ?? null,
      occupation: profile.occupation ?? null,
    },
    // ── Sections (empty shells in Phase 1) ──────────────────────────────────
    plan: {
      hasData: false,
      timeBlocks: [],
    },
    tasks: {
      hasData: false,
      counts: { completed: 0, pending: 0, missed: 0, total: 0 },
      completionRate: null,
    },
    plannedVsActual: {
      hasData: false,
      plannedMinutes: 0,
      actualMinutes: 0,
      adherence: null,
    },
    productivityScore: {
      // null == "not enough data yet"; the client shows a cold-start message.
      value: null,
      hasData: false,
      note: 'App-defined indicator. Configurable, not authoritative.',
    },
  };
}
