# llm-router demo — portable LLM preference profiles

The demo chat app for [`llm-router-profiles`](./packages/llm-router-profiles) —
an open-source TypeScript library for **portable LLM preference profiles** with
a **live, drift-checked model catalog** and **pluggable selector backends**.

The library is the product; this Next.js chat app dogfoods it: every model
decision the demo makes — selection and chat — goes through the library, and
CI fails if demo-side selector logic reappears.

## Quickstart (zero API keys)

```bash
pnpm install
pnpm --filter llm-router-profiles build
pnpm dev
```

Open http://localhost:3000 and chat. With no env vars at all:

- **Model selection works** — deterministic scoring over OpenRouter's live
  public catalog (no key needed to read it).
- **Chat requires `OPEN_ROUTER_API_KEY`** — set it in `.env` for completions;
  without it the API fails with a typed `MISSING_CREDENTIALS` error, never a
  silent fallback.

For the library itself — quickstart, profile schema, selector backends, and
comparison table — see [`packages/llm-router-profiles`](./packages/llm-router-profiles).

## How routing works here

| Before | After |
| --- | --- |
| Hardcoded list of 11 models, 2+ of them dead ids | Live catalog, 460+ validated entries, refreshed on a TTL |
| LLM selector on a retired model id | Deterministic scoring in milliseconds, explainable `why` |
| Silent fallback to a default model on any error | Typed `RoutingError` with machine-readable codes |

The routing surface lives in [`src/lib/router.ts`](./src/lib/router.ts); the
API routes are [`src/app/api/select-model/route.ts`](./src/app/api/select-model/route.ts)
and [`src/app/api/chat/route.ts`](./src/app/api/chat/route.ts). Chat responses
carry `usage` and `costUsd` computed from the live per-model pricing.

## Examples

- [`examples/node-script.mjs`](./examples/node-script.mjs) — bare Node, zero keys
- [`examples/nextjs-route-handler/`](./examples/nextjs-route-handler/) — drop-in App Router route handler
- [`examples/mcp.json`](./examples/mcp.json) — MCP client config for the upcoming MCP surface

## Drift gate

CI extracts every model id named in docs, examples, and demo source and
asserts each exists in the live OpenRouter catalog — a dead id anywhere fails
the build with a named report. See
[`scripts/drift-gate.mjs`](./scripts/drift-gate.mjs).

## Development

```bash
pnpm build                # next build (demo)
pnpm lint                 # next lint
pnpm --filter llm-router-profiles test       # library test suite
node --test scripts/drift-gate.test.mjs      # drift-gate script tests
node scripts/drift-gate.mjs                  # live drift check
node scripts/pack-verify.mjs                 # npm pack dry-run gate
node scripts/no-duplicated-selector.mjs      # dogfooding gate
```

The library is MIT-licensed — see
[`packages/llm-router-profiles/LICENSE`](./packages/llm-router-profiles/LICENSE).
