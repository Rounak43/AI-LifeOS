import { Router } from 'express';
import userRoutes from './userRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import aiRoutes from './aiRoutes.js';

/**
 * Versioned API surface, mounted at /api/v1 (see ARCHITECTURE.md §API surface).
 * Only the Phase 1 / core-loop groups are wired up. The rest are added per phase.
 */
const router = Router();

router.get('/', (_req, res) => {
  res.json({ success: true, data: { name: 'AI LifeOS API', version: 'v1' } });
});

router.use('/users', userRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/ai', aiRoutes);

// Placeholders (implemented in their phases): /tasks, /planner (Phase 2),
// /habits, /calendar, /sleep, /workouts, /journal (Phase 3), /analytics (Phase 4),
// /timeline (Phase 6), /wellbeing (Phase 7), /notifications (Phase 8).
// These stay client-direct to Firestore for now — see docs/adr/0004.

export default router;
