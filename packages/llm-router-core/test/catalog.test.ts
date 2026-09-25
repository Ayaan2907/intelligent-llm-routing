import { describe, expect, it } from "vitest";
import catalogFixture from "./fixtures/catalog.json";
import {
  openRouterResponseSchema,
  perTokenToPerMTok,
  toCatalogEntry,
  type OpenRouterEntry,
} from "../src/catalog/schema";
import {
  createCacheState,
  fetchCatalogSnapshot,
} from "../src/catalog/fetchCatalog";
import { RoutingError } from "../src/errors";

/** Fixed clock past the fixture's 2026-01-01 expiration, before 2026-11-11. */
const NOW = Date.parse("2026-09-24T00:00:00Z");

function fixtureJson(): unknown {
  return JSON.parse(JSON.stringify(catalogFixture));
}

function fixtureResponse(): Response {
  return new Response(JSON.stringify(fixtureJson()), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const okEnvelope = openRouterResponseSchema.parse(fixtureJson());
const rawEntries = okEnvelope.data as OpenRouterEntry[];

describe("openRouterResponseSchema", () => {
  it("accepts the fixture envelope shape", () => {
    expect(okEnvelope.data.length).toBe(7);
  });

  it("rejects a malformed envelope", () => {
    expect(() => openRouterResponseSchema.parse({ data: "nope" })).toThrow();
    expect(() => openRouterResponseSchema.parse({})).toThrow();
  });
});

describe("toCatalogEntry", () => {
  it("converts per-token string pricing to per-MTok numbers", () => {
    const entry = toCatalogEntry(rawEntries[1]); // bytedance-seed/seed-2.0-code
    expect(entry?.id).toBe("bytedance-seed/seed-2.0-code");
    expect(entry?.inputCostPerMTok).toBeCloseTo(0.5, 10);
    expect(entry?.outputCostPerMTok).toBeCloseTo(3, 10);
  });

  it("marks expired entries deprecated and keeps the expiry date", () => {
    const gpt4 = toCatalogEntry(rawEntries[4]); // openai/gpt-4, expired 2026-01-01
    expect(gpt4?.deprecated).toBe(true);
    expect(gpt4?.expiresAt).toBe("2026-01-01");
  });

  it("detects reasoning support from supported_parameters", () => {
    expect(toCatalogEntry(rawEntries[0])?.supportsReasoning).toBe(true);
    expect(toCatalogEntry(rawEntries[4])?.supportsReasoning).toBe(false);
  });

  it("returns null for an entry without an id instead of crashing", () => {
    const broken = { name: "broken entry with no id" };
    expect(toCatalogEntry(broken as unknown as OpenRouterEntry)).toBeNull();
  });

  it("keeps a known id even when pricing is withheld (null, not zero)", () => {
    const mini = toCatalogEntry(rawEntries[5]); // gpt-4o-mini, pricing null
    expect(mini?.id).toBe("openai/gpt-4o-mini");
    expect(mini?.inputCostPerMTok).toBeNull();
    expect(mini?.outputCostPerMTok).toBeNull();
  });
});

describe("perTokenToPerMTok", () => {
  it("converts OpenRouter's per-token strings", () => {
    expect(perTokenToPerMTok("0.0000005")).toBeCloseTo(0.5, 10);
    expect(perTokenToPerMTok("0.000003")).toBeCloseTo(3, 10);
    expect(perTokenToPerMTok("0")).toBe(0);
  });

  it("returns null for unknown or invalid values — never a guess", () => {
    expect(perTokenToPerMTok(undefined)).toBeNull();
    expect(perTokenToPerMTok("")).toBeNull();
    expect(perTokenToPerMTok("abc")).toBeNull();
    expect(perTokenToPerMTok("-1")).toBeNull();
  });
});

describe("fetchCatalogSnapshot", () => {
  function fetchOk(): { impl: typeof fetch; calls: () => number } {
    let calls = 0;
    const impl = (async () => {
      calls += 1;
      return fixtureResponse();
    }) as typeof fetch;
    return { impl, calls: () => calls };
  }

  it("fetches, validates, and reports dropped malformed entries", async () => {
    const { impl } = fetchOk();
    const cache = createCacheState();
    const snapshot = await fetchCatalogSnapshot(cache, {
      now: () => NOW,
      fetchImpl: impl,
    });
    expect(snapshot.entries.length).toBe(6);
    expect(snapshot.droppedEntries).toBe(1);
    expect(snapshot.source).toBe("openrouter");
    expect(snapshot.stale).toBe(false);
    expect(snapshot.fetchedAt).toBe(NOW);
    expect(snapshot.entries.map((e) => e.id)).toContain(
      "stealth/space-bunny-alpha",
    );
  });

  it("serves from cache within the TTL and refetches after it expires", async () => {
    const { impl, calls } = fetchOk();
    const cache = createCacheState();
    const opts = { now: () => NOW, ttlMinutes: 60, fetchImpl: impl };

    await fetchCatalogSnapshot(cache, opts);
    await fetchCatalogSnapshot(cache, opts);
    expect(calls()).toBe(1);

    await fetchCatalogSnapshot(cache, {
      ...opts,
      now: () => NOW + 61 * 60 * 1000,
    });
    expect(calls()).toBe(2);
  });

  it("refetches when ttlMinutes is 0", async () => {
    const { impl, calls } = fetchOk();
    const cache = createCacheState();
    const opts = { now: () => NOW, ttlMinutes: 0, fetchImpl: impl };
    await fetchCatalogSnapshot(cache, opts);
    await fetchCatalogSnapshot(cache, opts);
    expect(calls()).toBe(2);
  });

  it("returns the stale snapshot with a note when a refresh fails on a warm cache", async () => {
    const cache = createCacheState();
    await fetchCatalogSnapshot(cache, {
      now: () => NOW,
      ttlMinutes: 60,
      fetchImpl: fetchOk().impl,
    });

    const later = NOW + 61 * 60 * 1000;
    const failing = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const snapshot = await fetchCatalogSnapshot(cache, {
      now: () => later,
      ttlMinutes: 60,
      fetchImpl: failing,
    });
    expect(snapshot.stale).toBe(true);
    expect(snapshot.staleReason).toContain("network down");
    expect(snapshot.entries.length).toBe(6);
    expect(snapshot.fetchedAt).toBe(NOW);
  });

  it("fails typed when the first fetch fails (cold cache)", async () => {
    const cache = createCacheState();
    const failing = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    await expect(
      fetchCatalogSnapshot(cache, {
        now: () => NOW,
        fetchImpl: failing,
      }),
    ).rejects.toMatchObject({
      code: "CATALOG_UNAVAILABLE",
    });
  });

  it("fails typed when the body violates the catalog schema (cold cache)", async () => {
    const cache = createCacheState();
    const badBody = (async () =>
      new Response(JSON.stringify({ data: "nope" }), {
        status: 200,
      })) as typeof fetch;
    await expect(
      fetchCatalogSnapshot(cache, { now: () => NOW, fetchImpl: badBody }),
    ).rejects.toBeInstanceOf(RoutingError);
  });
});
