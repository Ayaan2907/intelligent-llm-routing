import { z } from "zod";
import { RoutingError } from "./errors";
import { defineProfile, ProfileInput, RouterProfile } from "./profile";
import {
  CatalogSnapshot,
} from "./catalog/schema";
import {
  createCacheState,
  fetchCatalogSnapshot,
} from "./catalog/fetchCatalog";
import { computeCostUsd, UsageTokens } from "./cost";
import { createDeterministicBackend } from "./selector/deterministic";
import { createOpenRouterAutoBackend } from "./selector/openrouter-auto";
import { createLlmBackend } from "./selector/llm";
import { runBackendChain } from "./selector/chain";
import { BackendAttempt, Selection, SelectorBackend } from "./selector/types";

/**
 * `createRouter` — the library entry point.
 *
 * Zero-config is a first-class mode: with no `apiKey`, catalog sync (public
 * endpoint) and deterministic selection both work; `chat()` fails with a typed
 * RoutingError instead of pretending. Nothing here reads `process.env` — the
 * caller passes credentials explicitly, so importing with zero env vars never
 * crashes.
 */

export type CatalogConfig =
  | { source: "openrouter"; ttlMinutes?: number }
  | { entries: CatalogSnapshot["entries"] };

export type SelectorConfig = ReadonlyArray<"deterministic" | "openrouter-auto" | "llm" | SelectorBackend>;

