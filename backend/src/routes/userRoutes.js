import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { upsertProfileSchema, updateSettingsSchema } from '../validators/userValidators.js';
import * as userController from '../controllers/userController.js';

const router = Router();

// All /users routes require a verified Firebase ID token.
router.use(requireAuth);

router.get('/me', userController.getMe);
router.post('/me/ensure', validate(upsertProfileSchema), userController.ensureMe);
router.patch('/me/profile', validate(upsertProfileSchema), userController.patchProfile);
router.patch('/me/settings', validate(updateSettingsSchema), userController.patchSettings);

export default router;
