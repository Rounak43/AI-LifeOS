import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToday } from '../hooks/useToday.js';
import { useTasks } from '../hooks/useTasks.js';
import { useDailyPlan } from '../hooks/useDailyPlan.js';
import { useHabits } from '../hooks/useHabits.js';
import { useWellbeing } from '../hooks/useWellbeing.js';
import { useFocus } from '../hooks/useFocus.js';
import { computeDay } from '../features/scoring/computeDay.js';
import { summarizeFocus } from '../features/focus/focusEngine.js';
import { DEFAULT_REST_DAYS, getGoal } from '../features/profile/goals.js';
import { updateSettings } from '../features/settings/settingsApi.js';
import {
  getCoachStatus,
  reviewDay,
  reviewWeek,
  getInsight,
  planDay,
  runCommand,
  listenRecommendations,
  saveRecommendation,
  setRecommendationStatus,
} from '../features/coach/coachApi.js';
import { buildDayContext, buildWeekContext, buildCommandContext } from '../features/coach/buildContext.js';
import { fetchDaysForRange, weekRangeFor } from '../features/coach/weekData.js';
import { formatLongDate, localWeekdayIndex } from '../utils/time.js';
import styles from './Coach.module.css';

/**
 * AI Coach — Phase 5.
 *
 * The last step of the loop: PLAN → TRACK → COMPARE → UNDERSTAND → **RECOMMEND** → IMPROVE.
 *
 * Three things this page is careful about:
 *  - **It assists, never decides.** Nothing generated here is applied to your plan. A
 *    suggestion is text until you act on it yourself, and every one can be dismissed.
 *  - **It says what leaves the device.** The provider and its data policy are on screen,
 *    and mood is off until you turn it on (PRIVACY.md §Consent model).
 *  - **The numbers were computed before the model saw them.** Every figure comes from
 *    `computeDay` / `summarizeFocus`. The model writes sentences; it never does maths.
 */
