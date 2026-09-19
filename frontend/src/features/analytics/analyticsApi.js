import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase.js';
import { computeDay } from '../scoring/computeDay.js';

/**
 * Client-side analytics: fetch the last N days across the user's data and build daily
 * series for charts. Deterministic and computed in code (Principle 8). This is the live
 * read path; nightly server snapshots (analyticsSnapshots) are a Phase-8/deploy job.
 */
const DAY = 86400000;
const key = (ms) => new Date(ms).toISOString().slice(0, 10);

function rangeDates(endDate, n) {
  const base = Date.parse(`${endDate}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => key(base - (n - 1 - i) * DAY));
}
const weekdayOf = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();

async function fetchByLocalDate(uid, coll, start) {
  const snap = await getDocs(query(collection(db, 'users', uid, coll), where('localDate', '>=', start)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchAnalytics(uid, { days = 30, endDate, restDays = [0, 6] } = {}) {
  const dates = rangeDates(endDate, days);
  const start = dates[0];

  const [tasks, plans, sleeps, moods, workouts, habitsSnap] = await Promise.all([
    fetchByLocalDate(uid, 'tasks', start),
    fetchByLocalDate(uid, 'dailyPlans', start),
    fetchByLocalDate(uid, 'sleepLogs', start),
    fetchByLocalDate(uid, 'moodLogs', start),
    fetchByLocalDate(uid, 'workoutLogs', start),
    getDocs(collection(db, 'users', uid, 'habits')),
  ]);
  const habits = habitsSnap.docs.map((d) => d.data());

  const tasksByDate = {};
  for (const t of tasks) (tasksByDate[t.localDate] ??= []).push(t);
  const planByDate = {};
  for (const p of plans) planByDate[p.localDate] = p;
  const sleepByDate = Object.fromEntries(sleeps.map((s) => [s.localDate, s]));
  const moodByDate = Object.fromEntries(moods.map((m) => [m.localDate, m]));
  const workoutMinByDate = {};
  for (const w of workouts) workoutMinByDate[w.localDate] = (workoutMinByDate[w.localDate] ?? 0) + (w.durationMin || 0);

  const series = { score: [], taskCompletion: [], planAdherence: [], habitRate: [], sleepMin: [], workoutMin: [], mood: [] };

  for (const d of dates) {
    const isRestDay = restDays.includes(weekdayOf(d));
    const day = computeDay(tasksByDate[d] ?? [], planByDate[d] ?? null, { isRestDay });
    series.score.push(day.restDay ? null : day.score);
    series.taskCompletion.push(day.tasks.completionRate);
    series.planAdherence.push(day.plannedVsActual.adherence);
    const habitDone = habits.filter((h) => (h.completedDates ?? []).includes(d)).length;
    series.habitRate.push(habits.length ? habitDone / habits.length : null);
    series.sleepMin.push(sleepByDate[d]?.durationMin ?? null);
    series.workoutMin.push(workoutMinByDate[d] ?? 0);
    series.mood.push(moodByDate[d]?.mood ?? null);
  }

  const avg = (arr) => {
    const vals = arr.filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);

  return {
    dates,
    series,
    totals: {
      avgScore: avg(series.score),
      avgTaskCompletion: avg(series.taskCompletion),
      avgPlanAdherence: avg(series.planAdherence),
      avgHabitRate: avg(series.habitRate),
      avgSleepMin: avg(series.sleepMin),
      totalWorkoutMin: sum(series.workoutMin),
      avgMood: avg(series.mood),
      daysTracked: dates.length,
    },
  };
}
