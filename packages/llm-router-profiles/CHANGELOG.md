# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-25

### Added

- `defineProfile` — validate and normalize a portable preference profile
  (`weights`, `constraints`, `tokenBudget`, `reasoning`); weights are
  normalized to sum to 1 and malformed input fails with precise zod paths.
- `createRouter` — the library entry point. Live OpenRouter catalog sync with
  TTL caching (`catalog: { source: "openrouter", ttlMinutes }`) or a static
  entry list for tests; ordered selector-backend chain.
- Deterministic selector backend: millisecond, explainable scoring over real
  catalog pricing; hard constraints (price caps, context floor, reasoning
  policy, deprecation) filter before ranking.
- `openrouter-auto` passthrough backend and a failure-typed `llm` backend
  (explicit `selectorModel`, hallucinated ids rejected against the shortlist).
- `router.select()` returning `{ model, backend, why, matched, candidates, latencyMs }`
  — every pick explains itself; `router.chat()` returning text plus `meta`
  with token usage and cost computed from live per-model pricing.
- Typed failures throughout: `RoutingError` with machine-readable codes
  (`CATALOG_UNAVAILABLE`, `NO_MODEL_FITS`, `ALL_BACKENDS_FAILED`,
  `MISSING_CREDENTIALS`, `UPSTREAM_ERROR`, `INVALID_RESPONSE`,
  `CONFIG_INVALID`) — never a silent fallback to a default model.
- Zero-config demo mode: importing and selecting works with no API key; the
  catalog comes from OpenRouter's public endpoint.
- Catalog boundary validated with zod; entries that fail validation are
  dropped and counted, never smuggled into the catalog.
- Staleness is data, not a crash: a failed refresh serves the previous
  snapshot with `stale: true` and a `staleReason`.

[0.1.0]: https://github.com/Ayaan2907/intelligent-llm-routing/releases/tag/v0.1.0
