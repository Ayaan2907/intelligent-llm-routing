import { RoutingError } from "../errors";
import { ReasoningMode, RouterProfile } from "../profile";
import { CatalogEntry, CatalogSnapshot } from "../catalog/schema";
import { NoFitDetails, Selection, SelectorBackend } from "./types";

/**
 * Deterministic-first selector: millisecond latency, zero network, explainable.
 *
 * Hard constraints filter first (deprecated, reasoning policy, context floor,
 * price caps). Survivors are ranked by weighted score. The only live signal
 * OpenRouter's public catalog exposes is price, so `cost` is scored from real
 * pricing; `accuracy` and `speed` have no catalog data. Rather than fabricate
 * numbers, those dimensions are reported as unscored in `why` — or scored when
 * the caller injects signal providers (e.g. their own latency benchmarks).
 */

export interface DeterministicExtras {
  /** Signal provider for accuracy; returns a raw value or null when unknown. */
  accuracySignal?: (entry: CatalogEntry) => number | null;
  /** Signal provider for speed; returns a raw value or null when unknown. */
  speedSignal?: (entry: CatalogEntry) => number | null;
}

type ConstraintCounts = NoFitDetails["constraintFilters"];

export function makeConstraintCounts(): ConstraintCounts {
  return {
    removedDeprecated: 0,
    removedReasoning: 0,
    removedContext: 0,
    removedInputCost: 0,
    removedOutputCost: 0,
  };
}

export function passesConstraints(
  entry: CatalogEntry,
  profile: RouterProfile,
  counts: ConstraintCounts = makeConstraintCounts(),
): boolean {
  // Constraint order is the reported order: each model is removed by the
  // first constraint it fails, and the context floor is evaluated before the
  // deprecated flag so a minContext profile names every model it excludes.
  if (
    profile.constraints?.minContext != null &&
    (entry.contextLength == null ||
      entry.contextLength < profile.constraints.minContext)
  ) {
    counts.removedContext += 1;
    return false;
  }
  if (profile.reasoning === "always" && !entry.supportsReasoning) {
    counts.removedReasoning += 1;
    return false;
  }
  if (entry.deprecated) {
    counts.removedDeprecated += 1;
    return false;
  }
  if (
    profile.constraints?.maxInputCostPerMTok != null &&
    (entry.inputCostPerMTok == null ||
      entry.inputCostPerMTok > profile.constraints.maxInputCostPerMTok)
  ) {
    counts.removedInputCost += 1;
    return false;
  }
  if (
    profile.constraints?.maxOutputCostPerMTok != null &&
    (entry.outputCostPerMTok == null ||
      entry.outputCostPerMTok > profile.constraints.maxOutputCostPerMTok)
  ) {
    counts.removedOutputCost += 1;
    return false;
  }
  return true;
}

/** Combined input+output price in USD per million tokens, or null when either side is unknown. */
export function totalCostPerMTok(entry: CatalogEntry): number | null {
  if (entry.inputCostPerMTok == null || entry.outputCostPerMTok == null) return null;
  return entry.inputCostPerMTok + entry.outputCostPerMTok;
}

