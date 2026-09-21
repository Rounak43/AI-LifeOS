import { z } from 'zod';

/**
 * The AI boundary contract (Phase 5).
 *
 * This file is a **privacy control**, not a formality. Everything that may reach the LLM
 * has to fit one of these schemas, and anything that doesn't is rejected before a prompt
 * is built. Three properties it is designed to guarantee:
 *
 *  1. **Journal text can never reach the model.** There is no field for it — not optional,
 *     not nullable, absent. `.strict()` means a client that sends one gets a 400 rather
 *     than having it silently dropped (PRIVACY.md: journal is end-to-end encrypted and
 *     the server has no business seeing it, ever).
 *  2. **The context stays small.** Every array is capped and every string truncated, so
 *     "never send the whole database to the LLM" is enforced by the parser instead of by
 *     good intentions.
 *  3. **Mood is consent-gated.** It only validates when `consent.mood` is explicitly true,
 *     and the pipeline additionally refuses to send it to a provider that trains on inputs.
 *
 * Numbers are computed on the client by the same deterministic modules the UI uses
 * (`computeDay`, `summarizeFocus`) and are re-checked here for range. The model receives
 * arithmetic already done — it never calculates (ARCHITECTURE §5).
 */

const LOCAL_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');

/** A user-authored title. Truncated rather than rejected so a long title isn't a hard error. */
const title = (max = 80) =>
  z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.slice(0, max));

const count = z.number().int().min(0).max(10000);

// ---- the pieces of a day ----------------------------------------------------

const taskSchema = z
  .object({
    title: title(80),
    status: z.enum(['pending', 'in_progress', 'completed', 'missed', 'cancelled', 'archived']),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    estMinutes: z.number().int().min(0).max(1440).nullable().optional(),
    actualMinutes: z.number().int().min(0).max(1440).nullable().optional(),
    category: title(40).nullable().optional(),
  })
  .strict();

const blockSchema = z
  .object({
    title: title(80),
    start: HHMM,
    end: HHMM,
    type: z.string().max(20).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    status: z.enum(['done', 'missed']).nullable().optional(),
  })
  .strict();

const habitSchema = z
  .object({
    name: title(60),
    doneToday: z.boolean(),
    streakCurrent: count.optional(),
  })
  .strict();

/** Deterministic day metrics — computed in code, never by the model. */
const metricsSchema = z
  .object({
    score: z.number().int().min(0).max(100).nullable(),
    restDay: z.boolean().default(false),
    keySteps: z.object({ done: count, total: count }).strict(),
    tasks: z
      .object({ completed: count, pending: count, missed: count, total: count })
      .strict(),
    plan: z
      .object({
        totalBlocks: count,
        done: count,
        missed: count,
        plannedMinutes: count,
        actualMinutes: count,
        adherence: z.number().min(0).max(5).nullable().optional(),
      })
      .strict(),
    focus: z
      .object({
        focusMin: count,
        count,
        byTag: z
          .object({ productive: count, neutral: count, distracting: count })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    sleepMin: z.number().int().min(0).max(1440).nullable().optional(),
  })
  .strict();

/**
 * What the user has allowed the coach to use. Defaults are the minimum (PRIVACY.md
 * §Consent model: journal/mood default OFF).
 */
const consentSchema = z
  .object({
    mood: z.boolean().default(false),
  })
  .strict()
  .default({ mood: false });

/**
 * One day of context. Deliberately flat and small.
 *
 * `.strict()` throughout is the point: an unknown key — `journal`, `journalText`,
 * `entries`, anything — fails validation loudly instead of riding along into a prompt.
 */
export const dayContextSchema = z
  .object({
    date: LOCAL_DATE,
    timezone: z.string().max(64).default('UTC'),
    goal: title(120).nullable().optional(),
    metrics: metricsSchema,
    tasks: z.array(taskSchema).max(25).default([]),
    blocks: z.array(blockSchema).max(20).default([]),
    habits: z.array(habitSchema).max(15).default([]),
    // Consent-gated. A 1–5 rating only; free-text mood notes are never accepted.
    mood: z.number().int().min(1).max(5).nullable().optional(),
    consent: consentSchema,
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.mood != null && !val.consent?.mood) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mood'],
        message: 'Mood was supplied without consent.mood — refusing to build a context with it.',
      });
    }
  });

/** A week is a handful of day summaries, not a week of raw records. */
export const weekContextSchema = z
  .object({
    startDate: LOCAL_DATE,
    endDate: LOCAL_DATE,
    timezone: z.string().max(64).default('UTC'),
    goal: title(120).nullable().optional(),
    days: z
      .array(
        z
          .object({
            date: LOCAL_DATE,
            score: z.number().int().min(0).max(100).nullable(),
            restDay: z.boolean().default(false),
            tasksCompleted: count,
            tasksMissed: count,
            plannedMinutes: count,
            actualMinutes: count,
            focusMin: count.optional(),
            sleepMin: z.number().int().min(0).max(1440).nullable().optional(),
          })
          .strict()
      )
      .min(1)
      .max(31),
    consent: consentSchema,
  })
  .strict();

// ---- request bodies ---------------------------------------------------------

export const reviewDayRequestSchema = z.object({ context: dayContextSchema }).strict();
export const reviewWeekRequestSchema = z.object({ context: weekContextSchema }).strict();
export const planDayRequestSchema = z.object({ context: dayContextSchema }).strict();
export const insightRequestSchema = z.object({ context: weekContextSchema }).strict();

export const commandRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(200),
    today: LOCAL_DATE,
    timezone: z.string().max(64).default('UTC'),
    // Titles only, so the model can match "move my workout" to an existing block.
    openTasks: z.array(title(80)).max(25).default([]),
    blocks: z.array(z.object({ title: title(80), start: HHMM }).strict()).max(20).default([]),
  })
  .strict();

// ---- model output shapes ----------------------------------------------------

/**
 * Every generated sentence is capped. A coach that writes an essay is a coach nobody
 * reads, and a long reply is also a cheap way to burn a free-tier budget.
 */
const line = z.string().trim().min(1).max(280);

export const reviewOutputSchema = z
  .object({
    headline: z.string().trim().min(1).max(90),
    insights: z.array(line).min(1).max(4),
    suggestions: z.array(line).max(3).default([]),
  })
  .strip();

export const planOutputSchema = z
  .object({
    headline: z.string().trim().min(1).max(90),
    blocks: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(80),
            start: HHMM,
            end: HHMM,
            priority: z.enum(['low', 'medium', 'high']).default('medium'),
            reason: z.string().trim().max(160).optional(),
          })
          .strip()
      )
      .max(10)
      .default([]),
    note: line.optional(),
  })
  .strip();

export const commandOutputSchema = z
  .object({
    intent: z.enum(['create_task', 'create_block', 'move_block', 'complete_task', 'unknown']),
    confidence: z.number().min(0).max(1).default(0.5),
    task: z
      .object({
        title: z.string().trim().min(1).max(80),
        date: LOCAL_DATE.optional(),
        start: HHMM.optional(),
        end: HHMM.optional(),
        priority: z.enum(['low', 'medium', 'high']).default('medium'),
      })
      .strip()
      .optional(),
    // What the model thinks it heard, echoed back so the user can confirm before anything
    // is written. The coach proposes; the user commits (Principle 7).
    restate: z.string().trim().max(160).optional(),
  })
  .strip();
