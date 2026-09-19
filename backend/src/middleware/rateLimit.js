import rateLimit from 'express-rate-limit';

/**
 * Basic rate limiting. Keyed by the authenticated uid when available, otherwise IP.
 * Tune per-route later (AI endpoints will want tighter limits).
 */
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 120, // requests per window per key
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid ?? req.ip,
  message: { success: false, error: { code: 'rate_limited', message: 'Too many requests.' } },
});
