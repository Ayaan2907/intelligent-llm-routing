import { RoutingError } from "../errors";
import {
  CatalogEntry,
  CatalogSnapshot,
  openRouterResponseSchema,
  toCatalogEntry,
} from "./schema";

/**
 * Live catalog sync with a TTL cache. The cache state is passed in (not held
 * in module scope) so routers own their cache and tests stay honest.
 *
 * Staleness is data, not a crash: when a refresh fails but a previous
 * snapshot exists, the stale snapshot is served with `stale: true`. A failed
 * refresh with no snapshot throws a typed RoutingError — never a silent
 * fallback.
 */

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export interface CacheState {
  snapshot: CatalogSnapshot | null;
}

export interface FetchCatalogOptions {
  /** Cache TTL in minutes (default 60). */
  ttlMinutes?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function createCacheState(): CacheState {
  return { snapshot: null };
}

export async function fetchCatalogSnapshot(
  cache: CacheState,
  opts: FetchCatalogOptions = {},
): Promise<CatalogSnapshot> {
  const ttlMs = (opts.ttlMinutes ?? 60) * 60_000;
  const now = opts.now ?? Date.now;
  const cached = cache.snapshot;

  if (cached && now() - cached.fetchedAt < ttlMs) {
    return cached;
  }

  try {
    const doFetch = opts.fetchImpl ?? fetch;
    const res = await doFetch(OPENROUTER_MODELS_URL, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new RoutingError(
        "CATALOG_UNAVAILABLE",
        `OpenRouter catalog responded ${res.status}`,
        { status: res.status },
      );
    }
    const json: unknown = await res.json();
    const envelope = openRouterResponseSchema.parse(json);

    const entries: CatalogEntry[] = [];
    let dropped = 0;
    for (const raw of envelope.data) {
      const entry = toCatalogEntry(raw);
      if (entry) entries.push(entry);
      else dropped += 1;
    }

    const snapshot: CatalogSnapshot = {
      entries,
      source: "openrouter",
      fetchedAt: now(),
      stale: false,
      droppedEntries: dropped,
    };
    cache.snapshot = snapshot;
    return snapshot;
  } catch (err) {
    if (cached) {
      // Staleness is data, not a crash: report WHY the snapshot is stale.
      return {
        ...cached,
        stale: true,
        staleReason: err instanceof Error ? err.message : String(err),
      };
    }
    if (err instanceof RoutingError) throw err;
    throw new RoutingError(
      "CATALOG_UNAVAILABLE",
      "Failed to fetch OpenRouter catalog",
      { cause: err instanceof Error ? err.message : String(err) },
    );
  }
}
