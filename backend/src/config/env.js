import dotenv from 'dotenv';

// Load .env from the backend root. In production, env vars are injected by the host.
dotenv.config();

/**
 * Centralized, validated access to environment configuration.
 *
 * We intentionally DO NOT throw at import time for the Firebase Admin creds so the
 * process can boot in a "config incomplete" state and return clear errors, rather
 * than crash-looping. `assertFirebaseConfig()` is called lazily when Admin is first
 * initialized (see config/firebase.js).
 */

const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: toNumber(process.env.PORT, 4000),

  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Private keys are stored with literal "\n"; restore real newlines.
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },

  // AI + integrations are wired in later phases; kept here so the surface is discoverable.
  ai: {
    provider: process.env.AI_PROVIDER ?? 'groq',
    model: process.env.AI_MODEL,
  },
};

export function assertFirebaseConfig() {
  const { projectId, clientEmail, privateKey } = env.firebase;
  const missing = [];
  if (!projectId) missing.push('FIREBASE_PROJECT_ID');
  if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
  if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
  if (missing.length) {
    throw new Error(
      `Firebase Admin is not configured. Missing env: ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill in the service-account values.'
    );
  }
}
