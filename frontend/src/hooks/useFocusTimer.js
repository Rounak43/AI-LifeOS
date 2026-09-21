import { useCallback, useEffect, useRef, useState } from 'react';
import {
  elapsedMs,
  isComplete,
  pauseRun,
  progress,
  remainingMs,
  resumeRun,
} from '../features/focus/focusEngine.js';

const STORAGE_KEY = 'lifeos.focus.run';

/** localStorage can throw (private mode, blocked site data) — never let it break the timer. */
function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const run = raw ? JSON.parse(raw) : null;
    return run && Number.isFinite(run.startedAt) && Number.isFinite(run.durationMs) ? run : null;
  } catch {
    return null;
  }
}

function save(run) {
  try {
    if (run) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* the timer still works, it just won't survive a refresh */
  }
}

/**
 * Drives a focus run against the wall clock.
 *
 * The interval only exists to re-render; every number comes from `focusEngine` reading
 * timestamps, so a throttled background tab, a sleeping laptop or a page refresh all
 * resolve to the right remaining time (see the note in focusEngine.js).
 *
 * `onEnd(run)` fires exactly once per run, when it reaches zero.
 */
export function useFocusTimer(onEnd) {
  const [run, setRun] = useState(load);
  const [now, setNow] = useState(() => Date.now());

  const endedRef = useRef(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => save(run), [run]);

  // Tick while something is actually running. 250ms keeps the ring smooth without cost.
  useEffect(() => {
    if (!run || run.pausedAt) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [run]);

  // Re-sync the moment the tab comes back, before the next tick would have fired.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Fire the phase-ended callback once, then let the caller decide what comes next.
  useEffect(() => {
    if (!run || endedRef.current === run.id) return;
    if (!isComplete(run, now)) return;
    endedRef.current = run.id;
    onEndRef.current?.(run);
  }, [run, now]);

  const begin = useCallback((next) => {
    endedRef.current = null;
    setRun(next);
  }, []);

  const clear = useCallback(() => {
    endedRef.current = null;
    setRun(null);
  }, []);

  const pause = useCallback(() => setRun((r) => (r ? pauseRun(r, Date.now()) : r)), []);
  const resume = useCallback(() => setRun((r) => (r ? resumeRun(r, Date.now()) : r)), []);

  return {
    run,
    now,
    begin,
    clear,
    pause,
    resume,
    paused: Boolean(run?.pausedAt),
    remaining: remainingMs(run, now),
    elapsed: elapsedMs(run, now),
    fraction: progress(run, now),
  };
}
