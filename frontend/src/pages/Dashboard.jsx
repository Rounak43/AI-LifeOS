import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToday } from '../hooks/useToday.js';
import { useTasks } from '../hooks/useTasks.js';
import { useDailyPlan } from '../hooks/useDailyPlan.js';
import { computeDay } from '../features/scoring/computeDay.js';
import { sortBlocks } from '../features/planner/plannerApi.js';
import { DEFAULT_REST_DAYS } from '../features/profile/goals.js';
import { greeting, formatLongDate, formatMinutes, localWeekdayIndex } from '../utils/time.js';
import { useCountUp } from '../hooks/useCountUp.js';
import styles from './Dashboard.module.css';

/**
 * The dashboard — "How am I doing today?". Assembled live from Firestore (tasks +
 * today's plan) with the deterministic score computed on the client. Updates
 * instantly as you capture done/missed, closing the PLAN → TRACK → COMPARE loop.
 */
export default function Dashboard() {
  const { user, profile, resendVerification } = useAuth();
  const { today, timezone } = useToday();
  const { tasks, loading: tasksLoading } = useTasks(today);
  const { plan, loading: planLoading } = useDailyPlan(today);

  const restDays = profile?.restDays ?? DEFAULT_REST_DAYS;
  const isRestDay = restDays.includes(localWeekdayIndex(timezone));

  const day = useMemo(
    () => computeDay(tasks, plan, { isRestDay }),
    [tasks, plan, isRestDay]
  );

  const loading = tasksLoading || planLoading;
  const name = profile?.name || user?.displayName || null;
  const topBlocks = useMemo(() => sortBlocks(plan?.timeBlocks ?? []).slice(0, 4), [plan]);

  // The rest-day banner is a gentle greeting — show it briefly, then let it fade out.
  const [showRestBanner, setShowRestBanner] = useState(true);
  useEffect(() => {
    if (!day.restDay) return undefined;
    setShowRestBanner(true);
    const t = setTimeout(() => setShowRestBanner(false), 5000);
    return () => clearTimeout(t);
  }, [day.restDay]);

  return (
    <div>
      {user && !user.emailVerified && (
        <VerifyBar onResend={resendVerification} />
      )}

      <header className={styles.header}>
        <div>
          <h1 className={styles.greeting}>
            {greeting(timezone)}
            {name ? `, ${name}` : ''}.
          </h1>
          <p className={styles.date}>{formatLongDate(timezone)}</p>
        </div>
        <ScorePill score={day.score} hasData={day.hasData} restDay={day.restDay} />
      </header>

      {day.restDay ? (
        showRestBanner && (
          <div className={styles.restBanner}>
            🌿 <strong>Rest day.</strong> No score pressure today — recharge. Your streak is safe.
          </div>
        )
      ) : (
        day.keySteps.total > 0 && (
          <div className={styles.keyBar}>
            <span className={styles.keyLabel}>★ Key steps</span>
            <span className={styles.keyProgress}>
              {day.keySteps.done}/{day.keySteps.total} done
            </span>
            <div className={styles.keyTrack}>
              <div
                className={styles.keyFill}
                style={{ width: `${Math.round((day.keySteps.done / day.keySteps.total) * 100)}%` }}
              />
            </div>
          </div>
        )
      )}

      <section className={styles.grid}>
        {/* Plan */}
        <div className="card">
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Today’s plan</h2>
            <Link to="/planner" className={styles.cardLink}>
              Open planner →
            </Link>
          </div>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : day.plan.totalBlocks > 0 ? (
            <>
              <p className={styles.subtle}>
                {day.plan.done} done · {day.plan.missed} missed ·{' '}
                {day.plan.totalBlocks - day.plan.captured} to go
              </p>
              <ul className={styles.blocks}>
                {topBlocks.map((b) => (
                  <li key={b.id} className={b.status ? styles[`b_${b.status}`] : ''}>
                    <span className={styles.bTime}>{b.start}</span> {b.title}
                    {b.status === 'done' && ' ✓'}
                    {b.status === 'missed' && ' ✕'}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState
              emoji="🗓️"
              title="Plan your first day"
              body="Block out your day, then capture what actually happens with one tap."
              cta={{ to: '/planner', label: 'Go to Daily Planner' }}
            />
          )}
        </div>

        {/* Tasks */}
        <div className="card">
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Tasks</h2>
            <Link to="/tasks" className={styles.cardLink}>
              Open tasks →
            </Link>
          </div>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : day.tasks.total > 0 ? (
            <div className={styles.counts}>
              <Count label="Done" value={day.tasks.completed} tone="ok" />
              <Count label="Pending" value={day.tasks.pending + day.tasks.inProgress} />
              <Count label="Missed" value={day.tasks.missed} tone="warn" />
            </div>
          ) : (
            <EmptyState
              emoji="✓"
              title="No tasks yet"
              body="Add what you want to get done today."
              cta={{ to: '/tasks', label: 'Add a task' }}
            />
          )}
        </div>

        {/* Planned vs Actual */}
        <div className="card">
          <h2 className={styles.cardTitle}>Planned vs Actual</h2>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : day.plannedVsActual.hasData ? (
            <PlannedVsActual pva={day.plannedVsActual} />
          ) : (
            <EmptyState
              emoji="↔"
              title="Nothing to compare yet"
              body="Once you’ve planned a day and captured what happened, this shows where your time really went."
            />
          )}
        </div>
      </section>
    </div>
  );
}

