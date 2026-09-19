import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDashboardHandler } from '../controllers/dashboardController.js';

const router = Router();

// One aggregate endpoint for the whole dashboard (avoid N+1 client reads).
router.get('/', requireAuth, getDashboardHandler);

export default router;
