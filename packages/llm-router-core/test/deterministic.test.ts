import { describe, expect, it } from "vitest";
import catalogFixture from "./fixtures/catalog.json";
import { toCatalogEntry } from "../src/catalog/schema";
import type { CatalogEntry, CatalogSnapshot } from "../src/catalog/schema";
import { RoutingError } from "../src/errors";
import { defineProfile } from "../src/profile";
import {
  createDeterministicBackend,
  scoreCandidates,
  type DeterministicExtras,
} from "../src/selector/deterministic";

const NOW = Date.parse("2026-09-24T00:00:00Z");

function fixtureSnapshot(): CatalogSnapshot {
  const entries: CatalogEntry[] = [];
  for (const raw of catalogFixture.data) {
    const entry = toCatalogEntry(raw as never);
    if (entry) entries.push(entry);
  }
  expect(entries.length).toBe(6); // 7 fixture rows, 1 malformed dropped
  return {
    entries,
    source: "static",
    fetchedAt: NOW,
    stale: false,
    droppedEntries: 1,
  };
}

const cheapProfile = () =>
  defineProfile({
    name: "cheap",
    weights: { accuracy: 1, cost: 9, speed: 2 },
    constraints: { maxInputCostPerMTok: 5, minContext: 32_000 },
  });

describe("deterministic backend", () => {
  it("picks the cheapest eligible model under a cost-capped profile", async () => {
    const backend = createDeterministicBackend();
    const selection = await backend.select({
      prompt: "hello",
      profile: cheapProfile(),
      catalog: fixtureSnapshot(),
    });
    // space-bunny (free) and seed-2.0 (0.5/MTok in, capped at 5) survive;
    // gpt-5.5-pro and o1-pro blow the input cap, gpt-4 is deprecated,
    // gpt-4o-mini has unknown pricing under a price cap.
    expect(selection.model).toBe("stealth/space-bunny-alpha");
    expect(selection.backend).toBe("deterministic");
    expect(selection.matched.maxInputCostPerMTok).toBe(5);
    expect(selection.matched.minContext).toBe(32_000);
    expect(selection.candidates).toBe(2);
    expect(selection.why).toContain("unscored");
  });

  it("respects reasoning: always", async () => {
    const backend = createDeterministicBackend();
    const profile = defineProfile({
      name: "reasoner",
      weights: { accuracy: 1, cost: 1, speed: 1 },
      reasoning: "always",
    });
    const selection = await backend.select({
      prompt: "hello",
      profile,
      catalog: fixtureSnapshot(),
    });
    expect(selection.matched.reasoning).toBe("always");
    expect(selection.model).toBe("stealth/space-bunny-alpha"); // cheapest reasoner
  });

  it("fails typed when no model fits, naming the constraint filters", async () => {
    const backend = createDeterministicBackend();
    const profile = defineProfile({
      name: "impossible",
      weights: { accuracy: 1, cost: 1, speed: 1 },
      constraints: { minContext: 10_000_000 },
    });
    await expect(
      backend.select({ prompt: "hello", profile, catalog: fixtureSnapshot() }),
    ).rejects.toMatchObject({
      code: "NO_MODEL_FITS",
      details: expect.objectContaining({
        constraintFilters: expect.objectContaining({ removedContext: 6 }),
      }),
    });
  });
});

describe("scoreCandidates with signal providers", () => {
  const signals: DeterministicExtras = {
    accuracySignal: (e) =>
      e.id === "openai/gpt-5.5-pro" ? 10 : e.id === "openai/o1-pro" ? 3 : 1,
    speedSignal: (e) => (e.id === "openai/o1-pro" ? 5 : 1),
  };

  it("scores injected signal dimensions and reports none as unscored", () => {
    const profile = defineProfile({
      name: "smart",
      weights: { accuracy: 5, cost: 1, speed: 1 },
    });
    const outcome = scoreCandidates(fixtureSnapshot().entries, profile, signals);
    expect(outcome.ranked[0].entry.id).toBe("openai/gpt-5.5-pro");
    expect(outcome.unscoredDimensions).toEqual([]);
  });

  it("excludes unknown-pricing models while cost is weighted", () => {
    const profile = defineProfile({
      name: "cost-aware",
      weights: { accuracy: 1, cost: 1, speed: 1 },
    });
    const outcome = scoreCandidates(fixtureSnapshot().entries, profile);
    expect(outcome.droppedUnknownCost).toBe(1); // gpt-4o-mini
  });

  it("keeps unknown-pricing models when cost is unweighted", () => {
    const profile = defineProfile({
      name: "accuracy-only",
      weights: { accuracy: 1, cost: 0, speed: 0 },
      reasoning: "never",
    });
    const outcome = scoreCandidates(fixtureSnapshot().entries, profile, {
      accuracySignal: (e) => (e.supportsReasoning ? 10 : 1),
    });
    expect(outcome.ranked.map((r) => r.entry.id)).toContain("openai/gpt-4o-mini");
  });
});

describe("routing to dead models", () => {
  it("deterministic never returns a model outside the catalog", async () => {
    const backend = createDeterministicBackend();
    const snapshot = fixtureSnapshot();
    const selection = await backend.select({
      prompt: "hello",
      profile: cheapProfile(),
      catalog: snapshot,
    });
    expect(snapshot.entries.some((e) => e.id === selection.model)).toBe(true);
    // The class of bug that killed the old app:
    expect(selection.model).not.toContain("openai/gpt-4-1106-vision-preview");
  });
});

describe("chain failure typing", () => {
  it("propagates RoutingError from NO_MODEL_FITS rather than degrading", async () => {
    const backend = createDeterministicBackend();
    const profile = defineProfile({
      name: "impossible",
      weights: { accuracy: 1, cost: 1, speed: 1 },
      constraints: { minContext: 10_000_000 },
    });
    try {
      await backend.select({
        prompt: "hello",
        profile,
        catalog: fixtureSnapshot(),
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RoutingError);
    }
  });
});