function ScorePill({ score, hasData, restDay }) {
  if (restDay) {
    return (
      <div className={styles.scorePill} title="Rest days aren't scored.">
        <span className={styles.scoreLabel}>Today</span>
        <span className={styles.restValue}>🌿 Rest</span>
      </div>
    );
  }
  return <AnimatedScore score={hasData && score != null ? score : null} />;
}

function AnimatedScore({ score }) {
  const display = useCountUp(score);
  return (
    <div className={styles.scorePill} title="App-defined indicator, not authoritative.">
      <span className={styles.scoreLabel}>Today’s score</span>
      <span className={styles.scoreValue}>{score == null ? '—' : display}</span>
    </div>
  );
}

function PlannedVsActual({ pva }) {
  const planned = pva.plannedMinutes;
  const actual = pva.actualMinutes;
  const pct = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;
  return (
    <div>
      <div className={styles.pvaRow}>
        <span className="muted">Planned</span>
        <strong>{formatMinutes(planned)}</strong>
      </div>
      <div className={styles.bar}>
        <div className={styles.barFill} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.pvaRow}>
        <span className="muted">Actual</span>
        <strong>{formatMinutes(actual)}</strong>
      </div>
      {pva.adherence != null && (
        <p className={styles.adherence}>
          Plan adherence: {Math.round(pva.adherence * 100)}%
        </p>
      )}
    </div>
  );
}

function Count({ label, value, tone }) {
  return (
    <div className={styles.count}>
      <span className={[styles.countValue, tone ? styles[tone] : ''].join(' ')}>{value}</span>
      <span className={styles.countLabel}>{label}</span>
    </div>
  );
}

function EmptyState({ emoji, title, body, cta }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyEmoji} aria-hidden>
        {emoji}
      </div>
      <div className={styles.emptyTitle}>{title}</div>
      <p className={styles.emptyBody}>{body}</p>
      {cta && (
        <Link to={cta.to} className={`btn ${styles.emptyCta}`}>
          {cta.label}
        </Link>
      )}
    </div>
  );
}

function VerifyBar({ onResend }) {
  return (
    <div className={styles.verifyBar}>
      <span>Please verify your email to secure your account.</span>
      <button className={styles.verifyBtn} onClick={() => onResend()}>
        Resend email
      </button>
    </div>
  );
}
