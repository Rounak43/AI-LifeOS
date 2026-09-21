/**
 * Focus engine — Phase 7 (Digital Wellbeing, manual part).
 *
 * A web app cannot read OS-level screen time (ARCHITECTURE §4), so wellbeing here is
 * *self-logged*: you run a Pomodoro-style timer, tag what the block was, and the app
 * only ever reports what you actually captured.
 *
 * Pure and framework-free (no Firestore, no React, no clock of its own) so the timer
 * maths and the nudges are unit-tested directly. The reads/writes live in focusApi.js;
 * the wall-clock ticking lives in hooks/useFocusTimer.js.
 *
 * Two deliberate choices:
 *  - **The timer is derived from timestamps, never counted in ticks.** A backgrounded
 *    tab gets its interval throttled, so counting ticks would silently under-report.
 *    `elapsedMs` is always (now − startedAt − pausedMs), which survives throttling,
 *    sleep and a page refresh.
 *  - **Nudges suggest, never insist** (Principle 4 — design against anxiety). They are
 *    plain sentences about your own plan, capped at two, and nothing blocks on them.
 */

// ---- vocabulary -------------------------------------------------------------

/** How a block of attention felt. Self-assigned — the app never infers it. */
export const FOCUS_TAGS = [
  { id: 'productive', label: 'Productive', emoji: '🎯', color: '#16a34a' },
  { id: 'neutral', label: 'Neutral', emoji: '○', color: '#64748b' },
  { id: 'distracting', label: 'Distracting', emoji: '🌀', color: '#d97706' },
];

export const TAG_IDS = FOCUS_TAGS.map((t) => t.id);
export const DEFAULT_TAG = 'productive';

const tagMeta = Object.fromEntries(FOCUS_TAGS.map((t) => [t.id, t]));

/** Normalize an arbitrary tag value to a known one. */
export function normalizeTag(tag) {
  return TAG_IDS.includes(tag) ? tag : 'neutral';
}

export function tagLabel(tag) {
  return tagMeta[normalizeTag(tag)].label;
}

/** Timer presets. Deliberately few — configuration is not the product. */
export const PRESETS = [
  { id: 'classic', label: 'Classic', focusMin: 25, shortBreakMin: 5, longBreakMin: 15, cycles: 4 },
  { id: 'deep', label: 'Deep work', focusMin: 50, shortBreakMin: 10, longBreakMin: 20, cycles: 3 },
  { id: 'short', label: 'Short burst', focusMin: 15, shortBreakMin: 3, longBreakMin: 10, cycles: 4 },
];

export const DEFAULT_PRESET_ID = 'classic';

