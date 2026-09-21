import { ok } from '../utils/apiResponse.js';
import { isAiConfigured, env } from '../config/env.js';
import { providerTrainsOnInput } from '../services/ai/provider.js';
import {
  reviewDay,
  reviewWeek,
  behaviouralInsight,
  planDay,
  parseCommand,
} from '../services/ai/coachService.js';

/**
 * AI Coach endpoints (Phase 5).
 *
 * Controllers stay thin: the middleware has already verified the Firebase ID token and
 * validated the body against the boundary schema, so by the time we are here the context
 * is known-small, known-shaped and known-free of journal text.
 */

/**
 * Capability probe. The client calls this once and hides the coach entirely if the server
 * has no key configured — better than offering a button that always errors.
 *
 * Deliberately reports the provider and its data policy, because PRIVACY.md promises to
 * "always disclose what data leaves the device and to whom" and the UI renders this.
 */
export function getStatusHandler(_req, res) {
  return ok(res, {
    available: isAiConfigured(),
    provider: env.ai.provider,
    model: env.ai.model,
    // Drives the consent UI: mood cannot be offered at all on a training-tier provider.
    trainsOnInput: providerTrainsOnInput(),
  });
}

const handler = (fn, pick = (req) => req.body.context) =>
  async function aiHandler(req, res, next) {
    try {
      const { result, meta } = await fn(pick(req));
      return ok(res, { result, meta });
    } catch (err) {
      next(err);
    }
  };

export const reviewDayHandler = handler(reviewDay);
export const reviewWeekHandler = handler(reviewWeek);
export const insightHandler = handler(behaviouralInsight);
export const planDayHandler = handler(planDay);
export const commandHandler = handler(parseCommand, (req) => req.body);
