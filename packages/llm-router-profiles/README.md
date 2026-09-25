# llm-router-profiles

Portable LLM preference profiles with a live, drift-checked model catalog and
pluggable selector backends.

Per-prompt model selection is a commodity — every gateway auto-routes. What
nobody ships together is the layer around it: **a preference profile you can
version-control** (accuracy / cost / speed weights, hard constraints, token
budgets) and **a catalog that cannot rot** (live OpenRouter sync, zod-validated
at the boundary, drift-checked in CI). That is this library.

- **Zero keys to start.** The catalog is OpenRouter's public endpoint;
  deterministic selection runs in milliseconds with no account, no key, no
  env vars.
- **Every pick explains itself.** `select()` returns `why` — the backend, the
  matched constraints, the candidate count.
- **Failure is typed, never silent.** No dead model ids, no silent fallback
  to a default: `RoutingError` with a machine-readable code.

## 30-second quickstart (zero API keys)

```bash
mkdir quickstart && cd quickstart && npm init -y >/dev/null
npm install llm-router-profiles
cat > router.mjs << 'EOF'
import { createRouter, defineProfile } from "llm-router-profiles";

const profile = defineProfile({
  name: "cheap-fast",
  weights: { accuracy: 0.2, cost: 0.6, speed: 0.2 }, // normalized to sum to 1
  constraints: { maxInputCostPerMTok: 0.30, minContext: 32_000 },
  reasoning: "never",
});

// No apiKey — the catalog is public and selection is deterministic.
const router = createRouter({ catalog: { source: "openrouter", ttlMinutes: 60 } });

const pick = await router.select(
  "Write a function that merges two sorted lists into one sorted list.",
  profile,
);
console.log(pick.model);
console.log(pick.why);
EOF
node router.mjs
```

Measured from a clean directory on 2026-09-25 (node 20, install to output):

```text
cohere/north-mini-code:free
deterministic: best weighted fit for profile "cheap-fast" over 194/460 live candidates — cost $0.00/$0.00 per MTok (cost weight 0.60); context 256k >= min 32k; unscored (no live signal): accuracy @ weight 0.20, speed @ weight 0.20
```

The catalog had 460 live models; the pick took 9 ms of scoring after the
catalog fetch. Nothing was downloaded but the package and the public catalog.

## Keyed path: chat with honest cost

```ts
import { createRouter } from "llm-router-profiles";

const router = createRouter({
  catalog: { source: "openrouter", ttlMinutes: 60 },
  selector: ["deterministic", "openrouter-auto", "llm"], // ordered fallback chain
  apiKey: process.env.OPEN_ROUTER_API_KEY, // optional — required only for chat()
});

const reply = await router.chat("Summarize this paragraph.", profile);
console.log(reply.text);
console.log(reply.meta.usage);      // { promptTokens, completionTokens, totalTokens } | null
console.log(reply.meta.costUsd);    // { input, output, total } | null — live per-model pricing
console.log(reply.meta.provenance.costNote); // why cost is null, when it is
console.log(reply.meta.provenance); // which backend picked it, catalog freshness
```

Cost is **computed from the live catalog pricing for the routed model** — not
an estimate, not stale pricing. When cost cannot be computed honestly, it is
`null` with a `costNote` saying why.

## The profile

A profile is version-controlled JSON — the artifact nobody else standardizes:

```ts
const profile = defineProfile({
  name: "cheap-fast",
  weights: { accuracy: 0.2, cost: 0.6, speed: 0.2 },
  constraints: {
    maxInputCostPerMTok: 0.30,  // USD per million input tokens
    maxOutputCostPerMTok: 0.60,
    minContext: 32_000,          // context window floor
  },
  tokenBudget: { perRequest: 8_000 },
  reasoning: "never",            // never | auto | always
});
```

Malformed input fails with precise zod paths (`weights.cost`,
`constraints.minContext`); weights are normalized to sum to exactly 1.
`defineProfile` is idempotent — the normalized shape round-trips.

## Selector backends

`selector` is an ordered fallback chain — explicit, logged, typed:

| Backend | Needs a key | Latency | Behavior |
| --- | --- | --- | --- |
| `deterministic` (default) | no | milliseconds | Constraint filters, then weighted scoring over real catalog pricing |
| `openrouter-auto` | yes | one completion | Delegates the pick to OpenRouter's own auto-router |
| `llm` | yes | one completion | Ask a model to pick from the constraint-satisfying shortlist — pass `createLlmBackend({ selectorModel, apiKey })`, never a silent default |
| custom | — | — | Implement `SelectorBackend`; the chain validates its pick against the catalog |

A backend's failure is recorded in `attempts` and the next backend runs. When
every backend fails you get `RoutingError` with `ALL_BACKENDS_FAILED` — a
degraded 200 that lies is the bug this library exists to prevent.

## What the catalog guarantees

- Fetched live from OpenRouter's public `GET /api/v1/models`; cached with a
  TTL you control; **no API key needed**.
- Every entry is zod-validated at the boundary; entries that fail validation
  are dropped and counted, never smuggled through.
- `select()` results are membership-checked against the snapshot — no backend,
  LLM or otherwise, can route to a model id the catalog does not contain.
- Staleness is data, not a crash: a failed refresh serves the previous
  snapshot flagged `stale: true` with a `staleReason`.

## Typed errors

`RoutingError` codes: `CATALOG_UNAVAILABLE`, `NO_MODEL_FITS`,
`ALL_BACKENDS_FAILED`, `MISSING_CREDENTIALS`, `UPSTREAM_ERROR`,
`INVALID_RESPONSE`, `CONFIG_INVALID`. Match on the code, never the message.

## Comparison

| | llm-router-profiles | LiteLLM | Portkey | openrouter/auto |
| --- | --- | --- | --- | --- |
| Portable, version-controlled preference profile | ✅ JSON | config-in-code | platform config | ❌ |
| Live, drift-checked catalog in CI | ✅ | ❌ | ❌ | internal |
| Deterministic, explainable pick (`why`) | ✅ | partial | ❌ | opaque |
| Zero-key demo mode | ✅ | ❌ | ❌ | ❌ |
| Proxy / gateway / retries / load balancing | ❌ | ✅ | ✅ | ✅ |

**What this does not do:** it is not a gateway. It does not proxy requests,
retry, load-balance, or rate-limit; there is no hosted service. It is the
preference layer that decides *which model* — you keep your existing client
for the call itself.

## Examples

- [`examples/node-script.mjs`](../../../examples/node-script.mjs) — bare Node, zero keys
- [`examples/nextjs-route-handler/`](../../../examples/nextjs-route-handler/) — Next.js App Router route handler
- [`examples/mcp.json`](../../../examples/mcp.json) — MCP client config for the upcoming MCP surface

The demo chat app in this repository consumes the library for all of its
routing — CI fails if duplicated selector logic reappears in demo code.

## Drift gate

CI checks every model id mentioned in these docs and the examples against the
live OpenRouter catalog — a doc that names a dead model fails the build.

## License

[MIT](./LICENSE)
