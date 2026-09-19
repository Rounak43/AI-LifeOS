import { ok, ApiError } from '../utils/apiResponse.js';
import * as userService from '../services/userService.js';

export async function getMe(req, res, next) {
  try {
    const doc = await userService.getUserDocument(req.user.uid);
    if (!doc) {
      // Not yet provisioned — create with what we know from the verified token.
      const created = await userService.ensureUser(req.user.uid, { email: req.user.email });
      return ok(res, { profile: created.profile, settings: created.settings });
    }
    return ok(res, { profile: doc.profile ?? null, settings: doc.settings ?? null });
  } catch (err) {
    next(err);
  }
}

export async function ensureMe(req, res, next) {
  try {
    const doc = await userService.ensureUser(req.user.uid, {
      email: req.user.email,
      name: req.body?.name,
      timezone: req.body?.timezone,
    });
    return ok(res, { profile: doc.profile, settings: doc.settings }, 201);
  } catch (err) {
    next(err);
  }
}

export async function patchProfile(req, res, next) {
  try {
    const profile = await userService.updateProfile(req.user.uid, req.body);
    if (!profile) throw new ApiError(404, 'not_found', 'Profile not found.');
    return ok(res, { profile });
  } catch (err) {
    next(err);
  }
}

export async function patchSettings(req, res, next) {
  try {
    const settings = await userService.updateSettings(req.user.uid, req.body);
    return ok(res, { settings });
  } catch (err) {
    next(err);
  }
}
