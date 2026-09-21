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

  /**
   * LLM configuration (Phase 5). The provider is swapped by base URL + key; nothing
   * above this layer knows which vendor is answering. Keys live ONLY here, server-side.
   */
  ai: {
    provider: process.env.AI_PROVIDER ?? 'groq',
    model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b',
    // A smaller, faster model for high-frequency, low-stakes work (NL command parsing).
    fastModel: process.env.AI_MODEL_FAST ?? 'openai/gpt-oss-20b',
    timeoutMs: toNumber(process.env.AI_TIMEOUT_MS, 20000),
    keys: {
      groq: process.env.GROQ_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      openrouter: process.env.OPENROUTER_API_KEY,
      mistral: process.env.MISTRAL_API_KEY,
      cerebras: process.env.CEREBRAS_API_KEY,
    },
  },
};

/** True when the configured provider actually has a key — used for graceful degradation. */
export function isAiConfigured() {
  return Boolean(env.ai.keys[env.ai.provider]);
}

export function assertAiConfig() {
  if (!isAiConfigured()) {
    throw new Error(
      `AI provider "${env.ai.provider}" has no API key. Set ${env.ai.provider.toUpperCase()}_API_KEY in backend/.env.`
    );
  }
}

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
