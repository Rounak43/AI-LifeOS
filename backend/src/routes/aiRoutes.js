import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { aiRateLimit } from '../middleware/rateLimit.js';
import {
  getStatusHandler,
  reviewDayHandler,
  reviewWeekHandler,
  insightHandler,
  planDayHandler,
  commandHandler,
} from '../controllers/aiController.js';
import {
  reviewDayRequestSchema,
  reviewWeekRequestSchema,
  insightRequestSchema,
  planDayRequestSchema,
  commandRequestSchema,
} from '../services/ai/schemas.js';

/**
 * /api/v1/ai — the AI Coach (Phase 5).
 *
 * Every route is authenticated, rate-limited well below the provider's free tier, and
 * body-validated against the boundary schema before a prompt is built. The order matters:
 * auth → limit → validate → handler, so an unauthenticated or oversized request never
 * reaches the point where it could cost a token.
 */
const router = Router();

router.get('/status', requireAuth, getStatusHandler);

router.post('/review/day', requireAuth, aiRateLimit, validate(reviewDayRequestSchema), reviewDayHandler);
router.post('/review/week', requireAuth, aiRateLimit, validate(reviewWeekRequestSchema), reviewWeekHandler);
router.post('/insight', requireAuth, aiRateLimit, validate(insightRequestSchema), insightHandler);
router.post('/plan-day', requireAuth, aiRateLimit, validate(planDayRequestSchema), planDayHandler);
router.post('/command', requireAuth, aiRateLimit, validate(commandRequestSchema), commandHandler);

export default router;
