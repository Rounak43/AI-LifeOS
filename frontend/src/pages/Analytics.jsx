import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToday } from '../hooks/useToday.js';
import { fetchAnalytics } from '../features/analytics/analyticsApi.js';
import { DEFAULT_REST_DAYS } from '../features/profile/goals.js';
import { Bars, Line } from '../components/MiniChart.jsx';
import { formatMinutes } from '../utils/time.js';
import styles from './Analytics.module.css';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export default function Analytics() {
  const { user, profile } = useAuth();
  const { today } = useToday();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setLoading(true);
    fetchAnalytics(user.uid, { days, endDate: today, restDays: profile?.restDays ?? DEFAULT_REST_DAYS })
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user, days, today, profile?.restDays]);

  const t = data?.totals;
  const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const scoreVal = (v) => (v == null ? '—' : Math.round(v));

  return (
    <div>
      <header className={styles.head}>
        <h1 className={styles.title}>Analytics</h1>
        <div className={styles.ranges}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              className={`${styles.rangeBtn} ${days === r.days ? styles.rangeOn : ''}`}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <p className="muted">Crunching your last {days} days…</p>
      ) : !data ? (
        <p className={styles.err}>Couldn’t load analytics.</p>
      ) : (
        <>
          <div className={styles.tiles}>
            <Tile label="Avg score" value={scoreVal(t.avgScore)} />
            <Tile label="Tasks done" value={pct(t.avgTaskCompletion)} />
            <Tile label="Plan adherence" value={pct(t.avgPlanAdherence)} />
            <Tile label="Habit rate" value={pct(t.avgHabitRate)} />
            <Tile label="Avg sleep" value={t.avgSleepMin ? formatMinutes(t.avgSleepMin) : '—'} />
            <Tile label="Workout total" value={formatMinutes(t.totalWorkoutMin)} />
            <Tile label="Avg mood" value={t.avgMood ? `${t.avgMood.toFixed(1)}/5` : '—'} />
          </div>

          <div className={styles.charts}>
            <ChartCard title="Productivity score">
              <Bars values={data.series.score} max={100} />
            </ChartCard>
            <ChartCard title="Habit completion">
              <Line values={data.series.habitRate.map((v) => (v == null ? null : v * 100))} max={100} color="var(--ok)" />
            </ChartCard>
            <ChartCard title="Sleep (hours)">
              <Line values={data.series.sleepMin.map((v) => (v == null ? null : v / 60))} color="#0ea5e9" />
            </ChartCard>
            <ChartCard title="Mood">
              <Line values={data.series.mood} max={5} color="#a855f7" />
            </ChartCard>
            <ChartCard title="Workout minutes">
              <Bars values={data.series.workoutMin} color="#f97316" />
            </ChartCard>
            <ChartCard title="Plan adherence">
              <Line values={data.series.planAdherence.map((v) => (v == null ? null : v * 100))} max={100} />
            </ChartCard>
          </div>
          <p className={styles.note}>
            App-defined indicators computed from your own data — not authoritative. Empty days
            show as gaps.
          </p>
        </>
      )}
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className={`card ${styles.tile}`}>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileLabel}>{label}</span>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className={`card ${styles.chartCard}`}>
      <h2 className={styles.chartTitle}>{title}</h2>
      {children}
    </div>
  );
}
