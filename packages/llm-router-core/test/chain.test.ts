import { describe, expect, it } from "vitest";
import catalogFixture from "./fixtures/catalog.json";
import { toCatalogEntry } from "../src/catalog/schema";
import type { CatalogEntry, CatalogSnapshot } from "../src/catalog/schema";
import { BackendFailure, RoutingError } from "../src/errors";
import { defineProfile } from "../src/profile";
import { createDeterministicBackend } from "../src/selector/deterministic";
import { runBackendChain } from "../src/selector/chain";
import type { Selection, SelectorBackend } from "../src/selector/types";

const profile = defineProfile({
  name: "test",
  weights: { accuracy: 1, cost: 1, speed: 1 },
  constraints: { maxInputCostPerMTok: 5, minContext: 32_000 },
});

function snapshot(entries: CatalogEntry[]): CatalogSnapshot {
  return {
    entries,
    source: "static",
    fetchedAt: 0,
    stale: false,
    droppedEntries: 0,
  };
}

function fixtureEntries(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const raw of catalogFixture.data) {
    const entry = toCatalogEntry(raw as never);
    if (entry) entries.push(entry);
  }
  return entries;
}

function stubBackend(
  name: string,
  impl: () => Promise<Selection>,
): SelectorBackend {
  return { name, select: impl };
}

describe("runBackendChain", () => {
  it("returns the first successful selection with its attempt recorded", async () => {
    const first = stubBackend("first", async () => ({
      model: "stealth/space-bunny-alpha",
      backend: "first",
      why: "first picks",
      matched: {},
      candidates: 1,
      latencyMs: 1,
    }));
    const result = await runBackendChain([first], {
      prompt: "hi",
      profile,
      catalog: snapshot(fixtureEntries()),
    });
    expect(result.model).toBe("stealth/space-bunny-alpha");
    expect(result.attempts).toEqual([{ backend: "first", ok: true }]);
  });

  it("falls back explicitly and records the failed attempt", async () => {
    const failing = stubBackend("failing", async () => {
      throw new BackendFailure("MISSING_CREDENTIALS", "no key configured");
    });
    const second = stubBackend("second", async () => ({
      model: "bytedance-seed/seed-2.0-code",
      backend: "second",
      why: "second picks",
      matched: {},
      candidates: 1,
      latencyMs: 1,
    }));
    const result = await runBackendChain([failing, second], {
      prompt: "hi",
      profile,
      catalog: snapshot(fixtureEntries()),
    });
    expect(result.model).toBe("bytedance-seed/seed-2.0-code");
    expect(result.backend).toBe("second");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toMatchObject({
      backend: "failing",
      ok: false,
      error: expect.stringContaining("MISSING_CREDENTIALS"),
    });
    expect(result.attempts[1]).toMatchObject({ backend: "second", ok: true });
  });

  it("throws typed ALL_BACKENDS_FAILED with per-attempt details when everything fails", async () => {
    const a = stubBackend("a", async () => {
      throw new BackendFailure("MISSING_CREDENTIALS", "no key");
    });
    const b = stubBackend("b", async () => {
      throw new Error("kaboom");
    });
    const err = await runBackendChain([a, b], {
      prompt: "hi",
      profile,
      catalog: snapshot(fixtureEntries()),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(RoutingError);
    expect(err.code).toBe("ALL_BACKENDS_FAILED");
    expect(err.details.attempts).toEqual([
      { backend: "a", ok: false, error: "MISSING_CREDENTIALS: no key" },
      { backend: "b", ok: false, error: "UPSTREAM_ERROR: kaboom" },
    ]);
  });

  it("blocks a backend from routing to a model outside the catalog", async () => {
    // The exact failure that killed the old app: a selector returning a
    // retired model id must never become a route.
    const deadModelBackend = stubBackend("dead-model", async () => ({
      model: "openai/gpt-4-1106-vision-preview", // retired, not in fixture
      backend: "dead-model",
      why: "would route to a dead model",
      matched: {},
      candidates: 1,
      latencyMs: 1,
    }));
    const deterministic = createDeterministicBackend();
    const result = await runBackendChain([deadModelBackend, deterministic], {
      prompt: "hi",
      profile,
      catalog: snapshot(fixtureEntries()),
    });
    expect(result.backend).toBe("deterministic");
    expect(result.attempts[0].ok).toBe(false);
    expect(result.attempts[0].error).toContain("not in the");
  });

  it("enforces catalog membership even for a sole backend (typed, not silent)", async () => {
    const deadModelBackend = stubBackend("dead-model", async () => ({
      model: "openai/gpt-4-1106-vision-preview",
      backend: "dead-model",
      why: "dead",
      matched: {},
      candidates: 1,
      latencyMs: 1,
    }));
    await expect(
      runBackendChain([deadModelBackend], {
        prompt: "hi",
        profile,
        catalog: snapshot(fixtureEntries()),
      }),
    ).rejects.toMatchObject({ code: "ALL_BACKENDS_FAILED" });
  });
});
