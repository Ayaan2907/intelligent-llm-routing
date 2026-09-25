import { z } from "zod";

/**
 * The portable preference profile: version-controllable JSON that expresses
 * accuracy/cost/speed trade-offs plus hard constraints. `defineProfile`
 * validates and normalizes; the same object shape round-trips through any
 * `RouterProfile` unchanged (idempotent).
 */

/** The three reasoning policies a profile can express. */
export const REASONING_MODES = ["never", "auto", "always"] as const;
export type ReasoningMode = (typeof REASONING_MODES)[number];

export interface ProfileConstraints {
  /** Maximum acceptable input price in USD per million tokens. */
  maxInputCostPerMTok?: number;
  /** Maximum acceptable output price in USD per million tokens. */
  maxOutputCostPerMTok?: number;
  /** Minimum acceptable context window in tokens. */
  minContext?: number;
}

/** Relative weights across the three trade-off dimensions; normalized to sum to 1. */
export interface ProfileWeights {
  accuracy: number;
  cost: number;
  speed: number;
}

const weightsInputSchema = z
  .object({
    accuracy: z.number().finite().min(0),
    cost: z.number().finite().min(0),
    speed: z.number().finite().min(0),
  })
  .strict()
  .refine((w) => w.accuracy + w.cost + w.speed > 0, {
    message:
      "Weights must sum to a non-zero value — at least one weight must be greater than 0",
  });

const constraintsSchema = z
  .object({
    maxInputCostPerMTok: z.number().finite().positive().optional(),
    maxOutputCostPerMTok: z.number().finite().positive().optional(),
    minContext: z.number().finite().int().positive().optional(),
  })
  .strict();

const tokenBudgetSchema = z
  .object({
    perRequest: z.number().finite().int().positive(),
  })
  .strict();

/**
 * The zod schema behind `defineProfile`. Exported so callers can reuse the
 * exact validation (e.g. form validation, JSON-schema generation).
 */
export const profileInputSchema = z
  .object({
    name: z.string().trim().min(1).max(64),
    weights: weightsInputSchema,
    constraints: constraintsSchema.optional(),
    tokenBudget: tokenBudgetSchema.optional(),
    reasoning: z.enum(REASONING_MODES).default("auto"),
  })
  .strict();

export type ProfileInput = z.input<typeof profileInputSchema>;

export interface RouterProfile {
  name: string;
  /** Normalized so the three weights sum to 1. */
  weights: ProfileWeights;
  constraints?: ProfileConstraints;
  tokenBudget?: { perRequest: number };
  reasoning: ReasoningMode;
}

/**
 * Normalize weights to sum to 1. Rounding is applied at 6 decimals and the
 * remainder is pushed onto the largest weight so the sum is exact.
 */
export function normalizeWeights(weights: ProfileWeights): ProfileWeights {
  const sum = weights.accuracy + weights.cost + weights.speed;
  const raw = {
    accuracy: weights.accuracy / sum,
    cost: weights.cost / sum,
    speed: weights.speed / sum,
  };
  const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
  const rounded = {
    accuracy: round6(raw.accuracy),
    cost: round6(raw.cost),
    speed: round6(raw.speed),
  };
  const drift = round6(1 - (rounded.accuracy + rounded.cost + rounded.speed));
  const largest = (Object.keys(rounded) as Array<keyof ProfileWeights>).reduce(
    (a, b) => (rounded[a] >= rounded[b] ? a : b),
  );
  rounded[largest] = round6(rounded[largest] + drift);
  return rounded;
}

/**
 * Validate and normalize a profile. Throws a zod error with precise paths
 * (e.g. `weights.cost`, `constraints.minContext`) for malformed input.
 */
export function defineProfile(input: ProfileInput | RouterProfile): RouterProfile {
  const parsed = profileInputSchema.parse(input);
  return {
    name: parsed.name,
    weights: normalizeWeights(parsed.weights),
    constraints: parsed.constraints,
    tokenBudget: parsed.tokenBudget,
    reasoning: parsed.reasoning,
  };
}
