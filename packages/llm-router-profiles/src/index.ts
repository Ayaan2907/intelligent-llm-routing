/**
 * Public API of the LLM router core library.
 */

export {
  defineProfile,
  normalizeWeights,
  profileInputSchema,
  REASONING_MODES,
} from "./profile";
export type {
  ProfileConstraints,
  ProfileInput,
  ProfileWeights,
  ReasoningMode,
  RouterProfile,
} from "./profile";

export {
  BackendFailure,
  isRoutingError,
  ROUTING_ERROR_CODES,
  RoutingError,
} from "./errors";
export type { RoutingErrorCode } from "./errors";

export { createRouter } from "./router";
export type {
  CatalogConfig,
  ChatMeta,
  ChatResult,
  ChatUsage,
  Router,
  RouterConfig,
  SelectorConfig,
} from "./router";

export {
  createDeterministicBackend,
  normalizeMinMax,
  passesConstraints,
  scoreCandidates,
  totalCostPerMTok,
} from "./selector/deterministic";
export type { DeterministicExtras, ScoreOutcome } from "./selector/deterministic";
export { createOpenRouterAutoBackend, OPENROUTER_CHAT_URL } from "./selector/openrouter-auto";
export { createLlmBackend, shortlist } from "./selector/llm";
export type { LlmBackendConfig } from "./selector/llm";
export { runBackendChain } from "./selector/chain";
export type {
  BackendAttempt,
  NoFitDetails,
  Selection,
  SelectorBackend,
} from "./selector/types";

export {
  OPENROUTER_MODELS_URL,
  createCacheState,
  fetchCatalogSnapshot,
} from "./catalog/fetchCatalog";
export type { CacheState, FetchCatalogOptions } from "./catalog/fetchCatalog";
export {
  openRouterEntrySchema,
  openRouterResponseSchema,
  perTokenToPerMTok,
  toCatalogEntry,
} from "./catalog/schema";
export type {
  CatalogEntry,
  CatalogSnapshot,
  OpenRouterEntry,
} from "./catalog/schema";

export { computeCostUsd } from "./cost";
export type { CostBreakdown, UsageTokens } from "./cost";