export interface RouterConfig {
  catalog?: CatalogConfig;
  /** Ordered fallback chain; default `["deterministic"]`. */
  selector?: SelectorConfig;
  /** Optional — required only for chat() and keyed selector backends. */
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatMeta {
  usage: ChatUsage | null;
  costUsd: { input: number; output: number; total: number } | null;
  provenance: {
    model: string;
    /** Which selector backend picked it, or "caller" when passed explicitly. */
    selectedBy: string | null;
    catalogCheckedAt: string | null;
    catalogStale: boolean | null;
    /** Why cost is null, when it is. */
    costNote: string | null;
  };
}

export interface ChatResult {
  text: string;
  model: string;
  meta: ChatMeta;
}

export interface Router {
  select(
    prompt: string,
    profile: ProfileInput | RouterProfile,
  ): Promise<Selection>;
  chat(
    prompt: string,
    profile: ProfileInput | RouterProfile,
    opts?: { model?: string },
  ): Promise<ChatResult>;
  /** Current catalog snapshot, fetching/refreshing per the configured TTL. */
  catalog(): Promise<CatalogSnapshot>;
}

const completionResponseSchema = z
  .object({
    model: z.string().optional(),
    choices: z
      .array(
        z
          .object({
            message: z.object({ content: z.string().nullable() }).passthrough(),
          })
          .passthrough(),
      )
      .min(1),
    usage: z
      .object({
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
        total_tokens: z.number(),
      })
      .optional(),
  })
  .passthrough();

export function createRouter(config: RouterConfig = {}): Router {
  const catalogConfig: CatalogConfig = config.catalog ?? { source: "openrouter" };
  const ttlMinutes =
    "source" in catalogConfig ? catalogConfig.ttlMinutes : undefined;

  const backends = buildBackends(config);
  const cache = createCacheState();

  async function ensureCatalog(): Promise<CatalogSnapshot> {
    if ("entries" in catalogConfig) {
      // Static catalog (demo mode, tests): no network, no TTL — the entries
      // are the source of truth exactly as passed.
      return {
        entries: catalogConfig.entries,
        source: "static",
        fetchedAt: Date.now(),
        stale: false,
        droppedEntries: 0,
      };
    }
    return fetchCatalogSnapshot(cache, {
      ttlMinutes,
      fetchImpl: config.fetchImpl,
    });
  }

  async function normalizeProfile(
    profile: ProfileInput | RouterProfile,
  ): Promise<RouterProfile> {
    return defineProfile(profile);
  }

  return {
    async select(prompt, profileInput) {
      const profile = await normalizeProfile(profileInput);
      const catalog = await ensureCatalog();
      return runBackendChain(backends, { prompt, profile, catalog });
    },

    async chat(prompt, profileInput, opts = {}) {
      const profile = await normalizeProfile(profileInput);
      const started = Date.now();

      let selectedBy: string | null = null;
      let attempts: BackendAttempt[] | undefined;
      if (!config.apiKey) {
        // Typed, not silent: selection works demo-mode, completions do not.
        throw new RoutingError(
          "MISSING_CREDENTIALS",
          "chat() requires an OpenRouter API key — pass apiKey in createRouter. Selection works without one.",
        );
      }
      let model = opts.model;
      if (model) {
        selectedBy = "caller";
      } else {
        const selection = await this.select(prompt, profile);
        model = selection.model;
        selectedBy = selection.backend;
        attempts = selection.attempts;
      }

      // Pricing from the live catalog when reachable; when it is not, cost is
      // null with a note — never a stale-price guess.
      let snapshot: CatalogSnapshot | null = null;
      let costNote: string | null = null;
      try {
        snapshot = await ensureCatalog();
      } catch (err) {
        costNote = `catalog unavailable for pricing: ${err instanceof Error ? err.message : String(err)}`;
      }

      const doFetch = config.fetchImpl ?? fetch;
      let res: Response;
      try {
        res = await doFetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
          }),
        });
      } catch (err) {
        throw new RoutingError(
          "UPSTREAM_ERROR",
          `chat completion request failed: ${err instanceof Error ? err.message : String(err)}`,
          { model, attempts },
        );
      }
      if (!res.ok) {
        throw new RoutingError(
          "UPSTREAM_ERROR",
          `chat completion responded ${res.status}`,
          { model, status: res.status, attempts },
        );
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch (err) {
        throw new RoutingError(
          "INVALID_RESPONSE",
          `chat completion returned non-JSON body: ${err instanceof Error ? err.message : String(err)}`,
          { model },
        );
      }
      const parsed = completionResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new RoutingError(
          "INVALID_RESPONSE",
          `chat completion shape invalid: ${parsed.error.message}`,
          { model },
        );
      }
      const content = parsed.data.choices[0].message.content;
      if (content == null) {
        throw new RoutingError(
          "INVALID_RESPONSE",
          "chat completion returned empty content",
          { model },
        );
      }

      const usage: UsageTokens | null = parsed.data.usage
        ? {
            promptTokens: parsed.data.usage.prompt_tokens,
            completionTokens: parsed.data.usage.completion_tokens,
            totalTokens: parsed.data.usage.total_tokens,
          }
        : null;
      const entry = snapshot?.entries.find((e) => e.id === model) ?? null;
      const costUsd =
        usage != null ? computeCostUsd(usage, entry) : null;
      if (costUsd == null && costNote == null && usage != null) {
        costNote = entry
          ? "model found but catalog pricing incomplete"
          : "model not found in catalog";
      }

      return {
        text: content,
        // The routed pick is the result's model; an upstream alias/echo is
        // provenance, never an override of the routing decision.
        model,
        meta: {
          usage,
          costUsd,
          provenance: {
            model: parsed.data.model ?? model,
            selectedBy,
            catalogCheckedAt: snapshot
              ? new Date(snapshot.fetchedAt).toISOString()
              : null,
            catalogStale: snapshot ? snapshot.stale : null,
            costNote,
          },
        },
      };
    },

    catalog() {
      return ensureCatalog();
    },
  };
}

function buildBackends(config: RouterConfig): SelectorBackend[] {
  const selector = config.selector ?? ["deterministic"];
  const apiKey = config.apiKey;

  return selector.map((entry) => {
    if (typeof entry !== "string") return entry;
    switch (entry) {
      case "deterministic":
        return createDeterministicBackend();
      case "openrouter-auto":
        return createOpenRouterAutoBackend({ apiKey, fetchImpl: config.fetchImpl });
      case "llm":
        // No silent default selector model — a hardcoded default would rot
        // exactly like the old catalog did. Pass a configured backend instead:
        // createRouter({ selector: [createLlmBackend({ selectorModel, apiKey })] })
        throw new RoutingError(
          "CONFIG_INVALID",
          'selector "llm" requires configuration — pass createLlmBackend({ selectorModel, apiKey }) as a backend instance instead of the "llm" string',
        );
      default: {
        const exhaustive: never = entry;
        throw new RoutingError(
          "CONFIG_INVALID",
          `unknown selector backend: ${String(exhaustive)}`,
        );
      }
    }
  });
}
