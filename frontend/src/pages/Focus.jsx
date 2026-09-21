import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToday } from '../hooks/useToday.js';
import { useTasks } from '../hooks/useTasks.js';
import { useDailyPlan } from '../hooks/useDailyPlan.js';
import { useFocus } from '../hooks/useFocus.js';
import { useFocusTimer } from '../hooks/useFocusTimer.js';
import {
  FOCUS_TAGS,
  PRESETS,
  DEFAULT_PRESET_ID,
  DEFAULT_TAG,
  presetById,
  startRun,
  nextPhase,
  phaseLabel,
  phaseMinutes,
  isBreak,
  formatClock,
  creditedMinutes,
  summarizeFocus,
  continuousFocusMin,
  focusAdvice,
  tagLabel,
  elapsedMs,
  nextPlannedBlock,
  toMinutes,
} from '../features/focus/focusEngine.js';
import {
  logFocusSession,
  deleteFocusSession,
  saveScreenTime,
  rollUpFocus,
  sessionSpans,
} from '../features/focus/focusApi.js';
import { DEFAULT_REST_DAYS } from '../features/profile/goals.js';
import {
  formatLongDate,
  formatMinutes,
  localMinutesOfDay,
  localWeekdayIndex,
} from '../utils/time.js';
import styles from './Focus.module.css';

/**
 * Focus — Phase 7, the manual half of Digital Wellbeing.
 *
 * The web platform cannot read OS screen time (ARCHITECTURE §4), so nothing here is
 * measured behind your back: you start a block, you say what it was, and the page only
 * ever shows minutes you actually captured. Everything it says about your day comes
 * from `focusEngine` — deterministic, unit-tested, no inference.
 */
