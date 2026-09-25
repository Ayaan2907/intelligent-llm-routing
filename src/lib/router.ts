/**
 * The demo's single routing surface — every model decision in the app goes
 * through `llm-router-profiles` from here. This file is the boundary the
 * no-duplicated-selector CI check guards: the demo must not grow its own
 * selector, model list, or OpenRouter client again.
 */

import { createRouter, Router } from "llm-router-profiles";
import { PromptProperties } from "@/types/chat";

let cachedRouter: Router | null = null;

/**
 * Memoized router. `process.env` is read here — request time — never at
 * module scope, so importing the app with zero env vars never crashes. The
 * key is optional: selection needs none; chat() fails with a typed
 * MISSING_CREDENTIALS error when it is absent.
 */
export function getRouter(): Router {
  cachedRouter ??= createRouter({
    catalog: { source: "openrouter", ttlMinutes: 60 },
    selector: ["deterministic"],
    apiKey: process.env.OPEN_ROUTER_API_KEY,
  });
  return cachedRouter;
}

/**
 * Map the UI's prompt sliders onto the portable profile schema. Pure — the
 * weights come straight from the sliders and are normalized by the library.
 */
export function profileFromPromptProps(p: PromptProperties) {
  return {
    name: "demo-chat",
    weights: { accuracy: p.accuracy, cost: p.cost, speed: p.speed },
    constraints: p.tokenLimit > 0 ? { minContext: p.tokenLimit } : undefined,
    reasoning: p.reasoning ? ("always" as const) : ("never" as const),
  };
}
