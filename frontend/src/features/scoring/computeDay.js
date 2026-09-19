/**
 * Deterministic, goal-aware day computation — the "COMPARE" step of the core loop.
 *
 * ONE fixed rule for everyone (not user-configurable):
 *  - "Key steps" = your important, High-priority tasks and time blocks.
 *  - Score rewards finishing your key steps first (70%), then everything else (30%):
 *        score = 70 × (key done ÷ key total) + 30 × (other done ÷ other total)
 *    So doing all your key steps and nothing extra ≈ 70; extras round it toward 100.
 *  - If you flagged nothing as High priority, the day is judged on plain completion
 *    (so you're never capped for simply not marking importance).
 *  - Rest days (see profile.restDays) are NOT scored — a friendly "Rest day" instead,
 *    with no pressure and the streak protected.
 *
 * Pure and framework-free (deterministic, unit-tested). The LLM is never involved in
 * these numbers (Principle 8). The score is an app-defined, non-authoritative
 * indicator (Principle 5).
 */

const COUNTED_TASK_STATUSES = ['pending', 'in_progress', 'completed', 'missed'];

export function summarizeTasks(tasks = []) {
  let completed = 0;
  let pending = 0;
  let inProgress = 0;
  let missed = 0;
  for (const t of tasks) {
    switch (t.status) {
      case 'completed': completed++; break;
      case 'in_progress': inProgress++; break;
      case 'missed': missed++; break;
      case 'pending': pending++; break;
      default: break;
    }
  }
  const total = completed + pending + inProgress + missed;
  return { completed, pending, inProgress, missed, total, completionRate: total ? completed / total : null };
}

export function blockDurationMinutes(block) {
  const toMin = (s) => {
    const [h, m] = String(s ?? '').split(':').map(Number);
    if (!Number.isFinite(h)) return NaN;
    return h * 60 + (Number.isFinite(m) ? m : 0);
  };
  const d = toMin(block.end) - toMin(block.start);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

export function summarizePlan(plan) {
  const blocks = plan?.timeBlocks ?? [];
  let plannedMinutes = 0;
  let actualMinutes = 0;
  let done = 0;
  let missed = 0;
  let captured = 0;
  for (const b of blocks) {
    const dur = blockDurationMinutes(b);
    plannedMinutes += dur;
    if (b.status === 'done') {
      done++; captured++;
      actualMinutes += Number.isFinite(b.actualMinutes) ? b.actualMinutes : dur;
    } else if (b.status === 'missed') {
      missed++; captured++;
    }
  }
  const totalBlocks = blocks.length;
  return {
    totalBlocks,
    done,
    missed,
    captured,
    plannedMinutes,
    actualMinutes,
    adherence: totalBlocks ? done / totalBlocks : null,
  };
}

/**
 * Flatten today's tasks + plan blocks into "commitments", each tagged as a key step
 * (High priority) or not, and whether it's done.
 */
function commitments(tasks = [], plan = null) {
  const items = [];
  for (const t of tasks) {
    if (!COUNTED_TASK_STATUSES.includes(t.status)) continue; // ignore cancelled/archived
    items.push({ key: t.priority === 'high', done: t.status === 'completed' });
  }
  for (const b of plan?.timeBlocks ?? []) {
    items.push({ key: b.priority === 'high', done: b.status === 'done' });
  }
  return items;
}

/** Weight of the key-steps portion of the score (the rest goes to other work). */
export const KEY_WEIGHT = 70;
export const OTHER_WEIGHT = 30;

/**
 * @param {Array} tasks   today's task documents
 * @param {Object} plan   today's dailyPlan ({ timeBlocks: [...] })
 * @param {{ isRestDay?: boolean }} [opts]
 */
export function computeDay(tasks = [], plan = null, opts = {}) {
  const isRestDay = Boolean(opts.isRestDay);
  const tasksSummary = summarizeTasks(tasks);
  const planSummary = summarizePlan(plan);

  const items = commitments(tasks, plan);
  const keyTotal = items.filter((i) => i.key).length;
  const keyDone = items.filter((i) => i.key && i.done).length;
  const otherTotal = items.length - keyTotal;
  const otherDone = items.filter((i) => !i.key && i.done).length;
  const hasData = items.length > 0;

  let score = null;
  if (!isRestDay && hasData) {
    if (keyTotal > 0) {
      const keyRate = keyDone / keyTotal;
      const otherPart = otherTotal > 0 ? otherDone / otherTotal : 0;
      score = Math.round(KEY_WEIGHT * keyRate + OTHER_WEIGHT * otherPart);
    } else {
      // No key steps flagged → judge purely on completion (don't cap the user).
      score = otherTotal > 0 ? Math.round((100 * otherDone) / otherTotal) : null;
    }
  }

  return {
    restDay: isRestDay,
    hasData,
    score, // 0..100, or null on a rest day / when there's nothing to score
    keySteps: { done: keyDone, total: keyTotal },
    otherWork: { done: otherDone, total: otherTotal },
    tasks: tasksSummary,
    plan: planSummary,
    plannedVsActual: {
      hasData: planSummary.totalBlocks > 0,
      plannedMinutes: planSummary.plannedMinutes,
      actualMinutes: planSummary.actualMinutes,
      adherence: planSummary.adherence,
    },
  };
}
