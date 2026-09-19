import { ApiError, fail } from '../utils/apiResponse.js';
import { env } from '../config/env.js';

/** 404 for unmatched routes. */
export function notFound(_req, res) {
  return fail(res, 404, 'not_found', 'Resource not found.');
}

/**
 * Central error handler. Must have the 4-arg signature for Express to treat it
 * as an error middleware.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return fail(res, err.status, err.code, err.message, err.details);
  }

  // Unexpected: log server-side, return a generic message to the client.
  console.error('[unhandled]', err);
  const message = env.isProd ? 'Something went wrong.' : String(err?.message ?? err);
  return fail(res, 500, 'internal_error', message);
}
