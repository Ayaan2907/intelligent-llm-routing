/**
 * Typed routing failures. The library never falls back silently: every failure
 * path either returns a result with an explainable `why`, or throws a
 * `RoutingError` carrying a machine-readable code.
 */

/**
 * Machine-readable failure codes carried by `RoutingError`. Match on these,
 * never on message strings.
 */
export type RoutingErrorCode =
  | "CATALOG_UNAVAILABLE"
  | "NO_MODEL_FITS"
  | "ALL_BACKENDS_FAILED"
  | "MISSING_CREDENTIALS"
  | "UPSTREAM_ERROR"
  | "INVALID_RESPONSE"
  | "CONFIG_INVALID";

/** All error codes, for exhaustiveness checks and docs. */
export const ROUTING_ERROR_CODES: readonly RoutingErrorCode[] = [
  "CATALOG_UNAVAILABLE",
  "NO_MODEL_FITS",
  "ALL_BACKENDS_FAILED",
  "MISSING_CREDENTIALS",
  "UPSTREAM_ERROR",
  "INVALID_RESPONSE",
  "CONFIG_INVALID",
];

export class RoutingError extends Error {
  readonly code: RoutingErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: RoutingErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RoutingError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Thrown by a single selector backend to signal "I could not complete this
 * selection". The backend chain catches it, records the attempt, and moves on.
 */
export class BackendFailure extends Error {
  readonly code: RoutingErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: RoutingErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BackendFailure";
    this.code = code;
    this.details = details;
  }
}

export function isRoutingError(error: unknown): error is RoutingError {
  return error instanceof RoutingError;
}
