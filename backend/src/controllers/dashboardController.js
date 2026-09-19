import { ok } from '../utils/apiResponse.js';
import { getDashboard } from '../services/dashboardService.js';

export async function getDashboardHandler(req, res, next) {
  try {
    const data = await getDashboard(req.user.uid, { email: req.user.email });
    return ok(res, data);
  } catch (err) {
    next(err);
  }
}
