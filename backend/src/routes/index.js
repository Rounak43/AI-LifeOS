import { Router } from 'express';
import userRoutes from './userRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';

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

// Placeholders (implemented in their phases): /tasks, /planner (Phase 2),
// /habits, /calendar, /sleep, /workouts, /journal (Phase 3), /analytics (Phase 4),
// /ai (Phase 5), /timeline (Phase 6), /wellbeing (Phase 7), /notifications (Phase 8).

export default router;
