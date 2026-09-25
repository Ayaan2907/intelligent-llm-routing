import { describe, expect, it } from "vitest";
import { defineProfile, normalizeWeights } from "../src/profile";

describe("defineProfile", () => {
  it("normalizes weights to sum to 1 and preserves the raw input shape", () => {
    const raw = {
      name: "  cheap-fast  ",
      weights: { accuracy: 0.2, cost: 0.6, speed: 0.2 },
    };
    const profile = defineProfile(raw);
    expect(profile.name).toBe("cheap-fast");
    const sum =
      profile.weights.accuracy + profile.weights.cost + profile.weights.speed;
    expect(sum).toBeCloseTo(1, 10);
    expect(profile.weights).toEqual(raw.weights);
  });

  it("is idempotent on already-normalized weights", () => {
    const input = {
      name: "even",
      weights: { accuracy: 1 / 3, cost: 1 / 3, speed: 1 / 3 },
    };
    const a = defineProfile(input);
    const b = defineProfile(a);
    expect(b.weights).toEqual(a.weights);
  });

  it("rejects zero-sum weights", () => {
    expect(() =>
      defineProfile({
        name: "flat",
        weights: { accuracy: 0, cost: 0, speed: 0 },
      }),
    ).toThrow(/non-zero/);
  });

  it("rejects negative weights", () => {
    expect(() =>
      defineProfile({
        name: "neg",
        weights: { accuracy: -1, cost: 1, speed: 1 },
      }),
    ).toThrow();
  });

  it("rejects extra dimensions so the score stays comparable across profiles", () => {
    expect(() =>
      defineProfile({
        name: "four-dims",
        weights: { accuracy: 1, cost: 1, speed: 1, style: 1 },
      } as never),
    ).toThrow();
  });

  it("rejects NaN weights", () => {
    expect(() =>
      defineProfile({
        name: "nan",
        weights: { accuracy: Number.NaN, cost: 1, speed: 1 },
      }),
    ).toThrow();
  });

  it("rejects an invalid reasoning mode with a precise error", () => {
    try {
      defineProfile({
        name: "bad-reasoning",
        weights: { accuracy: 1, cost: 1, speed: 1 },
        reasoning: "sometimes",
      } as never);
      expect.unreachable("expected a ZodError");
    } catch (err) {
      expect((err as Error).message).toContain("never");
      expect((err as Error).message).toContain("auto");
      expect((err as Error).message).toContain("always");
    }
  });

  it("accepts constraints and rejects negative ones", () => {
    const profile = defineProfile({
      name: "constrained",
      weights: { accuracy: 1, cost: 1, speed: 1 },
      constraints: { maxInputCostPerMTok: 0.3, minContext: 32_000 },
    });
    expect(profile.constraints?.maxInputCostPerMTok).toBe(0.3);
    expect(profile.constraints?.minContext).toBe(32_000);

    expect(() =>
      defineProfile({
        name: "bad-constraint",
        weights: { accuracy: 1, cost: 1, speed: 1 },
        constraints: { minContext: -1 },
      }),
    ).toThrow();
  });

  it("rejects an empty name", () => {
    expect(() =>
      defineProfile({
        name: "   ",
        weights: { accuracy: 1, cost: 1, speed: 1 },
      }),
    ).toThrow();
  });
});

describe("normalizeWeights", () => {
  it("scales proportionally", () => {
    const out = normalizeWeights({ accuracy: 1, cost: 3, speed: 0 });
    expect(out.accuracy).toBeCloseTo(0.25, 10);
    expect(out.cost).toBeCloseTo(0.75, 10);
    expect(out.speed).toBe(0);
  });
});