/** Normalize values into [0,1] (min-max). All-equal → all 0.5. */
export function normalizeMinMax(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

export interface ScoreOutcome {
  ranked: Array<{ entry: CatalogEntry; score: number }>;
  /** Dimensions the profile weights but that had no data — reported, not guessed. */
  unscoredDimensions: string[];
  /** Candidates excluded because their price is unknown while cost is weighted. */
  droppedUnknownCost: number;
}

/**
 * Rank candidates against a profile. Pure: same input, same order, every time.
 * A candidate with unknown pricing is excluded while cost carries weight —
 * an unrankable model must not sit silently inside a cost ranking.
 */
export function scoreCandidates(
  candidates: CatalogEntry[],
  profile: RouterProfile,
  extras: DeterministicExtras = {},
): ScoreOutcome {
  const costWeighted = profile.weights.cost > 0;
  const scorable = costWeighted
    ? candidates.filter((c) => totalCostPerMTok(c) != null)
    : candidates;
  const droppedUnknownCost = candidates.length - scorable.length;

  const unscoredDimensions: string[] = [];
  if (costWeighted && scorable.length === 0) {
    // Nothing rankable: caller sees NO_MODEL_FITS from the backend, but keep
    // the outcome well-formed for direct scoreCandidates users.
    return { ranked: [], unscoredDimensions: ["cost"], droppedUnknownCost };
  }

  // Cost is always fully known within `scorable`; signals are active only if
  // they resolve for every scorable candidate (all-or-nothing per dimension).
  const accVals = extras.accuracySignal
    ? scorable.map((c) => extras.accuracySignal?.(c) ?? null)
    : null;
  const speedVals = extras.speedSignal
    ? scorable.map((c) => extras.speedSignal?.(c) ?? null)
    : null;
  const accActive = accVals != null && accVals.every((v) => v != null);
  const speedActive = speedVals != null && speedVals.every((v) => v != null);
  if (profile.weights.accuracy > 0 && !accActive) {
    unscoredDimensions.push("accuracy");
  }
  if (profile.weights.speed > 0 && !speedActive) {
    unscoredDimensions.push("speed");
  }
  if (!costWeighted) {
    unscoredDimensions.push("cost");
  }

  const w = profile.weights;
  const activeWeights = [
    costWeighted ? w.cost : null,
    accActive ? w.accuracy : null,
    speedActive ? w.speed : null,
  ].filter((v): v is number => v != null);
  const activeSum = activeWeights.reduce((a, b) => a + b, 0);

  if (activeSum === 0) {
    // Degenerate (e.g. zero-weight cost + no usable signals): keep the output
    // deterministic and finite — rank by known cost, then id.
    const ranked = [...scorable]
      .sort(
        (a, b) =>
          (totalCostPerMTok(a) ?? Number.POSITIVE_INFINITY) -
            (totalCostPerMTok(b) ?? Number.POSITIVE_INFINITY) ||
          a.id.localeCompare(b.id),
      )
      .map((entry) => ({ entry, score: 0 }));
    return { ranked, unscoredDimensions, droppedUnknownCost };
  }

  const costNorm = costWeighted
    ? normalizeMinMax(scorable.map((c) => totalCostPerMTok(c) as number))
    : [];
  const accNorm = accActive ? normalizeMinMax(accVals as number[]) : [];
  const speedNorm = speedActive ? normalizeMinMax(speedVals as number[]) : [];

  const ranked = scorable
    .map((entry, i) => {
      // Lower cost is better — invert the min-max normalization so the
      // cheapest model scores highest under a cost-heavy profile.
      const costPart = costWeighted ? ((1 - costNorm[i]) * w.cost) / activeSum : 0;
      const accPart = accActive ? (accNorm[i] * w.accuracy) / activeSum : 0;
      const speedPart = speedActive ? (speedNorm[i] * w.speed) / activeSum : 0;
      return { entry, score: costPart + accPart + speedPart };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (totalCostPerMTok(a.entry) ?? Number.POSITIVE_INFINITY) -
          (totalCostPerMTok(b.entry) ?? Number.POSITIVE_INFINITY) ||
        a.entry.id.localeCompare(b.entry.id),
    );

  return { ranked, unscoredDimensions, droppedUnknownCost };
}

export function describeWhy(
  profile: RouterProfile,
  winner: CatalogEntry,
  totalCatalog: number,
  eligible: number,
  outcome: ScoreOutcome,
  hadSignals: boolean,
): string {
  const parts: string[] = [];
  const cost = totalCostPerMTok(winner);
  if (cost != null) {
    parts.push(
      `cost $${winner.inputCostPerMTok?.toFixed(2)}/$${winner.outputCostPerMTok?.toFixed(2)} per MTok (cost weight ${profile.weights.cost.toFixed(2)})`,
    );
  }
  if (profile.constraints?.minContext != null && winner.contextLength != null) {
    parts.push(
      `context ${(winner.contextLength / 1000).toFixed(0)}k >= min ${(profile.constraints.minContext / 1000).toFixed(0)}k`,
    );
  }
  if (profile.reasoning !== "never") {
    parts.push(`reasoning: ${profile.reasoning}`);
  }
  if (outcome.unscoredDimensions.length > 0) {
    parts.push(
      `unscored (no live signal): ${outcome.unscoredDimensions.map((d) => `${d} @ weight ${profile.weights[d as "accuracy" | "cost" | "speed"].toFixed(2)}`).join(", ")}`,
    );
  }
  if (hadSignals) {
    parts.push("caller-supplied signals applied");
  }
  return `deterministic: best weighted fit for profile "${profile.name}" over ${eligible}/${totalCatalog} live candidates — ${parts.join("; ")}`;
}

export function createDeterministicBackend(
  extras: DeterministicExtras = {},
): SelectorBackend {
  return {
    name: "deterministic",
    async select({ profile, catalog }) {
      const started = Date.now();
      const counts = makeConstraintCounts();
      const eligible = catalog.entries.filter((e) =>
        passesConstraints(e, profile, counts),
      );

      if (eligible.length === 0) {
        // Terminal, user-facing failure: no backend can conjure candidates
        // for the same constraints, so surface RoutingError directly.
        throw new RoutingError(
          "NO_MODEL_FITS",
          `No live model satisfies profile "${profile.name}" constraints`,
          {
            constraintFilters: counts,
            remaining: 0,
          } satisfies NoFitDetails,
        );
      }

      const outcome = scoreCandidates(eligible, profile, extras);
      if (outcome.ranked.length === 0) {
        throw new RoutingError(
          "NO_MODEL_FITS",
          `All ${eligible.length} candidates for profile "${profile.name}" have unknown pricing while cost is weighted`,
          { constraintFilters: counts, remaining: 0 } satisfies NoFitDetails,
        );
      }

      const winner = outcome.ranked[0].entry;
      const selection: Selection = {
        model: winner.id,
        backend: "deterministic",
        why: describeWhy(
          profile,
          winner,
          catalog.entries.length,
          eligible.length,
          outcome,
          extras.accuracySignal != null || extras.speedSignal != null,
        ),
        matched: {
          maxInputCostPerMTok: profile.constraints?.maxInputCostPerMTok,
          maxOutputCostPerMTok: profile.constraints?.maxOutputCostPerMTok,
          minContext: profile.constraints?.minContext,
          reasoning: profile.reasoning as ReasoningMode,
        },
        candidates: eligible.length,
        latencyMs: Date.now() - started,
      };
      return selection;
    },
  };
}
