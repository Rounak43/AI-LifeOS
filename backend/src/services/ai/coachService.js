import { ApiError } from '../../utils/apiResponse.js';
import { chatJSON, parseJsonReply, providerTrainsOnInput } from './provider.js';
import { screenOutput } from './safety.js';
import { SYSTEM, renderDayContext, renderWeekContext, renderCommandContext } from './prompts.js';
import {
  reviewOutputSchema,
  planOutputSchema,
  commandOutputSchema,
} from './schemas.js';

/**
 * The recommendation pipeline (master prompt §10).
 *
 *   validated context  →  render deterministic facts  →  LLM  →  parse
 *                      →  validate shape  →  screen for safety  →  return
 *
 * Every stage after the LLM assumes the model is wrong until proven otherwise: the reply
 * is parsed defensively, validated against a Zod shape, then screened line-by-line
 * against §10.1. Nothing reaches the user that hasn't survived all three.
 *
 * Storing accepted recommendations in `aiRecommendations` happens on the **client**, which
 * already owns the Firestore write path (the server has no Admin credentials yet — see
 * docs/adr/0004). The server stays stateless here, which also means it never holds a copy
 * of anyone's day.
 */

/** Refuse to route consent-gated data through a provider that trains on inputs. */
function assertProviderFitsConsent(ctx) {
  if (ctx?.mood != null && providerTrainsOnInput()) {
    throw new ApiError(
      403,
      'provider_not_permitted',
      'The configured AI provider trains on free-tier inputs, so mood data cannot be sent to it.'
    );
  }
}

/**
 * Run one pipeline step end to end.
 * @returns {{ result: Object, meta: Object }}
 */
async function run({ system, user, schema, maxTokens = 900, temperature = 0.4, fast = false }) {
  const started = Date.now();
  const reply = await chatJSON({ system, user, maxTokens, temperature, fast });

  const parsed = parseJsonReply(reply.text);
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    // The model answered, but not in the contract. Treat it as a provider fault, not a
    // user error — and never show the malformed payload to the client.
    console.error('[ai] output failed validation:', validated.error.issues.slice(0, 3));
    throw new ApiError(502, 'ai_bad_output', 'The coach returned an unexpected answer. Try again.');
  }

  const { output, removed } = screenOutput(validated.data);
  if (removed.length) {
    console.warn('[ai] safety screen removed:', removed.map((r) => `${r.field}:${r.rule}`).join(', '));
  }

  return {
    result: output,
    meta: {
      model: reply.model,
      provider: reply.provider,
      tokens: reply.usage?.total_tokens ?? null,
      ms: Date.now() - started,
      // Surfaced so the UI can be honest when a line was withheld.
      filtered: removed.length,
    },
  };
}

// ---- the five coach features ------------------------------------------------

export function reviewDay(context) {
  assertProviderFitsConsent(context);
  return run({
    system: SYSTEM.reviewDay,
    user: renderDayContext(context),
    schema: reviewOutputSchema,
  });
}

export function reviewWeek(context) {
  return run({
    system: SYSTEM.reviewWeek,
    user: renderWeekContext(context),
    schema: reviewOutputSchema,
  });
}

export function behaviouralInsight(context) {
  return run({
    system: SYSTEM.insight,
    user: renderWeekContext(context),
    schema: reviewOutputSchema,
    temperature: 0.3, // pattern-finding should be steady, not creative
  });
}

export function planDay(context) {
  assertProviderFitsConsent(context);
  return run({
    system: SYSTEM.planDay,
    user: renderDayContext(context),
    schema: planOutputSchema,
    maxTokens: 1200,
    temperature: 0.3,
  });
}

/**
 * Natural-language command parsing. Uses the small model: high frequency, tight schema,
 * and the user confirms the result before anything is written either way.
 */
export function parseCommand(context) {
  return run({
    system: SYSTEM.command,
    user: renderCommandContext(context),
    schema: commandOutputSchema,
    maxTokens: 400,
    temperature: 0.1, // extraction, not invention
    fast: true,
  });
}
