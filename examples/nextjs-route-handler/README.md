# Next.js route handler example

A single App Router route handler that routes model selection through
`llm-router-profiles` — the same pattern the demo app in this repo runs.

## Use it

1. In your Next.js app: `npm install llm-router-profiles`
2. Copy [`route.ts`](./route.ts) to `app/api/select-model/route.ts`
   (`src/app/api/select-model/route.ts` in a src-layout app).
3. Call it:

```bash
curl -X POST http://localhost:3000/api/select-model \
  -H 'Content-Type: application/json' \
  -d '{"message":"Summarize this paragraph.","promptProps":{"accuracy":7,"cost":5,"speed":6,"tokenLimit":2000,"reasoning":false}}'
```

Response:

```json
{
  "model": "cohere/north-mini-code:free",
  "reason": "deterministic: best weighted fit for profile \"demo-chat\" over 194/460 live candidates — ...",
  "backend": "deterministic",
  "matched": { "maxInputCostPerMTok": 0.3, "minContext": 2000, "reasoning": "never" },
  "latencyMs": 9,
  "timestamp": "2026-09-25T00:00:00.000Z"
}
```

## Notes

- **Zero env vars to start** — selection needs no key. Importing the module
  never reads env; the key is touched inside the handler only.
- `OPEN_ROUTER_API_KEY` (optional) unlocks `router.chat()` with honest
  per-model cost from live catalog pricing.
- Failures are typed: `NO_MODEL_FITS` → 422, catalog or upstream problems → 502,
  each carrying the `RoutingError` code. There is no silent fallback model.
