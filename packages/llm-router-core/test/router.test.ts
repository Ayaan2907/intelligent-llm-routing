import { describe, expect, it } from "vitest";
import catalogFixture from "./fixtures/catalog.json";
import { toCatalogEntry } from "../src/catalog/schema";
import type { CatalogEntry } from "../src/catalog/schema";
import { isRoutingError, RoutingError } from "../src/errors";
import { createRouter } from "../src/router";

/**
 * Zero-env is a tested requirement: the old app crashed at import when
 * OPEN_ROUTER_API_KEY was missing. These tests run with the env var deleted
 * and prove selection works, chat fails typed, and nothing reads process.env.
 */

function fixtureEntries(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const raw of catalogFixture.data) {
    const entry = toCatalogEntry(raw as never);
    if (entry) entries.push(entry);
  }
  return entries;
}

function staticCatalog() {
  return { entries: fixtureEntries() };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const profile = {
  name: "cheap-fast",
  weights: { accuracy: 0.2, cost: 0.6, speed: 0.2 },
  constraints: { maxInputCostPerMTok: 5, minContext: 32_000 },
};

describe("createRouter with a static catalog (demo mode)", () => {
  it("selects with zero env vars and zero keys", async () => {
    delete process.env.OPEN_ROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const router = createRouter({ catalog: staticCatalog() });
    const pick = await router.select("hello", profile);
    expect(pick.model).toBe("stealth/space-bunny-alpha");
    expect(pick.backend).toBe("deterministic");
    expect(pick.attempts).toEqual([{ backend: "deterministic", ok: true }]);
    expect(pick.why).toContain("cheap-fast");
  });

  it("fails typed on chat without a key — with and without an explicit model", async () => {
    delete process.env.OPEN_ROUTER_API_KEY;
    const router = createRouter({ catalog: staticCatalog() });

    await expect(router.chat("hello", profile)).rejects.toSatisfy(
      (err: unknown) => isRoutingError(err) && err.code === "MISSING_CREDENTIALS",
    );

    await expect(
      router.chat("hello", profile, { model: "stealth/space-bunny-alpha" }),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIALS" });
  });

  it("throws CONFIG_INVALID for the bare 'llm' selector string", () => {
    expect(() =>
      createRouter({
        catalog: staticCatalog(),
        apiKey: "k",
        selector: ["deterministic", "llm"],
      }),
    ).toThrow(/selectorModel/);
  });
});

describe("createRouter chat()", () => {
  const completionBody = {
    model: "bytedance-seed/seed-2.0-code",
    choices: [{ message: { content: "hello there" } }],
    usage: {
      prompt_tokens: 1000,
      completion_tokens: 2000,
      total_tokens: 3000,
    },
  };

  it("reports usage and honest cost from live catalog pricing", async () => {
    const router = createRouter({
      catalog: staticCatalog(),
      apiKey: "test-key",
      fetchImpl: (async () => jsonResponse(completionBody)) as typeof fetch,
    });
    const result = await router.chat("hello", profile, {
      model: "bytedance-seed/seed-2.0-code",
    });
    expect(result.text).toBe("hello there");
    expect(result.model).toBe("bytedance-seed/seed-2.0-code");
    expect(result.meta.usage).toEqual({
      promptTokens: 1000,
      completionTokens: 2000,
      totalTokens: 3000,
    });
    // 1000 tokens × $0.5/MTok + 2000 × $3/MTok
    expect(result.meta.costUsd?.input).toBeCloseTo(0.0005, 12);
    expect(result.meta.costUsd?.output).toBeCloseTo(0.006, 12);
    expect(result.meta.costUsd?.total).toBeCloseTo(0.0065, 12);
    expect(result.meta.provenance.selectedBy).toBe("caller");
    expect(result.meta.provenance.costNote).toBeNull();
  });

  it("routes via the selector chain when no explicit model is given", async () => {
    const router = createRouter({
      catalog: staticCatalog(),
      apiKey: "test-key",
      fetchImpl: (async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        if (url.includes("/chat/completions")) return jsonResponse(completionBody);
        throw new Error("catalog should be static in this test");
      }) as typeof fetch,
    });
    const result = await router.chat("hello", profile);
    expect(result.model).toBe("stealth/space-bunny-alpha"); // deterministic pick
    expect(result.meta.provenance.selectedBy).toBe("deterministic");
  });

  it("reports cost as null with a note when the model is not in the catalog", async () => {
    const router = createRouter({
      catalog: staticCatalog(),
      apiKey: "test-key",
      fetchImpl: (async () =>
        jsonResponse({
          ...completionBody,
          model: "unknown/model",
        })) as typeof fetch,
    });
    const result = await router.chat("hello", profile, {
      model: "unknown/model", // caller's explicit choice — not overridden
    });
    expect(result.model).toBe("unknown/model");
    expect(result.meta.costUsd).toBeNull();
    expect(result.meta.provenance.costNote).toContain("not found in catalog");
  });

  it("fails typed on upstream errors", async () => {
    const router = createRouter({
      catalog: staticCatalog(),
      apiKey: "test-key",
      fetchImpl: (async () =>
        jsonResponse({ error: "nope" }, 500)) as typeof fetch,
    });
    await expect(
      router.chat("hello", profile, { model: "stealth/space-bunny-alpha" }),
    ).rejects.toSatisfy(
      (err: unknown) => isRoutingError(err) && err.code === "UPSTREAM_ERROR",
    );
  });
});

describe("createRouter with live-catalog config and injected fetch", () => {
  it("selects against the fetched catalog and exposes it", async () => {
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
      expect(String(input)).toBe("https://openrouter.ai/api/v1/models");
      return jsonResponse(catalogFixture);
    }) as typeof fetch;
    const router = createRouter({ fetchImpl });
    const catalog = await router.catalog();
    expect(catalog.entries.length).toBe(6);
    expect(catalog.droppedEntries).toBe(1);

    const pick = await router.select("hello", profile);
    expect(pick.model).toBe("stealth/space-bunny-alpha");
  });
});

describe("typed error contract", () => {
  it("RoutingError carries code and details, and isRoutingError discriminates", () => {
    const err = new RoutingError("NO_MODEL_FITS", "nothing fits", { x: 1 });
    expect(err.code).toBe("NO_MODEL_FITS");
    expect(err.details).toEqual({ x: 1 });
    expect(isRoutingError(err)).toBe(true);
    expect(isRoutingError(new Error("nope"))).toBe(false);
  });
});
