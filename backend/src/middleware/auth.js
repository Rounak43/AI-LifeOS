import { getAuth } from '../config/firebase.js';
import { ApiError } from '../utils/apiResponse.js';

/**
 * Verify the caller's Firebase ID token on EVERY protected request.
 *
 * The React client obtains an ID token from Firebase Auth and sends it as
 *   Authorization: Bearer <token>
 * We verify it with the Admin SDK and attach the decoded identity to req.user.
 * Express never trusts a uid the client claims in a body/param — only req.user.uid.
 */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new ApiError(401, 'unauthenticated', 'Missing or malformed Authorization header.');
    }

    const decoded = await getAuth().verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? false,
    };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    // Token expired / revoked / invalid, or Admin not configured.
    return next(new ApiError(401, 'unauthenticated', 'Invalid or expired credentials.'));
  }
}
