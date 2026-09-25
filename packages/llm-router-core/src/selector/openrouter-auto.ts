import { z } from "zod";
import { BackendFailure } from "../errors";
import { Selection, SelectorBackend } from "./types";

/**
 * Passthrough backend: delegates the pick to OpenRouter's own auto-router
 * (`openrouter/auto`). Requires an API key and consumes a completion to make
 * the pick — that cost is part of why deterministic runs first.
 */

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

const autoResponseSchema = z
  .object({ model: z.string().min(1) })
  .passthrough();

export interface OpenRouterAutoBackendConfig {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export function createOpenRouterAutoBackend(
  config: OpenRouterAutoBackendConfig = {},
): SelectorBackend {
  return {
    name: "openrouter-auto",
    async select({ prompt, catalog }) {
      const started = Date.now();
      if (!config.apiKey) {
        throw new BackendFailure(
          "MISSING_CREDENTIALS",
          "openrouter-auto backend requires an OpenRouter API key",
        );
      }

      const doFetch = config.fetchImpl ?? fetch;
      let res: Response;
      try {
        res = await doFetch(OPENROUTER_CHAT_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openrouter/auto",
            messages: [{ role: "user", content: prompt }],
          }),
        });
      } catch (err) {
        throw new BackendFailure(
          "UPSTREAM_ERROR",
          `openrouter-auto request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (!res.ok) {
        throw new BackendFailure(
          "UPSTREAM_ERROR",
          `openrouter-auto responded ${res.status}`,
          { status: res.status },
        );
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch (err) {
        throw new BackendFailure(
          "INVALID_RESPONSE",
          `openrouter-auto returned non-JSON body: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const parsed = autoResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new BackendFailure(
          "INVALID_RESPONSE",
          "openrouter-auto response did not name a routed model",
        );
      }

      // Membership is double-checked here AND enforced by the chain; this
      // half gives openrouter-auto its own precise error message.
      const entry = catalog.entries.find((e) => e.id === parsed.data.model);
      if (!entry) {
        throw new BackendFailure(
          "INVALID_RESPONSE",
          `openrouter-auto routed to "${parsed.data.model}", which is not in the live catalog`,
          { modelId: parsed.data.model },
        );
      }

      const selection: Selection = {
        model: entry.id,
        backend: "openrouter-auto",
        why: `openrouter-auto: delegated the pick to OpenRouter's auto-router, which selected ${entry.id} (profile constraints delegated, not enforced locally)`,
        matched: {},
        candidates: catalog.entries.length,
        latencyMs: Date.now() - started,
      };
      return selection;
    },
  };
}
