import { z } from "zod";

/**
 * Catalog boundary. OpenRouter's public /api/v1/models response is validated
 * with zod at this edge; an entry that fails validation is DROPPED and counted,
 * never smuggled into the catalog unparsed. That kills the `[object Object]`
 * interpolation class and the dead-model-id class at the same boundary.
 */

export interface CatalogEntry {
  id: string;
  name: string;
  contextLength: number | null;
  /** USD per million input tokens; null when unknown. */
  inputCostPerMTok: number | null;
  /** USD per million output tokens; null when unknown. */
  outputCostPerMTok: number | null;
  supportsReasoning: boolean;
  inputModalities: string[];
  outputModalities: string[];
  /** True when the entry has an expiration date in the past. */
  deprecated: boolean;
  expiresAt: string | null;
}

export interface CatalogSnapshot {
  entries: CatalogEntry[];
  source: "openrouter" | "static";
  /** Epoch ms when this snapshot was fetched/constructed (`checkedAt`). */
  fetchedAt: number;
  /** True when served from cache past its TTL after a failed refresh. */
  stale: boolean;
  /** The refresh failure behind a stale snapshot, when one exists. */
  staleReason?: string | null;
  /** Count of raw entries rejected by schema validation. */
  droppedEntries: number;
}

export const openRouterResponseSchema = z.object({
  data: z.array(z.unknown()),
});

export const openRouterEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  context_length: z.number().positive().nullish(),
  pricing: z
    .object({
      prompt: z.string().optional(),
      completion: z.string().optional(),
    })
    .nullish(),
  architecture: z
    .object({
      input_modalities: z.array(z.string()).nullish(),
      output_modalities: z.array(z.string()).nullish(),
    })
    .nullish(),
  supported_parameters: z.array(z.string()).nullish(),
  expiration_date: z.string().nullish(),
});

export type OpenRouterEntry = z.infer<typeof openRouterEntrySchema>;

/**
 * OpenRouter prices are per-token USD strings ("0.000003"); "-1" means
 * unknown. Converts to USD per million tokens, or null when unknown.
 */
export function perTokenToPerMTok(price: string | undefined): number | null {
  if (!price) return null;
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return null;
  return n * 1_000_000;
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= Date.now();
}

export function toCatalogEntry(raw: unknown): CatalogEntry | null {
  const parsed = openRouterEntrySchema.safeParse(raw);
  if (!parsed.success) return null;
  const e = parsed.data;
  return {
    id: e.id,
    name: e.name,
    contextLength: e.context_length ?? null,
    inputCostPerMTok: perTokenToPerMTok(e.pricing?.prompt),
    outputCostPerMTok: perTokenToPerMTok(e.pricing?.completion),
    supportsReasoning: (e.supported_parameters ?? []).includes("reasoning"),
    inputModalities: e.architecture?.input_modalities ?? [],
    outputModalities: e.architecture?.output_modalities ?? [],
    deprecated: isExpired(e.expiration_date ?? null),
    expiresAt: e.expiration_date ?? null,
  };
}
