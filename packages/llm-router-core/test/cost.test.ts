import { describe, expect, it } from "vitest";
import { computeCostUsd } from "../src/cost";

const seedPricing = { inputCostPerMTok: 0.5, outputCostPerMTok: 3 };

describe("computeCostUsd", () => {
  it("computes input/output/total from per-MTok pricing and token counts", () => {
    const cost = computeCostUsd(
      { promptTokens: 1000, completionTokens: 2000, totalTokens: 3000 },
      seedPricing,
    );
    expect(cost?.input).toBeCloseTo(0.0005, 12);
    expect(cost?.output).toBeCloseTo(0.006, 12);
    expect(cost?.total).toBeCloseTo(0.0065, 12);
  });

  it("returns zeros — not null — for a free model", () => {
    const cost = computeCostUsd(
      { promptTokens: 1000, completionTokens: 2000, totalTokens: 3000 },
      { inputCostPerMTok: 0, outputCostPerMTok: 0 },
    );
    expect(cost).toEqual({ input: 0, output: 0, total: 0 });
  });

  it("returns null when either side of the pricing is unknown", () => {
    expect(
      computeCostUsd(
        { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        { inputCostPerMTok: null, outputCostPerMTok: 3 },
      ),
    ).toBeNull();
    expect(
      computeCostUsd({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }, null),
    ).toBeNull();
  });
});
