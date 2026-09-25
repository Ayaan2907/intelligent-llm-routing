import { describe, expect, it } from "vitest";
import catalogFixture from "./fixtures/catalog.json";
import { createRouter } from "../src/router";

/**
 * Live integration test — the spec's "select only returns live models"
 * criterion against the real OpenRouter catalog, plus the drift gate aimed at
 * ourselves: every fixture model id must exist in the live catalog.
 *
 * Opt-in (RUN_LIVE_TESTS=1) so CI runs hermetic on fixtures; run before
 * publishing or whenever the catalog is suspected of drifting.
 */

const runLive = process.env.RUN_LIVE_TESTS === "1";

const fixtureIds = catalogFixture.data
  .map((e) =>
    typeof e === "object" && e !== null && "id" in e
      ? (e as { id: string }).id
      : null,
  )
  .filter((id): id is string => id != null);

describe("fixture sanity (always on)", () => {
  it("has the ids the drift gate checks", () => {
    expect(fixtureIds.length).toBeGreaterThanOrEqual(6);
    expect(fixtureIds).toContain("stealth/space-bunny-alpha");
    expect(fixtureIds).toContain("openai/gpt-5.5-pro");
  });
});

describe.skipIf(!runLive)("live OpenRouter catalog", () => {
  it(
    "fixture model ids all exist in the live catalog (drift gate)",
    async () => {
      const router = createRouter({ catalog: { source: "openrouter" } });
      const snapshot = await router.catalog();
      const liveIds = new Set(snapshot.entries.map((e) => e.id));
      const missing = fixtureIds.filter((id) => !liveIds.has(id));
      expect(missing).toEqual([]);
    },
    60_000,
  );

  it(
    "select() returns only a live model id",
    async () => {
      const router = createRouter({ catalog: { source: "openrouter" } });
      const pick = await router.select("Summarize this paragraph.", {
        name: "cheap",
        weights: { accuracy: 1, cost: 9, speed: 2 },
        constraints: { maxInputCostPerMTok: 5, minContext: 32_000 },
      });
      const snapshot = await router.catalog();
      expect(snapshot.entries.some((e) => e.id === pick.model)).toBe(true);
      expect(pick.backend).toBe("deterministic");
    },
    60_000,
  );
});