export default function Focus() {
  const { user, profile } = useAuth();
  const { today, timezone } = useToday();
  const { sessions, screenTime, loading } = useFocus(today);
  const { tasks } = useTasks(today);
  const { plan } = useDailyPlan(today);

  // Setup for the *next* block. Kept here so it survives the run and pre-fills the one after.
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);
  const [tag, setTag] = useState(DEFAULT_TAG);
  const [label, setLabel] = useState('');
  const [linkedTaskId, setLinkedTaskId] = useState('');
  const [chimeOn, setChimeOn] = useState(() => readFlag('lifeos.focus.chime', true));
  const [justLogged, setJustLogged] = useState(null);
  const [problem, setProblem] = useState(null);

  const preset = presetById(presetId);

  // The listener is async, so writes read the latest list through a ref, not a closure.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const setupRef = useRef({});
  setupRef.current = { presetId, tag, label, linkedTaskId };

  /** Write a finished focus block, then refresh the day's roll-up from the full list. */
  const commit = useCallback(
    async (run, { actualMin, completed }) => {
      if (!user || actualMin < 1) return;
      const setup = setupRef.current;
      const record = {
        localDate: today,
        tag: setup.tag,
        label: setup.label,
        linkedTaskId: setup.linkedTaskId || null,
        presetId: run.presetId,
        plannedMin: run.plannedMin,
        actualMin,
        startedAt: run.startedAt,
        endedAt: Date.now(),
        completed,
      };
      try {
        await logFocusSession(user.uid, record);
        setJustLogged({ actualMin, completed });
        setProblem(null);
        await rollUpFocus(user.uid, today, [...sessionsRef.current, record]);
      } catch (err) {
        // Say so rather than quietly losing the block you just worked.
        setProblem(`That block couldn't be saved (${err?.code || 'offline'}). It will save when you reconnect.`);
      }
    },
    [user, today]
  );

  const timerRef = useRef(null);

  /** A phase reached zero on its own. */
  const handleEnd = useCallback(
    async (run) => {
      if (chimeOn) chime(isBreak(run.phase) ? 'up' : 'down');
      const p = presetById(run.presetId);
      const next = nextPhase(p, run);

      if (!isBreak(run.phase)) {
        // Finished focus blocks roll straight into their break — resting is the rhythm,
        // not a reward. The break ending does NOT auto-start the next block.
        // The break starts on the chime; the write happens behind it, so a slow or
        // failed round-trip never eats into your rest.
        timerRef.current?.begin(startRun({ preset: p, phase: next.phase, cycle: next.cycle, now: Date.now() }));
        commit(run, { actualMin: run.plannedMin, completed: true });
      } else {
        timerRef.current?.clear();
      }
    },
    [chimeOn, commit]
  );

  const timer = useFocusTimer(handleEnd);
  timerRef.current = timer;
  const { run, now, remaining, fraction, paused } = timer;

  // A slow wall clock for schedule advice — independent of whether a run is ticking.
  const [wall, setWall] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setWall(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);
  const nowMin = localMinutesOfDay(timezone, wall);

  const restDays = profile?.restDays ?? DEFAULT_REST_DAYS;
  const restDay = restDays.includes(localWeekdayIndex(timezone));

  const summary = useMemo(() => summarizeFocus(sessions), [sessions]);

  const sinceBreakMin = useMemo(() => {
    const spans = sessionSpans(sessions, timezone);
    if (run && !isBreak(run.phase)) {
      // Count the block in progress too, so the nudge doesn't arrive an hour late.
      const startMin = localMinutesOfDay(timezone, run.startedAt);
      if (startMin != null) spans.push({ startMin, endMin: startMin + elapsedMs(run, now) / 60000 });
      return continuousFocusMin(spans);
    }
    return continuousFocusMin(spans, { nowMin });
  }, [sessions, timezone, run, now, nowMin]);

  // If the next planned block is close, offer a session sized to land just before it.
  const fit = useMemo(() => {
    const block = nextPlannedBlock(plan?.timeBlocks ?? [], nowMin);
    if (!block || nowMin == null) return null;
    const gap = toMinutes(block.start) - nowMin;
    return gap >= 10 && gap < preset.focusMin ? gap : null;
  }, [plan, nowMin, preset]);

  const advice = useMemo(
    () =>
      focusAdvice({
        blocks: plan?.timeBlocks ?? [],
        nowMin,
        run,
        remainingMin: remaining / 60000,
        sinceBreakMin,
        restDay,
      }),
    [plan, nowMin, run, remaining, sinceBreakMin, restDay]
  );

  // Keep the countdown visible in the tab title, so the timer works while you work.
  useEffect(() => {
    const base = 'AI LifeOS';
    document.title = run ? `${formatClock(remaining)} · ${phaseLabel(run.phase)} — ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [run, remaining]);

  // ---- actions --------------------------------------------------------------

  function begin(minutes) {
    setJustLogged(null);
    timer.begin(startRun({ preset, phase: 'focus', cycle: 1, now: Date.now(), minutes }));
  }

  async function stopAndLog() {
    if (!run) return;
    const mins = creditedMinutes(elapsedMs(run, Date.now()));
    timer.clear();
    if (!isBreak(run.phase)) await commit(run, { actualMin: mins, completed: false });
  }

  function skipBreak() {
    timer.clear();
  }

  async function removeSession(id) {
    if (!user) return;
    try {
      await deleteFocusSession(user.uid, id);
      await rollUpFocus(user.uid, today, sessionsRef.current.filter((s) => s.id !== id));
    } catch (err) {
      setProblem(`Couldn't delete that block (${err?.code || 'offline'}).`);
    }
  }

  function toggleChime() {
    setChimeOn((on) => {
      writeFlag('lifeos.focus.chime', !on);
      if (!on) chime('up');
      return !on;
    });
  }

  const openTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'archived');

  return (
    <div>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Focus</h1>
          <p className="muted">{formatLongDate(timezone)}</p>
        </div>
        <button
          type="button"
          className={styles.chimeToggle}
          onClick={toggleChime}
          aria-pressed={chimeOn}
          title={chimeOn ? 'Chime on' : 'Chime off'}
        >
          {chimeOn ? '🔔' : '🔕'}
        </button>
      </header>

      {problem && <p className={styles.problem}>{problem}</p>}

      {advice.length > 0 && (
        <div className={styles.advice}>
          {advice.map((a) => (
            <p key={a.id} className={`${styles.tip} ${a.tone === 'warn' ? styles.tipWarn : ''}`}>
              {a.text}
            </p>
          ))}
        </div>
      )}

      <div className={styles.grid}>
        <section className={`card ${styles.timerCard}`}>
          <Ring
            fraction={run ? fraction : 0}
            phase={run?.phase ?? 'focus'}
            label={run ? phaseLabel(run.phase) : 'Ready'}
            time={run ? formatClock(remaining) : formatClock(phaseMinutes(preset, 'focus') * 60000)}
            paused={paused}
          />

          {run ? (
            <RunControls
              run={run}
              preset={presetById(run.presetId)}
              paused={paused}
              onPause={timer.pause}
              onResume={timer.resume}
              onStop={stopAndLog}
              onSkip={skipBreak}
              label={label}
            />
          ) : (
            <Setup
              preset={preset}
              onPreset={setPresetId}
              tag={tag}
              onTag={setTag}
              label={label}
              onLabel={setLabel}
              linkedTaskId={linkedTaskId}
              onLinkedTask={setLinkedTaskId}
              tasks={openTasks}
              onStart={begin}
              fitMinutes={fit}
            />
          )}

          {justLogged && !run && (
            <p className={styles.logged}>
              Logged {formatMinutes(justLogged.actualMin)}
              {justLogged.completed ? ' — full block.' : ' — stopped early, and that still counts.'}
            </p>
          )}
        </section>

        <section className={`card ${styles.todayCard}`}>
          <h2 className={styles.cardTitle}>Today</h2>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : summary.count === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyEmoji} aria-hidden>
                ◷
              </div>
              <div className={styles.emptyTitle}>No focus blocks yet</div>
              <p className={styles.emptyBody}>
                Start one on the left. Only what you capture shows up here — nothing is measured
                in the background.
              </p>
            </div>
          ) : (
            <>
              <p className={styles.big}>{formatMinutes(summary.focusMin)} focused</p>
              <p className={styles.subtle}>
                {summary.count} {summary.count === 1 ? 'block' : 'blocks'} · longest{' '}
                {formatMinutes(summary.longestMin)}
                {summary.stoppedEarly > 0 && ` · ${summary.stoppedEarly} stopped early`}
              </p>
              <TagBars byTag={summary.byTag} total={summary.focusMin} />
              <ul className={styles.list}>
                {sessions.map((s) => (
                  <li key={s.id} className={styles.row}>
                    <span className={styles.dot} style={{ background: tagColor(s.tag) }} aria-hidden />
                    <span className={styles.rowTitle}>{s.label || tagLabel(s.tag)}</span>
                    <span className="muted">{formatMinutes(s.actualMin)}</span>
                    {!s.completed && (
                      <span className={styles.partial} title="Stopped before the timer ran out">
                        ·
                      </span>
                    )}
                    <button
                      className={styles.del}
                      onClick={() => removeSession(s.id)}
                      aria-label={`Delete ${s.label || 'focus session'}`}
                    >
                      🗑
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <ScreenTimeCard today={today} screenTime={screenTime} focusMin={summary.focusMin} />
      </div>
    </div>
  );
}

// ---- the ring ----------------------------------------------------------------

const R = 78;
const C = 2 * Math.PI * R;

function Ring({ fraction, phase, label, time, paused }) {
  return (
    <div className={styles.ringWrap}>
      <svg viewBox="0 0 180 180" className={styles.ring} role="img" aria-label={`${label}, ${time} remaining`}>
        <circle cx="90" cy="90" r={R} className={styles.track} />
        <circle
          cx="90"
          cy="90"
          r={R}
          className={`${styles.arc} ${isBreak(phase) ? styles.arcBreak : ''}`}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - fraction)}
        />
      </svg>
      <div className={styles.ringText}>
        <span className={styles.phase}>
          {label}
          {paused && ' · paused'}
        </span>
        <span className={styles.clock}>{time}</span>
      </div>
    </div>
  );
}

