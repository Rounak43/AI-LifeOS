/**
 * Consistent JSON envelopes for every response (see ARCHITECTURE.md §API surface).
 *
 *   success: { "success": true,  "data": <payload> }
 *   error:   { "success": false, "error": { "code": <string>, "message": <string> } }
 */

export function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function fail(res, status, code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return res.status(status).json({ success: false, error });
}

/**
 * A typed application error that middleware/errorHandler can turn into an envelope.
 */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
