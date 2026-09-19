/**
 * Goal categories captured during onboarding — the user's "main focus". Used to
 * personalize the app and (with rest days) to drive the goal-aware productivity score.
 */
export const GOALS = [
  { id: 'study', label: 'Studies / Exam prep', needsField: true, fieldLabel: 'Field or exam (e.g. JEE, NEET, CS)' },
  { id: 'coding', label: 'Coding / Software development' },
  { id: 'gym', label: 'Fitness / Gym' },
  { id: 'sports', label: 'Sports', needsField: true, fieldLabel: 'Which sport?' },
  { id: 'career', label: 'Career / Job performance' },
  { id: 'business', label: 'Business / Startup / Freelancing' },
  { id: 'creative', label: 'Creative (art, music, writing, design)' },
  { id: 'language', label: 'Language learning', needsField: true, fieldLabel: 'Which language?' },
  { id: 'reading', label: 'Reading / Self-education' },
  { id: 'health', label: 'Health & habits (sleep, meditation, diet)' },
  { id: 'other', label: 'Something else', needsField: true, fieldLabel: 'Tell us your focus' },
];

export function getGoal(id) {
  return GOALS.find((g) => g.id === id) ?? null;
}

/** Weekday helpers. 0 = Sunday … 6 = Saturday (matches JS Date & Intl). */
export const WEEKDAYS = [
  { i: 0, short: 'Sun', label: 'Sunday' },
  { i: 1, short: 'Mon', label: 'Monday' },
  { i: 2, short: 'Tue', label: 'Tuesday' },
  { i: 3, short: 'Wed', label: 'Wednesday' },
  { i: 4, short: 'Thu', label: 'Thursday' },
  { i: 5, short: 'Fri', label: 'Friday' },
  { i: 6, short: 'Sat', label: 'Saturday' },
];

/** Default rest days: Saturday & Sunday. */
export const DEFAULT_REST_DAYS = [0, 6];
