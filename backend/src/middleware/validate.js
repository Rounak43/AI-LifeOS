import { ApiError } from '../utils/apiResponse.js';

/**
 * Validate req[source] against a Zod schema. On success, replaces req[source]
 * with the parsed (and coerced) value so controllers get clean, typed input.
 *
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body'|'query'|'params'} [source='body']
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return next(new ApiError(400, 'invalid_request', 'Request validation failed.', details));
    }
    req[source] = result.data;
    next();
  };
}
