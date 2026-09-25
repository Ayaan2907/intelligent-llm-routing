/**
 * Next.js App Router route handler example — model selection through
 * the library, with the demo's prompt sliders mapped onto a portable profile.
 *
 * Drop this file at `app/api/select-model/route.ts` (or `src/app/api/...`
 * in a src-layout app). Requires `npm install llm-router-profiles`.
 *
 * Zero-env invariant: importing this module never reads env vars — the key is
 * touched only inside the handler, at request time. Without a key, selection
 * works (deterministic + public catalog) and chat fails with a typed error.
 */

import { NextResponse } from "next/server";
import { createRouter, defineProfile, isRoutingError } from "llm-router-profiles";

interface PromptProperties {
  accuracy: number;
  cost: number;
  speed: number;
  tokenLimit: number;
  reasoning: boolean;
}

/** Map UI sliders onto the portable profile schema. Pure — safe to unit test. */
function profileFromPromptProps(p: PromptProperties) {
  return defineProfile({
    name: "demo-chat",
    weights: { accuracy: p.accuracy, cost: p.cost, speed: p.speed },
    constraints: p.tokenLimit > 0 ? { minContext: p.tokenLimit } : undefined,
    reasoning: p.reasoning ? "always" : "never",
  });
}

let cached: ReturnType<typeof createRouter> | null = null;

/** Memoized router; constructed at request time so import stays env-free. */
function getRouter() {
  cached ??= createRouter({
    catalog: { source: "openrouter", ttlMinutes: 60 },
    selector: ["deterministic"],
    apiKey: process.env.OPEN_ROUTER_API_KEY,
  });
  return cached;
}

export async function POST(request: Request) {
  const { message, promptProps } = await request.json();

  if (typeof message !== "string" || message.length === 0) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (!promptProps) {
    return NextResponse.json({ error: "promptProps is required" }, { status: 400 });
  }

  try {
    // Every pick explains itself: model, backend, why, matched constraints.
    const pick = await getRouter().select(message, profileFromPromptProps(promptProps));
    return NextResponse.json({
      model: pick.model,
      reason: pick.why,
      backend: pick.backend,
      matched: pick.matched,
      latencyMs: pick.latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (isRoutingError(error)) {
      // Typed failures, never a silent fallback model.
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "NO_MODEL_FITS" ? 422 : 502 },
      );
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
