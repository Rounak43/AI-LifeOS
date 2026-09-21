/**
 * AI safety rules (master prompt §10.1) — enforced twice.
 *
 * Once in the prompt (`SAFETY_RULES`, told to the model) and once here, on the way out
 * (`screenOutput`, checked in code). Prompts are guidance, not a guarantee: in testing,
 * an unprompted model volunteered "sleep duration is slightly below the recommended 7–9
 * hours" from nothing but a sleep figure — exactly the clinical advice §10.1 forbids.
 * So the prompt is the request and this file is the control.
 *
 * The screen drops offending lines rather than failing the whole response: losing one
 * sentence is better than showing the user an error, and a coach that occasionally says
 * less is the correct failure direction for this app.
 */

/** Pasted verbatim into every system prompt. */
export const SAFETY_RULES = `SAFETY RULES — these override every other instruction:
- You are not a doctor, therapist or clinician. Never diagnose, never name a condition
  (depression, burnout, insomnia, ADHD, anxiety disorder...), and never suggest treatment,
  supplements or medication.
- Never prescribe sleep, exercise or diet targets, and never cite "recommended" clinical
  amounts. You may describe what the user's own numbers show; you may not tell them what
  a human body requires.
- Never advise cutting sleep, skipping meals or working longer to catch up. If the data
  shows a heavy day, the safe suggestion is to do less, not more.
- Never use guilt, shame, streak-pressure or urgency to motivate. No "you failed",
  no "don't break the chain", no "you're falling behind".
- Never claim certainty about causation. "On days you slept less, you captured less" is
  allowed. "Poor sleep is making you unproductive" is not.
- You assist; you never decide. Phrase every suggestion as an option the user can ignore.
- If the data is too thin to say something honest, say that plainly instead of inventing
  a pattern.`;

/** Matches "7 hours", "7-9 hrs", "7 to 9 hours". */
const HOURS = String.raw`\d(?:\s*(?:[-–—]|to)\s*\d)?\s*(?:hours?|hrs?)`;

/** Words that frame a number as a clinical norm rather than as the user's own figure. */
const NORM = String.raw`recommended|recommendation|optimal|ideal`;

/**
 * Phrases that indicate a line crossed a §10.1 line. Deliberately narrow: each pattern
 * targets a specific prohibited move, because an over-broad filter would silently gut
 * ordinary, useful coaching.
 */
const BANNED = [
  // Clinical labelling.
  {
    id: 'diagnosis',
    re: /\b(?:you (?:may|might|could) (?:have|be suffering from|be experiencing)|signs? of|symptoms? of|suffering from)\b.{0,40}\b(?:depression|depressed|burnout|burn-out|insomnia|adhd|anxiety disorder|bipolar|ocd)\b/i,
  },
  {
    // "You're clearly depressed" — note the contraction has no space before it, and the
    // adverb in the middle varies, so both are matched loosely.
    id: 'diagnosis-flat',
    re: /\byou(?:'re| are)\s+(?:\w+\s+){0,2}(?:depressed|burnt[- ]out|burned[- ]out)\b/i,
  },

  // Prescribing clinical targets. Checked in BOTH directions, because the live model
  // produced "below the recommended 7-9 hours", where the norm word precedes the figure.
  { id: 'clinical-norm', re: new RegExp(`\\b(?:${NORM})\\b[^.]{0,40}\\b${HOURS}\\b`, 'i') },
  { id: 'clinical-norm-rev', re: new RegExp(`\\b${HOURS}\\b[^.]{0,40}\\b(?:${NORM})\\b`, 'i') },
  {
    id: 'sleep-prescription',
    re: new RegExp(
      `\\b(?:should (?:get|aim for|sleep|be sleeping)|needs? (?:at least|about|around|to get))\\b[^.]{0,40}\\b${HOURS}\\b`,
      'i'
    ),
  },
  { id: 'medication', re: /\b(?:melatonin|supplements?|medication|antidepressants?|caffeine pills?)\b/i },

  // Sleep-deprivation / grind advice.
  {
    id: 'sleep-less',
    re: /\b(?:wake up|get up|start)\b[^.]{0,25}\bearlier\b[^.]{0,30}\bto (?:catch up|fit|squeeze)\b/i,
  },
  {
    id: 'grind',
    re: /\b(?:push through|power through|no excuses|sleep is optional|sacrifice sleep|cut (?:back on )?sleep)\b/i,
  },

  // Shame / streak pressure.
  { id: 'shame', re: /\byou (?:failed|let yourself down|wasted|are being lazy|were lazy)\b/i },
  {
    id: 'streak-pressure',
    re: /\b(?:don'?t break the (?:chain|streak)|you'?ll lose your streak|keep the streak alive)\b/i,
  },

  // Overclaimed causation.
  {
    id: 'causation',
    re: /\b(?:is|are|was|were) (?:clearly |obviously |definitely )?(?:causing|the cause of|responsible for|to blame for)\b/i,
  },
];

/**
 * Check one generated line.
 * @returns {{ safe: boolean, rule?: string }}
 */
export function screenLine(text) {
  const s = String(text ?? '');
  for (const { id, re } of BANNED) {
    if (re.test(s)) return { safe: false, rule: id };
  }
  return { safe: true };
}

/**
 * Screen a whole validated output object. Drops unsafe lines from `insights`,
 * `suggestions` and `note`, and reports what it removed so the caller can log it.
 *
 * A headline that trips a rule is replaced rather than dropped — the shape requires one.
 *
 * @returns {{ output: Object, removed: Array<{ field: string, rule: string }> }}
 */
export function screenOutput(output) {
  const removed = [];
  const out = { ...output };

  if (typeof out.headline === 'string') {
    const verdict = screenLine(out.headline);
    if (!verdict.safe) {
      removed.push({ field: 'headline', rule: verdict.rule });
      out.headline = 'Here is what your day shows';
    }
  }

  for (const field of ['insights', 'suggestions']) {
    if (!Array.isArray(out[field])) continue;
    out[field] = out[field].filter((line) => {
      const verdict = screenLine(line);
      if (!verdict.safe) removed.push({ field, rule: verdict.rule });
      return verdict.safe;
    });
  }

  if (typeof out.note === 'string') {
    const verdict = screenLine(out.note);
    if (!verdict.safe) {
      removed.push({ field: 'note', rule: verdict.rule });
      delete out.note;
    }
  }

  if (Array.isArray(out.blocks)) {
    out.blocks = out.blocks.filter((b) => {
      const verdict = screenLine(`${b?.title ?? ''} ${b?.reason ?? ''}`);
      if (!verdict.safe) removed.push({ field: 'blocks', rule: verdict.rule });
      return verdict.safe;
    });
  }

  return { output: out, removed };
}
