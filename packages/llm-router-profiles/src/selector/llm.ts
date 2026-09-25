import { z } from "zod";
import { BackendFailure } from "../errors";
import { RouterProfile } from "../profile";
import { CatalogEntry } from "../catalog/schema";
import { makeConstraintCounts, passesConstraints, totalCostPerMTok } from "./deterministic";
import { Selection, SelectorBackend } from "./types";

/**
 * LLM-as-selector backend: asks a model to pick from the live catalog subset
 * that satisfies the profile's hard constraints. Failure-typed end to end —
 * an LLM that hallucinates a model id is a BackendFailure, never a route.
 */

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_CANDIDATE_LIMIT = 40;

export interface LlmBackendConfig {
  /** Model used to make the pick — required; no rot-prone silent default. */
  selectorModel: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  /** Cap on candidates listed in the pick prompt (default 40, cheapest first). */
  candidateLimit?: number;
}

const llmReplySchema = z.object({
  model: z.string().min(1),
  reason: z.string().min(1),
});

const completionSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z.object({ content: z.string().nullable() }).passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

export function createLlmBackend(config: LlmBackendConfig): SelectorBackend {
  if (!config.selectorModel) {
    throw new BackendFailure(
      "CONFIG_INVALID",
      "createLlmBackend requires a selectorModel (the model that makes the pick)",
    );
  }
  return {
    name: "llm",
    async select({ prompt, profile, catalog }) {
      const started = Date.now();
      if (!config.apiKey) {
        throw new BackendFailure(
          "MISSING_CREDENTIALS",
          "llm selector backend requires an API key",
        );
      }

      const candidates = shortlist(catalog.entries, profile, config.candidateLimit);
      if (candidates.length === 0) {
        throw new BackendFailure(
          "NO_MODEL_FITS",
          `No live model satisfies profile "${profile.name}" constraints for the llm selector`,
        );
      }

      const content = await requestPick(config, prompt, profile, candidates);
      const parsed = llmReplySchema.safeParse(content);
      if (!parsed.success) {
        throw new BackendFailure(
          "INVALID_RESPONSE",
          `llm selector reply was not { model, reason }: ${parsed.error.message}`,
        );
      }

      // Validate against the SHORTLIST, not the full catalog: a model that
      // exists but violates the profile's hard constraints is not a route.
      const inCatalog = catalog.entries.some(
        (e) => e.id === parsed.data.model,
      );
      const picked = candidates.find((e) => e.id === parsed.data.model);
      if (!picked) {
        throw new BackendFailure(
          "INVALID_RESPONSE",
          inCatalog
            ? `llm selector chose "${parsed.data.model}", which is in the catalog but fails the profile's hard constraints (absent from the ${candidates.length}-model shortlist)`
            : `llm selector chose "${parsed.data.model}", which is not in the live catalog`,
          { modelId: parsed.data.model },
        );
      }

      const selection: Selection = {
        model: picked.id,
        backend: "llm",
        why: `llm (${config.selectorModel}): ${parsed.data.reason}`,
        matched: {
          maxInputCostPerMTok: profile.constraints?.maxInputCostPerMTok,
          maxOutputCostPerMTok: profile.constraints?.maxOutputCostPerMTok,
          minContext: profile.constraints?.minContext,
          reasoning: profile.reasoning,
        },
        candidates: candidates.length,
        latencyMs: Date.now() - started,
      };
      return selection;
    },
  };
}

/** Cheapest-first shortlist of constraint-satisfying, non-deprecated entries. */
export function shortlist(
  entries: CatalogEntry[],
  profile: RouterProfile,
  limit: number = DEFAULT_CANDIDATE_LIMIT,
): CatalogEntry[] {
  return entries
    .filter(
      (e) =>
        !e.deprecated &&
        totalCostPerMTok(e) != null &&
        passesConstraints(e, profile, makeConstraintCounts()),
    )
    .sort(
      (a, b) => (totalCostPerMTok(a) as number) - (totalCostPerMTok(b) as number),
    )
    .slice(0, limit);
}

function stripFences(text: string): string {
  return text.replace(/```json\n?|\n?```/g, "").trim();
}

async function requestPick(
  config: LlmBackendConfig,
  prompt: string,
  profile: RouterProfile,
  candidates: CatalogEntry[],
): Promise<unknown> {
  const listing = candidates
    .map(
      (c) =>
        `- ${c.id} | context ${c.contextLength ?? "unknown"} | $${c.inputCostPerMTok?.toFixed(2)}/$${c.outputCostPerMTok?.toFixed(2)} per MTok | reasoning: ${c.supportsReasoning}`,
    )
    .join("\n");
  const system = [
    "You select the best LLM for a user prompt from a fixed list of live models.",
    'Reply with ONLY a JSON object: {"model": "<id from the list>", "reason": "<one sentence>"}',
    "Never invent a model id that is not in the list.",
    `Preference profile "${profile.name}": accuracy weight ${profile.weights.accuracy}, cost weight ${profile.weights.cost}, speed weight ${profile.weights.speed}, reasoning ${profile.reasoning}.`,
  ].join("\n");
  const user = `<models>\n${listing}\n</models>\n\n<prompt>\n${prompt}\n</prompt>`;

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
        model: config.selectorModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    throw new BackendFailure(
      "UPSTREAM_ERROR",
      `llm selector request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new BackendFailure(
      "UPSTREAM_ERROR",
      `llm selector responded ${res.status}`,
      { status: res.status },
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new BackendFailure(
      "INVALID_RESPONSE",
      `llm selector returned non-JSON body: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const completion = completionSchema.safeParse(json);
  if (!completion.success) {
    throw new BackendFailure(
      "INVALID_RESPONSE",
      `llm selector completion shape invalid: ${completion.error.message}`,
    );
  }
  const raw = completion.data.choices[0].message.content;
  if (raw == null) {
    throw new BackendFailure(
      "INVALID_RESPONSE",
      "llm selector returned an empty completion",
    );
  }

  try {
    return JSON.parse(stripFences(raw));
  } catch (err) {
    throw new BackendFailure(
      "INVALID_RESPONSE",
      `llm selector reply was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