export function presetById(id) {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

/** The three phases a run can be in. Only `focus` is ever logged as a session. */
export const PHASES = ['focus', 'short', 'long'];

export function phaseMinutes(preset, phase) {
  if (phase === 'short') return preset.shortBreakMin;
  if (phase === 'long') return preset.longBreakMin;
  return preset.focusMin;
}

export function phaseLabel(phase) {
  if (phase === 'short') return 'Short break';
  if (phase === 'long') return 'Long break';
  return 'Focus';
}

export const isBreak = (phase) => phase === 'short' || phase === 'long';

// ---- the run (timer state machine) ------------------------------------------

/**
 * Start a phase. `minutes` overrides the preset (used by "fit it before my next block").
 * The returned object is plain JSON so it can live in localStorage across a refresh.
 */
export function startRun({ preset, phase = 'focus', cycle = 1, now = 0, minutes, id } = {}) {
  const p = preset ?? presetById(DEFAULT_PRESET_ID);
  const mins = Number.isFinite(minutes) && minutes > 0 ? minutes : phaseMinutes(p, phase);
  return {
    id: id ?? `run_${now}_${Math.random().toString(36).slice(2, 8)}`,
    presetId: p.id,
    phase,
    cycle,
    plannedMin: mins,
    startedAt: now,
    durationMs: Math.max(1000, Math.round(mins * 60000)),
    pausedAt: null,
    pausedMs: 0,
  };
}

/** Time actually spent in this phase, excluding paused stretches. */
export function elapsedMs(run, now = 0) {
  if (!run) return 0;
  const upTo = run.pausedAt ?? now;
  return Math.max(0, upTo - run.startedAt - (run.pausedMs || 0));
}

export function remainingMs(run, now = 0) {
  if (!run) return 0;
  return Math.max(0, run.durationMs - elapsedMs(run, now));
}

/** 0 → 1 through the phase, clamped (a long-backgrounded tab must not overshoot). */
export function progress(run, now = 0) {
  if (!run || !run.durationMs) return 0;
  return Math.min(1, Math.max(0, elapsedMs(run, now) / run.durationMs));
}

export function isComplete(run, now = 0) {
  return Boolean(run) && remainingMs(run, now) === 0;
}

export const isPaused = (run) => Boolean(run?.pausedAt);

export function pauseRun(run, now = 0) {
  if (!run || run.pausedAt) return run;
  return { ...run, pausedAt: now };
}

export function resumeRun(run, now = 0) {
  if (!run?.pausedAt) return run;
  return { ...run, pausedAt: null, pausedMs: (run.pausedMs || 0) + Math.max(0, now - run.pausedAt) };
}

/**
 * What comes after this phase: focus → short break, until the last cycle, which earns
 * the long break and resets the count.
 */
export function nextPhase(preset, { phase, cycle } = {}) {
  const p = preset ?? presetById(DEFAULT_PRESET_ID);
  const c = Number.isFinite(cycle) && cycle > 0 ? cycle : 1;
  if (phase === 'long') return { phase: 'focus', cycle: 1 };
  if (phase === 'short') return { phase: 'focus', cycle: c + 1 };
  return c >= p.cycles ? { phase: 'long', cycle: c } : { phase: 'short', cycle: c };
}

/** Milliseconds → "25:00", or "1:05:00" once it passes an hour. */
export function formatClock(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Minutes to credit a focus run that is being stopped. Rounds to the nearest minute but
 * never rounds real work down to zero — anything past 30 seconds counts as a minute.
 */
export function creditedMinutes(ms) {
  const mins = (Number(ms) || 0) / 60000;
  if (mins <= 0) return 0;
  return Math.max(1, Math.round(mins));
}

// ---- summarizing a day ------------------------------------------------------

/** Honest roll-up of logged sessions. Counts only what was captured — nothing inferred. */
export function summarizeFocus(sessions = []) {
  const byTag = { productive: 0, neutral: 0, distracting: 0 };
  let focusMin = 0;
  let longestMin = 0;
  let completed = 0;

  for (const s of sessions) {
    const m = Math.max(0, Math.round(Number(s.actualMin) || 0));
    focusMin += m;
    byTag[normalizeTag(s.tag)] += m;
    if (m > longestMin) longestMin = m;
    if (s.completed) completed += 1;
  }

  return {
    count: sessions.length,
    focusMin,
    byTag,
    longestMin,
    completed,
    stoppedEarly: sessions.length - completed,
  };
}

// ---- schedule awareness -----------------------------------------------------

/** "08:30" → 510 minutes past midnight. Returns null for anything unparseable. */
export function toMinutes(hhmm) {
  const [h, m] = String(hhmm ?? '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** 510 → "08:30". */
export function fromMinutes(mins) {
  const v = Math.max(0, Math.round(Number(mins) || 0)) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/**
 * The next plan block that hasn't happened yet: earliest start strictly after `nowMin`,
 * skipping blocks you already captured as done or missed.
 */
export function nextPlannedBlock(blocks = [], nowMin) {
  if (!Number.isFinite(nowMin)) return null;
  let best = null;
  for (const b of blocks) {
    if (b?.status === 'done' || b?.status === 'missed') continue;
    const start = toMinutes(b?.start);
    if (start == null || start <= nowMin) continue;
    if (!best || start < toMinutes(best.start)) best = b;
  }
  return best;
}

/**
 * Minutes of back-to-back focus at the end of the day. Spans closer together than
 * `gapMin` count as one stretch; a longer gap means you already rested, so it resets.
 * Pass `nowMin` when nothing is running, so a stretch that ended hours ago doesn't
 * still read as "you have been going for 95 minutes".
 */
export function continuousFocusMin(spans = [], { gapMin = 15, nowMin = null } = {}) {
  const sorted = spans
    .filter((s) => Number.isFinite(s?.startMin) && Number.isFinite(s?.endMin) && s.endMin >= s.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  let total = 0;
  let prevEnd = null;
  for (const s of sorted) {
    if (prevEnd != null && s.startMin - prevEnd > gapMin) total = 0;
    total += s.endMin - s.startMin;
    prevEnd = s.endMin;
  }
  if (prevEnd == null) return 0;
  if (Number.isFinite(nowMin) && nowMin - prevEnd > gapMin) return 0;
  return Math.round(total);
}

/** Focus minutes without a break before we say something. Not a rule — a nudge. */
export const BREAK_NUDGE_MIN = 90;

/**
 * Up to two plain sentences about the day you planned, warnings first.
 *
 * @param {Object}   o
 * @param {Array}    o.blocks        today's plan blocks ({ title, start, status })
 * @param {number}   o.nowMin        minutes past midnight, user's timezone
 * @param {Object}   [o.run]         the active run, if any
 * @param {number}   o.remainingMin  minutes left in that run
 * @param {number}   o.sinceBreakMin continuous focus so far (see continuousFocusMin)
 * @param {boolean}  o.restDay       rest days are never scored, and never pushed
 * @returns {Array<{id: string, tone: 'warn'|'info', text: string}>}
 */
export function focusAdvice({
  blocks = [],
  nowMin = null,
  run = null,
  remainingMin = 0,
  sinceBreakMin = 0,
  restDay = false,
} = {}) {
  const out = [];
  const next = nextPlannedBlock(blocks, nowMin);
  const gap = next ? toMinutes(next.start) - nowMin : null;
  const running = Boolean(run) && !isBreak(run.phase);

  // 1. This session will run past something you already planned.
  if (running && gap != null && gap < remainingMin) {
    out.push({
      id: 'overrun',
      tone: 'warn',
      text: `“${next.title || 'Your next block'}” starts at ${next.start}, about ${Math.max(
        0,
        Math.round(gap)
      )} min from now — before this session ends.`,
    });
  }

  // 2. You have been going a while.
  if (sinceBreakMin >= BREAK_NUDGE_MIN) {
    out.push({
      id: 'break',
      tone: 'warn',
      text: `That is ${Math.round(sinceBreakMin)} min of focus without a break. A short one now usually pays for itself.`,
    });
  }

  // 3. Nothing running: what actually fits before the next thing?
  if (!run && gap != null) {
    if (gap >= 10) {
      out.push({
        id: 'fits',
        tone: 'info',
        text: `${gap} min until “${next.title || 'your next block'}” at ${next.start} — a ${Math.min(
          gap,
          25
        )}-min session fits.`,
      });
    } else {
      out.push({
        id: 'tight',
        tone: 'info',
        text: `“${next.title || 'Your next block'}” starts in ${gap} min. Probably not worth starting a session.`,
      });
    }
  }

  // 4. Rest days: offered, never pushed.
  if (restDay && !run) {
    out.push({
      id: 'rest',
      tone: 'info',
      text: '🌿 Rest day — focus if you feel like it. Nothing here is scored today.',
    });
  }

  const warns = out.filter((a) => a.tone === 'warn');
  const infos = out.filter((a) => a.tone === 'info');
  return [...warns, ...infos].slice(0, 2);
}
