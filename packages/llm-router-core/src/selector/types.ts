import { ReasoningMode, RouterProfile } from "../profile";
import { CatalogEntry, CatalogSnapshot } from "../catalog/schema";

/**
 * A selection produced by a selector backend. Always explains itself: `why`
 * is a human-readable sentence, `matched` carries the satisfied constraints
 * as data, so every pick is reviewable after the fact.
 */
export interface Selection {
  model: string;
  backend: string;
  why: string;
  /** Constraints the pick satisfied, as data. */
  matched: {
    maxInputCostPerMTok?: number;
    maxOutputCostPerMTok?: number;
    minContext?: number;
    reasoning?: ReasoningMode;
  };
  /** Candidate count considered before picking. */
  candidates: number;
  /** Wall-clock duration of the selection step, in milliseconds. */
  latencyMs: number;
  /** Filled by the backend chain: every backend tried, in order. */
  attempts?: BackendAttempt[];
}

/** A single backend's attempt, recorded even when it fails. */
export interface BackendAttempt {
  backend: string;
  ok: boolean;
  error?: string;
}

/**
 * A pluggable selector backend. `select` must return a model id that exists
 * in the passed catalog snapshot — the chain enforces that membership check,
 * so no backend (including an LLM) can return a dead model id. Failures throw
 * BackendFailure and fall through to the next backend in the chain.
 */
export interface SelectorBackend {
  readonly name: string;
  select(input: {
    prompt: string;
    profile: RouterProfile;
    catalog: CatalogSnapshot;
  }): Promise<Selection>;
}

/** Typed breakdown of why no model fit, surfaced through RoutingError. */
export interface NoFitDetails {
  constraintFilters: {
    removedDeprecated: number;
    removedReasoning: number;
    removedContext: number;
    removedInputCost: number;
    removedOutputCost: number;
  };
  remaining: number;
}

export type { CatalogEntry, CatalogSnapshot, RouterProfile };