// ---- idle: what are we doing? -------------------------------------------------

function Setup({
  preset,
  onPreset,
  tag,
  onTag,
  label,
  onLabel,
  linkedTaskId,
  onLinkedTask,
  tasks,
  onStart,
  fitMinutes: fit,
}) {
  return (
    <div className={styles.setup}>
      <div className={styles.presets}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`${styles.preset} ${preset.id === p.id ? styles.presetOn : ''}`}
            onClick={() => onPreset(p.id)}
          >
            <span className={styles.presetMin}>{p.focusMin}m</span>
            <span className={styles.presetLabel}>{p.label}</span>
          </button>
        ))}
      </div>

      <input
        className="input"
        placeholder="What are you working on? (optional)"
        value={label}
        onChange={(e) => onLabel(e.target.value)}
        maxLength={80}
      />

      {tasks.length > 0 && (
        <select
          className="input"
          value={linkedTaskId}
          onChange={(e) => {
            onLinkedTask(e.target.value);
            const t = tasks.find((x) => x.id === e.target.value);
            if (t && !label) onLabel(t.title);
          }}
        >
          <option value="">Link a task (optional)</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      )}

      <div className={styles.tags}>
        {FOCUS_TAGS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.tagBtn} ${tag === t.id ? styles.tagOn : ''}`}
            style={tag === t.id ? { borderColor: t.color, color: t.color } : undefined}
            onClick={() => onTag(t.id)}
          >
            <span aria-hidden>{t.emoji}</span> {t.label}
          </button>
        ))}
      </div>

      <div className={styles.startRow}>
        <button className={`btn ${styles.start}`} onClick={() => onStart()}>
          Start {preset.focusMin} min
        </button>
        {fit != null && fit !== preset.focusMin && (
          <button className="btn btn-secondary" onClick={() => onStart(fit)}>
            Fit {fit} min
          </button>
        )}
      </div>
    </div>
  );
}

// ---- running ------------------------------------------------------------------

function RunControls({ run, preset, paused, onPause, onResume, onStop, onSkip, label }) {
  const onBreak = isBreak(run.phase);
  return (
    <div className={styles.controls}>
      <p className={styles.runLabel}>
        {onBreak ? (
          <>Step away. The next block won’t start on its own.</>
        ) : (
          <>
            {label || 'Focus block'} · round {run.cycle} of {preset.cycles}
          </>
        )}
      </p>
      <div className={styles.btnRow}>
        {paused ? (
          <button className="btn" onClick={onResume}>
            Resume
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={onPause}>
            Pause
          </button>
        )}
        {onBreak ? (
          <button className="btn btn-secondary" onClick={onSkip}>
            End break
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={onStop}>
            Stop &amp; log
          </button>
        )}
      </div>
    </div>
  );
}

// ---- today's mix ---------------------------------------------------------------

function TagBars({ byTag, total }) {
  if (!total) return null;
  return (
    <div className={styles.bars}>
      {FOCUS_TAGS.map((t) => {
        const mins = byTag[t.id] || 0;
        if (!mins) return null;
        return (
          <div key={t.id} className={styles.barRow}>
            <span className={styles.barLabel}>{t.label}</span>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{ width: `${Math.round((mins / total) * 100)}%`, background: t.color }}
              />
            </div>
            <span className={styles.barValue}>{formatMinutes(mins)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---- self-logged screen time ----------------------------------------------------

function ScreenTimeCard({ today, screenTime, focusMin }) {
  const { user } = useAuth();
  const [phone, setPhone] = useState('');
  const [laptop, setLaptop] = useState('');
  const [saved, setSaved] = useState(false);

  // Adopt whatever is stored the first time it arrives, without stomping on typing.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !screenTime) return;
    seeded.current = true;
    setPhone(screenTime.phoneMin ?? '');
    setLaptop(screenTime.laptopMin ?? '');
  }, [screenTime]);

  async function save() {
    if (!user) return;
    await saveScreenTime(user.uid, today, { phoneMin: phone, laptopMin: laptop });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const totalLogged = (Number(phone) || 0) + (Number(laptop) || 0);

  return (
    <section className="card">
      <h2 className={styles.cardTitle}>Screen time</h2>
      <p className={styles.note}>
        Self-reported. A web app can’t read your device’s screen time, so this is whatever you
        choose to tell it — a rough number is more useful than none.
      </p>

      <div className={styles.stRow}>
        <label className={styles.f}>
          <span>📱 Phone (min)</span>
          <input
            className="input"
            type="number"
            min="0"
            placeholder="—"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className={styles.f}>
          <span>💻 Laptop (min)</span>
          <input
            className="input"
            type="number"
            min="0"
            placeholder="—"
            value={laptop}
            onChange={(e) => setLaptop(e.target.value)}
          />
        </label>
      </div>

      {totalLogged > 0 && focusMin > 0 && (
        <p className={styles.subtle}>
          {formatMinutes(focusMin)} focused against {formatMinutes(totalLogged)} on screen.
        </p>
      )}

      <div className={styles.actions}>
        {saved && <span className={styles.ok}>Saved.</span>}
        <button className="btn" onClick={save}>
          Save
        </button>
      </div>

      <p className={styles.note}>
        Every block also lands on your <Link to="/timeline">Life Timeline</Link>.
      </p>
    </section>
  );
}

// ---- small helpers --------------------------------------------------------------

function tagColor(tag) {
  return FOCUS_TAGS.find((t) => t.id === tag)?.color ?? 'var(--text-muted)';
}

function readFlag(key, fallback) {
  try {
    const v = window.localStorage.getItem(key);
    return v == null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key, value) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* preference simply won't stick */
  }
}

/**
 * A short, quiet two-note chime. Deliberately not an alarm — this app is supposed to
 * lower the ambient pressure, not add to it. Silently does nothing if audio is blocked.
 */
function chime(direction = 'down') {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = direction === 'up' ? [523.25, 783.99] : [783.99, 523.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.18;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.34);
    });
    setTimeout(() => ctx.close?.(), 1200);
  } catch {
    /* no sound available — the ring and the title still say it's over */
  }
}