export default function Coach() {
  const { user, profile, settings } = useAuth();
  const { today, timezone } = useToday();
  const { tasks } = useTasks(today);
  const { plan } = useDailyPlan(today);
  const { habits } = useHabits();
  const { sleep, mood } = useWellbeing(today);
  const { sessions } = useFocus(today);

  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null); // generated, not yet kept
  const [recs, setRecs] = useState([]);
  const [command, setCommand] = useState('');
  const [parsed, setParsed] = useState(null);

  const restDays = profile?.restDays ?? DEFAULT_REST_DAYS;

  // The onboarding goal is a category plus an optional free-text field ("Studies" +
  // "JEE"). Joined into one short phrase so the model gets intent, not an id.
  const goalText = useMemo(() => {
    const label = getGoal(profile?.goals?.primary)?.label ?? null;
    const field = profile?.goals?.field ?? null;
    return [label, field].filter(Boolean).join(' — ') || null;
  }, [profile]);
  const moodConsent = settings?.dataPermissions?.mood === true;

  const day = useMemo(
    () => computeDay(tasks, plan, { isRestDay: restDays.includes(localWeekdayIndex(timezone)) }),
    [tasks, plan, restDays, timezone]
  );
  const focus = useMemo(() => summarizeFocus(sessions), [sessions]);

  // Is the coach configured at all? If not, the page says so instead of offering
  // buttons that would only ever fail.
  useEffect(() => {
    let alive = true;
    getCoachStatus()
      .then((s) => alive && setStatus(s))
      .catch((e) => alive && setStatus({ available: false, reason: e.message }));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    return listenRecommendations(user.uid, today, setRecs, () => setRecs([]));
  }, [user, today]);

  const dayContext = useCallback(
    () =>
      buildDayContext({
        date: today,
        timezone,
        day,
        tasks,
        plan,
        habits,
        focus,
        sleep,
        mood,
        goal: goalText,
        consent: { mood: moodConsent },
      }),
    [today, timezone, day, tasks, plan, habits, focus, sleep, mood, goalText, moodConsent]
  );

  const weekContext = useCallback(async () => {
    const { start, end } = weekRangeFor(today, today);
    const days = await fetchDaysForRange(user.uid, {
      start,
      end,
      restDays,
      weekdayOf: (d) => localWeekdayIndex(timezone, new Date(`${d}T12:00:00Z`)),
    });
    return buildWeekContext({
      startDate: start,
      endDate: end,
      timezone,
      days,
      goal: goalText,
      consent: { mood: moodConsent },
    });
  }, [user, today, timezone, restDays, goalText, moodConsent]);

  /** Run one coach action and hold the result as a draft until the user keeps or drops it. */
  async function generate(type, fn, buildCtx) {
    setBusy(type);
    setError(null);
    setDraft(null);
    try {
      const context = await buildCtx();
      const { result, meta } = await fn(context);
      setDraft({ type, result, meta });
    } catch (err) {
      setError(err.message || 'The coach could not answer.');
    } finally {
      setBusy(null);
    }
  }

  async function keep() {
    if (!draft || !user) return;
    await saveRecommendation(user.uid, {
      localDate: today,
      type: draft.type,
      result: draft.result,
      meta: draft.meta,
    });
    setDraft(null);
  }

  async function submitCommand(e) {
    e.preventDefault();
    if (!command.trim()) return;
    setBusy('command');
    setError(null);
    setParsed(null);
    try {
      const { result } = await runCommand(
        buildCommandContext({ text: command, today, timezone, tasks, plan })
      );
      setParsed(result);
    } catch (err) {
      setError(err.message || 'Could not read that instruction.');
    } finally {
      setBusy(null);
    }
  }

  if (status && !status.available) {
    return (
      <div>
        <Header timezone={timezone} />
        <div className="card">
          <h2 className={styles.cardTitle}>The coach is not switched on</h2>
          <p className="muted">
            No AI provider is configured on the server. Add an API key to{' '}
            <code>backend/.env</code> and restart it — everything else in AI LifeOS keeps
            working without one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header timezone={timezone} />

      {status && <Disclosure status={status} moodConsent={moodConsent} uid={user?.uid} />}

      <section className={`card ${styles.actions}`}>
        <h2 className={styles.cardTitle}>Ask the coach</h2>
        <div className={styles.btnGrid}>
          <ActionButton
            label="Review my day"
            hint="What actually happened today"
            busy={busy === 'review_day'}
            disabled={Boolean(busy)}
            onClick={() => generate('review_day', reviewDay, dayContext)}
          />
          <ActionButton
            label="Review my week"
            hint="How this week held up"
            busy={busy === 'review_week'}
            disabled={Boolean(busy)}
            onClick={() => generate('review_week', reviewWeek, weekContext)}
          />
          <ActionButton
            label="Plan my day"
            hint="A realistic set of blocks"
            busy={busy === 'plan_day'}
            disabled={Boolean(busy)}
            onClick={() => generate('plan_day', planDay, dayContext)}
          />
          <ActionButton
            label="Find a pattern"
            hint="Something a single day won't show"
            busy={busy === 'insight'}
            disabled={Boolean(busy)}
            onClick={() => generate('insight', getInsight, weekContext)}
          />
        </div>

        <form className={styles.cmdForm} onSubmit={submitCommand}>
          <input
            className="input"
            placeholder="Or type an instruction — “add DSA tomorrow at 8 AM”"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            maxLength={200}
          />
          <button className="btn" disabled={Boolean(busy) || !command.trim()}>
            {busy === 'command' ? '…' : 'Read it'}
          </button>
        </form>

        {parsed && <ParsedCommand parsed={parsed} onClose={() => setParsed(null)} />}
        {error && <p className={styles.error}>{error}</p>}
      </section>

      {draft && <Draft draft={draft} onKeep={keep} onDrop={() => setDraft(null)} />}

      <section>
        <h2 className={styles.sectionTitle}>Kept today</h2>
        {recs.length === 0 ? (
          <div className="card">
            <p className="muted">
              Nothing kept yet. Anything you generate stays a draft until you keep it —
              and you can dismiss it at any time.
            </p>
          </div>
        ) : (
          <div className={styles.recs}>
            {recs.map((r) => (
              <RecCard
                key={r.id}
                rec={r}
                onStatus={(s) => setRecommendationStatus(user.uid, r.id, s)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Header({ timezone }) {
  return (
    <header className={styles.head}>
      <div>
        <h1 className={styles.title}>AI Coach</h1>
        <p className="muted">{formatLongDate(timezone)}</p>
      </div>
    </header>
  );
}

/**
 * PRIVACY.md promises to "always disclose what data leaves the device and to whom".
 * This is that promise, rendered — including the mood switch, which stays off by default.
 */
function Disclosure({ status, moodConsent, uid }) {
  const [open, setOpen] = useState(false);

  async function toggleMood() {
    if (!uid) return;
    await updateSettings(uid, { dataPermissions: { mood: !moodConsent } });
  }

  return (
    <div className={styles.disclosure}>
      <button className={styles.discHead} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          Coaching runs on <strong>{status.provider}</strong> ({status.model})
          {status.trainsOnInput ? ' — trains on free-tier input' : ' — no training, no retention'}
        </span>
        <span className={styles.chev}>{open ? '⌃' : '⌄'}</span>
      </button>

      {open && (
        <div className={styles.discBody}>
          <p className={styles.discText}>
            <strong>Sent:</strong> your task and block titles, and the numbers this app already
            computed — score, counts, planned vs captured minutes, focus and sleep totals.
          </p>
          <p className={styles.discText}>
            <strong>Never sent:</strong> your journal, in any form. It is encrypted on this
            device and the server has no way to read it. Task notes and mood notes stay here too.
          </p>
          <label className={styles.consent}>
            <input
              type="checkbox"
              checked={moodConsent}
              onChange={toggleMood}
              disabled={status.trainsOnInput}
            />
            <span>
              Also send my mood rating (1–5, never the note).
              {status.trainsOnInput && ' Unavailable on a provider that trains on input.'}
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, hint, busy, disabled, onClick }) {
  return (
    <button className={styles.action} onClick={onClick} disabled={disabled}>
      <span className={styles.actionLabel}>{busy ? 'Thinking…' : label}</span>
      <span className={styles.actionHint}>{hint}</span>
    </button>
  );
}

/** A generated result, before the user decides whether to keep it. */
function Draft({ draft, onKeep, onDrop }) {
  const { result, meta } = draft;
  return (
    <section className={`card ${styles.draft}`}>
      <h2 className={styles.draftHead}>{result.headline}</h2>

      {result.insights?.length > 0 && (
        <ul className={styles.list}>
          {result.insights.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}

      {result.blocks?.length > 0 && (
        <>
          <p className={styles.subtle}>Proposed blocks — nothing is added until you add it.</p>
          <ul className={styles.blocks}>
            {result.blocks.map((b, i) => (
              <li key={i}>
                <span className={styles.bTime}>
                  {b.start}–{b.end}
                </span>
                <span className={styles.bTitle}>{b.title}</span>
                {b.priority === 'high' && <span className={styles.key}>★</span>}
                {b.reason && <span className={styles.bReason}>{b.reason}</span>}
              </li>
            ))}
          </ul>
          <p className={styles.subtle}>
            Add the ones you want in the <Link to="/planner">Daily Planner</Link>.
          </p>
        </>
      )}

      {result.suggestions?.length > 0 && (
        <>
          <p className={styles.subtle}>You could try</p>
          <ul className={styles.list}>
            {result.suggestions.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </>
      )}

      {result.note && <p className={styles.note}>{result.note}</p>}

      <Meta meta={meta} />

      <div className={styles.draftActions}>
        <button className="btn btn-secondary" onClick={onDrop}>
          Discard
        </button>
        <button className="btn" onClick={onKeep}>
          Keep it
        </button>
      </div>
    </section>
  );
}

function ParsedCommand({ parsed, onClose }) {
  if (parsed.intent === 'unknown') {
    return (
      <div className={styles.parsed}>
        <p className={styles.parsedText}>
          I couldn’t tell what to do with that. Try something like “add DSA tomorrow at 8 AM”.
        </p>
        <button className={styles.close} onClick={onClose} aria-label="Dismiss">
          ✕
        </button>
      </div>
    );
  }

  const t = parsed.task ?? {};
  return (
    <div className={styles.parsed}>
      <div>
        <p className={styles.parsedText}>{parsed.restate || 'Understood:'}</p>
        <p className={styles.parsedDetail}>
          {t.title}
          {t.date && ` · ${t.date}`}
          {t.start && ` · ${t.start}`}
          {t.end && `–${t.end}`}
        </p>
        {/* The coach read the instruction; the user still makes the change. */}
        <p className={styles.subtle}>
          Add it yourself in <Link to="/tasks">Tasks</Link> or the{' '}
          <Link to="/planner">Planner</Link> — the coach doesn’t write to your plan.
        </p>
      </div>
      <button className={styles.close} onClick={onClose} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

function RecCard({ rec, onStatus }) {
  const dismissed = rec.status === 'dismissed';
  return (
    <div className={`card ${styles.rec} ${dismissed ? styles.recDismissed : ''}`}>
      <div className={styles.recHead}>
        <h3 className={styles.recTitle}>{rec.headline}</h3>
        <span className={styles.badge}>{LABELS[rec.type] ?? rec.type}</span>
      </div>

      {rec.insights?.length > 0 && (
        <ul className={styles.list}>
          {rec.insights.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {rec.suggestions?.length > 0 && (
        <ul className={styles.list}>
          {rec.suggestions.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}

      <Meta meta={rec.meta} />

      <div className={styles.recActions}>
        {rec.status === 'new' ? (
          <>
            <button className={styles.linkBtn} onClick={() => onStatus('dismissed')}>
              Dismiss
            </button>
            <button className={styles.linkBtn} onClick={() => onStatus('accepted')}>
              Useful
            </button>
          </>
        ) : (
          <span className={styles.statusTag}>
            {rec.status === 'accepted' ? 'Marked useful' : 'Dismissed'}
          </span>
        )}
      </div>
    </div>
  );
}

const LABELS = {
  review_day: 'Day review',
  review_week: 'Week review',
  plan_day: 'Plan',
  insight: 'Pattern',
};

function Meta({ meta }) {
  if (!meta) return null;
  return (
    <p className={styles.meta}>
      {meta.model}
      {meta.tokens ? ` · ${meta.tokens} tokens` : ''}
      {meta.filtered > 0 && (
        <span className={styles.filtered}>
          {' '}
          · {meta.filtered} line{meta.filtered === 1 ? '' : 's'} withheld by the safety rules
        </span>
      )}
    </p>
  );
}
