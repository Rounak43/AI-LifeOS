import { SAFETY_RULES } from './safety.js';

/**
 * Prompt construction (Phase 5).
 *
 * The model gets two things and nothing else: a role with hard rules, and a compact block
 * of **already-computed** facts. It is never asked to add, average or infer a number —
 * every figure below was calculated deterministically before it got here
 * (ARCHITECTURE §5, `computeDay` / `summarizeFocus`).
 *
 * Renderers are pure string builders so the exact bytes leaving this server can be
 * asserted in tests — which is also how "we never send the whole database" stays true.
 */

const VOICE = `You are the coach inside AI LifeOS, a personal productivity and wellbeing app.
You speak to one person about their own day, in second person, plainly and briefly.
You are calm and specific. You never cheerlead, never moralise, and never pad.
Prefer one concrete observation drawn from the numbers over three generic ones.`;

const HONESTY = `HONESTY RULES:
- Use only the figures given. Never invent, estimate or extrapolate a number.
- The score is an app-defined indicator, not an authoritative measure. Never call it
  a measure of worth, discipline or ability.
- "Captured" means what the user logged, not everything they did. Never treat an
  uncaptured hour as a wasted one.
- A rest day is not a failure and is not scored. If it is a rest day, do not suggest work.`;

const jsonOnly = (shape) =>
  `Reply with JSON only — no prose, no code fence. Exact shape:\n${shape}`;

/** Shared header for every system prompt. */
function systemPrompt(taskLine, shape) {
  return [VOICE, taskLine, HONESTY, SAFETY_RULES, jsonOnly(shape)].join('\n\n');
}

// ---- system prompts per task ------------------------------------------------

export const SYSTEM = {
  reviewDay: systemPrompt(
    `TASK: Review the day just described. Say what actually happened, name one pattern
worth noticing, and offer at most two things the user could try. If the day is too
empty to review honestly, say so in the headline and keep insights to one line.`,
    `{"headline": string (max 90 chars),
 "insights": string[] (1-4 items, max 280 chars each),
 "suggestions": string[] (0-3 items, max 280 chars each)}`
  ),

  reviewWeek: systemPrompt(
    `TASK: Review the week described. Look across days for a pattern the user would not
see from a single day — consistency, drift, which days hold up. Name it once, plainly.`,
    `{"headline": string (max 90 chars),
 "insights": string[] (1-4 items, max 280 chars each),
 "suggestions": string[] (0-3 items, max 280 chars each)}`
  ),

  insight: systemPrompt(
    `TASK: Find one behavioural pattern in this stretch of days worth telling the user
about — for example consistent over-planning, or which days hold up and which slip.
State the evidence from the figures given, then the pattern. If the data is too thin
for an honest pattern, say exactly that and give no suggestions.`,
    `{"headline": string (max 90 chars),
 "insights": string[] (1-3 items, max 280 chars each),
 "suggestions": string[] (0-2 items, max 280 chars each)}`
  ),

  planDay: systemPrompt(
    `TASK: Propose a realistic set of time blocks for the day from the user's open tasks.
Rules: high-priority tasks get the earliest workable slots; respect blocks that already
exist and do not overlap them; keep blocks between 25 and 90 minutes; leave gaps between
them. Propose fewer blocks than the user could theoretically fit — an over-full plan is
the failure mode this app exists to fix. If it is a rest day, propose nothing and say why.`,
    `{"headline": string (max 90 chars),
 "blocks": [{"title": string, "start": "HH:MM", "end": "HH:MM",
             "priority": "low"|"medium"|"high", "reason": string (max 160 chars)}] (max 10),
 "note": string (max 280 chars, optional)}`
  ),

  command: [
    `You convert one short instruction about a personal planner into structured JSON.
You do not chat, explain, or answer questions. You only classify and extract.`,
    `RULES:
- Resolve relative dates ("today", "tomorrow", "monday") against the given today's date.
- Convert times to 24-hour HH:MM. "8" with no meridiem in a work context means 08:00;
  "8 tonight" or "8pm" means 20:00.
- If no end time is given, leave "end" out. Do not invent a duration.
- If the instruction is not a planner action, or you are unsure what it means, return
  intent "unknown" with a low confidence and no task object. Guessing is worse than
  admitting you did not understand.
- "restate" is a plain-English echo of what you understood, for the user to confirm.`,
    jsonOnly(
      `{"intent": "create_task"|"create_block"|"move_block"|"complete_task"|"unknown",
 "confidence": number 0-1,
 "task": {"title": string, "date": "YYYY-MM-DD", "start": "HH:MM",
          "end": "HH:MM", "priority": "low"|"medium"|"high"} (omit when unknown),
 "restate": string (max 160 chars)}`
    ),
  ].join('\n\n'),
};

// ---- context renderers ------------------------------------------------------

const fmtMin = (m) => {
  const n = Math.max(0, Math.round(Number(m) || 0));
  const h = Math.floor(n / 60);
  const r = n % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
};

