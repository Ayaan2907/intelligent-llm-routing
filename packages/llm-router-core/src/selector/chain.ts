import { BackendFailure, RoutingError } from "../errors";
import { RouterProfile } from "../profile";
import { CatalogSnapshot } from "../catalog/schema";
import { BackendAttempt, Selection, SelectorBackend } from "./types";

/**
 * Ordered fallback chain. A backend's failure is recorded and the next backend
 * runs — that is EXPLICIT fallback, visible in the result's `attempts`. When
 * every backend fails, the caller gets a typed RoutingError, never a degraded
 * success with an unexplained model.
 *
 * Every winning pick is validated against the catalog snapshot before
 * returning: no backend, LLM or otherwise, can route to a model id the
 * catalog does not contain.
 */

export async function runBackendChain(
  backends: readonly SelectorBackend[],
  input: { prompt: string; profile: RouterProfile; catalog: CatalogSnapshot },
): Promise<Selection & { attempts: BackendAttempt[] }> {
  const attempts: BackendAttempt[] = [];

  for (const backend of backends) {
    try {
      const selection = await backend.select(input);
      assertInCatalog(selection.model, input.catalog, backend.name);
      attempts.push({ backend: backend.name, ok: true });
      return { ...selection, attempts };
    } catch (err) {
      const code =
        err instanceof BackendFailure || err instanceof RoutingError
          ? err.code
          : "UPSTREAM_ERROR";
      const message = err instanceof Error ? err.message : String(err);
      attempts.push({
        backend: backend.name,
        ok: false,
        error: `${code}: ${message}`,
      });
    }
  }

  throw new RoutingError(
    "ALL_BACKENDS_FAILED",
    `All ${backends.length} selector backends failed for profile "${input.profile.name}"`,
    { attempts },
  );
}

function assertInCatalog(
  modelId: string,
  catalog: CatalogSnapshot,
  backendName: string,
): void {
  if (!catalog.entries.some((e) => e.id === modelId)) {
    throw new RoutingError(
      "INVALID_RESPONSE",
      `backend "${backendName}" returned "${modelId}", which is not in the ${catalog.stale ? "stale " : ""}catalog snapshot (source: ${catalog.source}, checked at ${new Date(catalog.fetchedAt).toISOString()})`,
      { modelId },
    );
  }
}
