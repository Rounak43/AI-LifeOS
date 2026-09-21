import { env, assertAiConfig } from '../../config/env.js';
import { ApiError } from '../../utils/apiResponse.js';

/**
 * Provider-agnostic LLM transport (Phase 5).
 *
 * Nothing above this file knows which vendor answered. Swapping provider is a base-URL
 * plus key change in `.env` — the pipeline, prompts and validation are untouched.
 *
 * Three hard rules live here:
 *  1. **The API key never leaves the server.** This module is the only thing that reads it,
 *     and it is never echoed into a response, an error body or a log line.
 *  2. **Every call is bounded.** A timeout and a max-token ceiling, always — a hung
 *     provider must never hang a user's request.
 *  3. **JSON or nothing.** Every call asks for a JSON object and the caller validates the
 *     shape. We never parse prose out of a model response.
 */

/**
 * Most vendors expose an OpenAI-compatible `/chat/completions`, so one adapter covers
 * them. Gemini needs its own shape and is handled separately below.
 */
const OPENAI_COMPATIBLE = {
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  mistral: 'https://api.mistral.ai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
};

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Providers whose *free* tier trains on submitted content. PRIVACY.md forbids routing
 * anything consent-gated (mood) through these, so the pipeline checks this before it
 * builds a context. Keep this list honest and current — it is a privacy control, not a note.
 */
export const TRAINS_ON_FREE_TIER = new Set(['gemini', 'mistral']);

export function providerTrainsOnInput(provider = env.ai.provider) {
  return TRAINS_ON_FREE_TIER.has(provider);
}

/**
 * Ask the model for a JSON object.
 *
 * @param {Object} o
 * @param {string} o.system      system prompt (role, rules, output shape)
 * @param {string} o.user        the rendered, already-aggregated context
 * @param {number} [o.maxTokens] completion ceiling
 * @param {number} [o.temperature]
 * @param {boolean} [o.fast]     use the small model (high-frequency, low-stakes calls)
 * @returns {Promise<{ text: string, model: string, usage: Object, provider: string }>}
 */
export async function chatJSON({ system, user, maxTokens = 900, temperature = 0.4, fast = false }) {
  assertAiConfig();
  const provider = env.ai.provider;
  const model = fast ? env.ai.fastModel : env.ai.model;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ai.timeoutMs);

  try {
    const call = provider === 'gemini' ? callGemini : callOpenAICompatible;
    return await call({ provider, model, system, user, maxTokens, temperature, signal: controller.signal });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err?.name === 'AbortError') {
      throw new ApiError(504, 'ai_timeout', 'The coach took too long to answer. Try again.');
    }
    // Never surface a provider error verbatim — it can echo request content.
    throw new ApiError(502, 'ai_unavailable', 'The coach is unavailable right now.');
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAICompatible({ provider, model, system, user, maxTokens, temperature, signal }) {
  const base = OPENAI_COMPATIBLE[provider];
  if (!base) throw new ApiError(500, 'ai_misconfigured', `Unknown AI provider "${provider}".`);

  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  };

  // gpt-oss models reason before answering. Left at the default, reasoning eats most of
  // the completion budget and the JSON gets truncated mid-object — measured at 407 of 500
  // tokens. "low" keeps the structure intact and the answer under a second.
  if (/gpt-oss/.test(model)) body.reasoning_effort = 'low';

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.ai.keys[provider]}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) throw await providerError(res, provider);

  const json = await res.json();
  const choice = json.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new ApiError(502, 'ai_truncated', 'The coach ran out of room mid-answer. Try again.');
  }
  return {
    text: choice?.message?.content ?? '',
    model: json.model ?? model,
    usage: json.usage ?? {},
    provider,
  };
}

async function callGemini({ model, system, user, maxTokens, temperature, signal }) {
  const res = await fetch(
    `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${env.ai.keys.gemini}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
        },
      }),
      signal,
    }
  );

  if (!res.ok) throw await providerError(res, 'gemini');

  const json = await res.json();
  return {
    text: json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '',
    model,
    usage: json.usageMetadata ?? {},
    provider: 'gemini',
  };
}

/**
 * Turn a provider HTTP failure into something the client can act on, without leaking
 * the provider's response body (which can contain the prompt we just sent).
 */
async function providerError(res, provider) {
  let code = 'ai_unavailable';
  let message = 'The coach is unavailable right now.';

  if (res.status === 429) {
    code = 'ai_rate_limited';
    message = 'The coach has hit its free-tier limit. Try again in a minute.';
  } else if (res.status === 401 || res.status === 403) {
    code = 'ai_misconfigured';
    message = 'The coach is not configured correctly on the server.';
  }

  // Log server-side only, and only the status — never the body.
  console.error(`[ai] ${provider} responded ${res.status}`);
  return new ApiError(res.status === 429 ? 429 : 502, code, message);
}

/**
 * Parse a model's JSON reply. Models occasionally wrap JSON in a code fence even when
 * asked not to, so we tolerate that and nothing else.
 */
export function parseJsonReply(text) {
  const cleaned = String(text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new ApiError(502, 'ai_bad_output', 'The coach returned something unreadable.');
  }
}
