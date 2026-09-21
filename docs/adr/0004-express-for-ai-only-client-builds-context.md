# ADR 0004 — Express exists for the AI layer only, and the client builds the context

- **Status:** Accepted
- **Date:** 2026-09-20
- **Phase:** 5 (AI Coach)

## Context

`NEXT-STEPS.md` carried an open question: the Express API was scaffolded in Phase 1 and
then never used, because the web client talks directly to Firestore under Security Rules
(ADR 0001, ADR 0002). Either deploy Express or commit to serverless.

Phase 5 forces the issue, but only partly. One thing genuinely **cannot** live in the
browser: the LLM API key. Everything else the coach needs — tasks, plans, focus sessions,
the computed score — the client already has in memory, already computed by the same
deterministic modules the UI renders (`computeDay`, `summarizeFocus`).

A second constraint shaped this: **there is still no Firebase Admin service-account key.**
The obvious design — server reads Firestore with the Admin SDK, aggregates, calls the LLM —
needs that key, which would have blocked the phase indefinitely.

While building, we found that `verifyIdToken()` does **not** need it. It validates a JWT
against Google's *public* certificates and needs only the project id to check the audience.
The Admin credential is required for Firestore, Storage and custom tokens — not for
authenticating a caller.

## Decision

**Express is kept, deployed, and scoped to the AI layer alone.** It is not becoming the
app's data path. Every other feature stays client-direct to Firestore.

The pipeline splits:

| Stage | Where | Why |
| --- | --- | --- |
| Retrieve + aggregate | **Client** | It already holds the data and the deterministic modules |
| Compute metrics | **Client** | `computeDay` / `summarizeFocus` — the same numbers the UI shows |
| Hold the API key | **Server** | The only thing that genuinely cannot be in a browser |
| Build the prompt | **Server** | So prompts and safety rules version with the server |
| Validate the reply | **Server** | Zod shape + §10.1 safety screen |
| Store the result | **Client** | `aiRecommendations`, owner-scoped, like every other collection |

The server runs **verify-only**: `initializeApp({ projectId })`, enough to authenticate
every request, not enough to read anyone's data. `getFirestore()` still asserts full
credentials, so the moment a service-account key is added, trusted server reads light up
with no code change.

### The deviation, stated plainly

`PRIVACY.md` says the context is "a small, structured, aggregated context built
**server-side**". Here the client builds it and the server **validates** it. That is a real
deviation and it is accepted deliberately, because the properties that matter are preserved:

- The API key never reaches the browser.
- The LLM still never does arithmetic — it receives figures already computed.
- The context is still small and structured, and now **provably** so: `schemas.js` is
  `.strict()` with per-array caps, so an oversized or unexpected payload is rejected
  rather than trimmed.
- Journal text still cannot reach the model — there is no field for it anywhere in the
  schema, so a client that sends one gets a 400.

What is weakened: a *modified* client could send arbitrary text within those caps. The
blast radius is that user's own account and the deployment's own free-tier quota, which
the per-uid rate limit bounds. That is an acceptable trade for shipping; it is not
acceptable forever, and the fix is the server-side build below.

## Consequences

- ✅ Phase 5 shipped without the Admin service-account key.
- ✅ The boundary became testable. Because the contract is an explicit schema rather than
  an internal function call, "journal never leaves the device" and "mood needs consent"
  are assertions in a test suite (19 backend + 11 frontend) instead of claims in a doc.
- ✅ Provider swaps are a base-URL change. `provider.js` is the only file that knows a
  vendor exists; `TRAINS_ON_FREE_TIER` makes the privacy policy of each one a code-level
  fact, and the pipeline refuses to route consent-gated data to a training-tier provider.
- ⚠️ **Free-tier limits are tight and were measured, not assumed:** Groq's
  `openai/gpt-oss-120b` allows 1,000 requests/day but only **8,000 tokens/minute**. A
  review costs ~1,050 tokens, so roughly seven per minute. The per-uid limiter is set to
  6/min for that reason. The client should cache and reuse a day's review rather than
  regenerate it on every visit.
- ⚠️ **`gpt-oss` is a reasoning model.** At default effort it spent 407 of 500 completion
  tokens reasoning and truncated the JSON mid-object. `provider.js` pins
  `reasoning_effort: 'low'` for any `gpt-oss` model — worth re-checking on a model swap.
- ⚠️ The Express deployment is now on the critical path for one feature only. If it is
  down, the coach is unavailable and the rest of the app is unaffected — which is why
  `/ai/status` exists and the UI hides itself rather than erroring.
- 📝 **When the Admin key arrives**, move retrieve/aggregate server-side behind the same
  request shape. The endpoints would accept `{ date }` instead of `{ context }` and build
  the context from Firestore, closing the deviation above. The prompts, schemas, safety
  screen and eval set are unchanged by that move — which is why they were built separately
  from the transport.
