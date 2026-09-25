#!/usr/bin/env node
/**
 * Bare Node example — zero API keys, zero env vars.
 *
 * From the repo root:
 *   pnpm install
 *   pnpm --filter llm-router-profiles build   (examples import the built dist)
 *   node examples/node-script.mjs
 *
 * Selection is deterministic over the live public OpenRouter catalog, so this
 * runs with no account at all. chat() would be the step that needs a key.
 */

import { createRouter, defineProfile } from "llm-router-profiles";

const profile = defineProfile({
  name: "cheap-fast",
  weights: { accuracy: 0.2, cost: 0.6, speed: 0.2 },
  constraints: { maxInputCostPerMTok: 0.30, minContext: 32_000 },
  reasoning: "never",
});

const router = createRouter({ catalog: { source: "openrouter", ttlMinutes: 60 } });

const pick = await router.select(
  "Write a function that merges two sorted lists into one sorted list.",
  profile,
);

console.log(`model:    ${pick.model}`);
console.log(`backend:  ${pick.backend}`);
console.log(`why:      ${pick.why}`);
console.log(`matched:  ${JSON.stringify(pick.matched)}`);
console.log(`latency:  ${pick.latencyMs}ms over ${pick.candidates} candidates`);

// With a key you could continue with the routed model and get honest cost:
//   const keyed = createRouter({ apiKey: process.env.OPEN_ROUTER_API_KEY });
//   const reply = await keyed.chat(prompt, profile, { model: pick.model });
//   console.log(reply.meta.costUsd, reply.meta.provenance);
