import rateLimit from 'express-rate-limit';

/**
 * Basic rate limiting. Keyed by the authenticated uid when available, otherwise IP.
 */
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 120, // requests per window per key
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid ?? req.ip,
  message: { success: false, error: { code: 'rate_limited', message: 'Too many requests.' } },
});

/**
 * AI endpoints get their own, much tighter bucket (Phase 5).
 *
 * Sized well under the provider's free tier so one runaway client — a retry loop, a stuck
 * component — cannot exhaust the day's quota for the whole deployment. Keyed by uid, since
 * the free-tier limit is per organization, not per caller.
 */
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  // Measured: the free tier allows 8,000 tokens/minute and a review costs ~1,050, so a
  // single user can sustain about seven. Six keeps one call of headroom.
  limit: 6,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid ?? req.ip,
  message: {
    success: false,
    error: { code: 'rate_limited', message: 'That is a lot of coaching. Give it a minute.' },
  },
});