/**
 * Render one day as a compact fact block.
 *
 * Every line is a figure the client already computed. Note what is absent: no journal,
 * no mood notes, no task descriptions, no raw logs — see schemas.js for why that is
 * enforced rather than merely intended.
 */
export function renderDayContext(ctx) {
  const m = ctx.metrics;
  const lines = [`DATE: ${ctx.date} (${ctx.timezone})`];

  if (ctx.goal) lines.push(`MAIN GOAL: ${ctx.goal}`);
  if (m.restDay) lines.push('REST DAY: yes — not scored, no work expected.');

  lines.push(
    `SCORE: ${m.score == null ? 'not enough captured to score' : `${m.score}/100 (app-defined indicator)`}`,
    `KEY STEPS: ${m.keySteps.done} of ${m.keySteps.total} done`,
    `TASKS: ${m.tasks.completed} completed, ${m.tasks.pending} pending, ${m.tasks.missed} missed (${m.tasks.total} total)`,
    `PLAN: ${m.plan.done} of ${m.plan.totalBlocks} blocks done, ${m.plan.missed} missed`,
    `TIME: planned ${fmtMin(m.plan.plannedMinutes)}, captured ${fmtMin(m.plan.actualMinutes)}` +
      (m.plan.adherence != null ? ` (adherence ${Math.round(m.plan.adherence * 100)}%)` : '')
  );

  if (m.focus) {
    const t = m.focus.byTag;
    lines.push(
      `FOCUS: ${fmtMin(m.focus.focusMin)} across ${m.focus.count} self-logged block(s)` +
        (t ? ` — productive ${fmtMin(t.productive)}, neutral ${fmtMin(t.neutral)}, distracting ${fmtMin(t.distracting)}` : '')
    );
  }

  if (m.sleepMin != null) lines.push(`SLEEP: ${fmtMin(m.sleepMin)} (self-logged)`);
  // Only present when the user consented; schemas.js rejects it otherwise.
  if (ctx.mood != null) lines.push(`MOOD: ${ctx.mood}/5 (self-rated)`);

  if (ctx.blocks?.length) {
    lines.push('BLOCKS:');
    for (const b of ctx.blocks) {
      lines.push(
        `- ${b.start}-${b.end} ${b.title}` +
          (b.priority === 'high' ? ' [key]' : '') +
          (b.status ? ` [${b.status}]` : ' [not captured]')
      );
    }
  }

  if (ctx.tasks?.length) {
    lines.push('TASKS:');
    for (const t of ctx.tasks) {
      lines.push(
        `- ${t.title} [${t.status}]` +
          (t.priority === 'high' ? ' [key]' : '') +
          (t.estMinutes ? ` [est ${fmtMin(t.estMinutes)}]` : '') +
          (t.actualMinutes ? ` [took ${fmtMin(t.actualMinutes)}]` : '')
      );
    }
  }

  if (ctx.habits?.length) {
    lines.push(
      `HABITS: ${ctx.habits.map((h) => `${h.name} ${h.doneToday ? 'done' : 'not yet'}`).join(', ')}`
    );
  }

  return lines.join('\n');
}

/** Render a stretch of days as one row each — a table, not a transcript. */
export function renderWeekContext(ctx) {
  const lines = [`RANGE: ${ctx.startDate} to ${ctx.endDate} (${ctx.timezone})`];
  if (ctx.goal) lines.push(`MAIN GOAL: ${ctx.goal}`);
  lines.push('', 'DAYS (one row each):');

  for (const d of ctx.days) {
    if (d.restDay) {
      lines.push(`- ${d.date}: rest day (not scored)`);
      continue;
    }
    const parts = [
      `score ${d.score == null ? '—' : d.score}`,
      `tasks ${d.tasksCompleted} done / ${d.tasksMissed} missed`,
      `planned ${fmtMin(d.plannedMinutes)} vs captured ${fmtMin(d.actualMinutes)}`,
    ];
    if (d.focusMin != null) parts.push(`focus ${fmtMin(d.focusMin)}`);
    if (d.sleepMin != null) parts.push(`slept ${fmtMin(d.sleepMin)}`);
    lines.push(`- ${d.date}: ${parts.join(', ')}`);
  }

  return lines.join('\n');
}

/** Render an NL command plus just enough of the plan to resolve references in it. */
export function renderCommandContext(ctx) {
  const lines = [`TODAY: ${ctx.today} (${ctx.timezone})`, `INSTRUCTION: ${ctx.text}`];
  if (ctx.openTasks?.length) lines.push(`OPEN TASKS: ${ctx.openTasks.join('; ')}`);
  if (ctx.blocks?.length) {
    lines.push(`TODAY'S BLOCKS: ${ctx.blocks.map((b) => `${b.start} ${b.title}`).join('; ')}`);
  }
  return lines.join('\n');
}
