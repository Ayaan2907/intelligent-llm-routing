import { CatalogEntry } from "./catalog/schema";

/**
 * Pure cost math. Prices in the catalog are USD per million tokens; completions
 * report token counts. Returns null (not a guess) when either side is unknown
 * so callers can report "cost unavailable" honestly.
 */

export interface UsageTokens {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostBreakdown {
  input: number;
  output: number;
  total: number;
}

export function computeCostUsd(
  usage: UsageTokens,
  entry: Pick<CatalogEntry, "inputCostPerMTok" | "outputCostPerMTok"> | null,
): CostBreakdown | null {
  if (!entry) return null;
  if (entry.inputCostPerMTok == null || entry.outputCostPerMTok == null) {
    return null;
  }
  const input = (usage.promptTokens * entry.inputCostPerMTok) / 1_000_000;
  const output = (usage.completionTokens * entry.outputCostPerMTok) / 1_000_000;
  return { input, output, total: input + output };
}
