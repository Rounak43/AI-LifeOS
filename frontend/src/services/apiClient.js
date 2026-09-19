import { auth } from './firebase.js';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

/**
 * Thin fetch wrapper that attaches the current user's Firebase ID token and
 * unwraps the { success, data } / { success, error } envelope.
 */
async function request(path, { method = 'GET', body, auth: needsAuth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (needsAuth) {
    const user = auth?.currentUser;
    if (!user) throw new ApiClientError('unauthenticated', 'Not signed in.', 401);
    const token = await user.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiClientError('network_error', 'Could not reach the server.', 0);
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON response.
  }

  if (!res.ok || !payload?.success) {
    const err = payload?.error ?? {};
    throw new ApiClientError(err.code ?? 'error', err.message ?? res.statusText, res.status, err.details);
  }

  return payload.data;
}

export class ApiClientError extends Error {
  constructor(code, message, status, details) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};
