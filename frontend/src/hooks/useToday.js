import { useAuth } from '../context/AuthContext.jsx';
import { detectTimezone, localDate } from '../utils/time.js';

/**
 * The user's local "today" (YYYY-MM-DD) in their profile timezone, falling back to
 * the browser's timezone. Everything day-bound keys off this (see ARCHITECTURE §Timezones).
 */
export function useToday() {
  const { profile } = useAuth();
  const timezone = profile?.timezone || detectTimezone();
  return { timezone, today: localDate(timezone) };
}
