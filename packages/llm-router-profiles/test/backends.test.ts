import { describe, expect, it } from "vitest";
import catalogFixture from "./fixtures/catalog.json";
import { toCatalogEntry } from "../src/catalog/schema";
import type { CatalogEntry, CatalogSnapshot } from "../src/catalog/schema";
import { createOpenRouterAutoBackend } from "../src/selector/openrouter-auto";
import { createLlmBackend } from "../src/selector/llm";
import { defineProfile } from "../src/profile";

function fixtureSnapshot(): CatalogSnapshot {
  const entries: CatalogEntry[] = [];
  for (const raw of catalogFixture.data) {
    const entry = toCatalogEntry(raw as never);
    if (entry) entries.push(entry);
  }
  return {
    entries,
    source: "static",
    fetchedAt: Date.now(),
    stale: false,
    droppedEntries: 1,
  };
}

const profile = defineProfile({
  name: "test",
  weights: { accuracy: 1, cost: 1, speed: 1 },
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("openrouter-auto backend", () => {
  it("returns the model OpenRouter's auto-router chose", async () => {
    const backend = createOpenRouterAutoBackend({
      apiKey: "test-key",
      fetchImpl: (async () =>
        jsonResponse({
          model: "stealth/space-bunny-alpha",
          choices: [{ message: { content: "hi" } }],
        })) as typeof fetch,
    });
    const selection = await backend.select({
      prompt: "hello",
      profile,
      catalog: fixtureSnapshot(),
    });
    expect(selection.model).toBe("stealth/space-bunny-alpha");
    expect(selection.backend).toBe("openrouter-auto");
  });

  it("fails typed when auto-router picks a model outside the catalog", async () => {
    const backend = createOpenRouterAutoBackend({
      apiKey: "test-key",
      fetchImpl: (async () =>
        jsonResponse({
          model: "openai/gpt-4-1106-vision-preview",
          choices: [{ message: { content: "hi" } }],
        })) as typeof fetch,
    });
    await expect(
      backend.select({ prompt: "hello", profile, catalog: fixtureSnapshot() }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("fails typed without a key", async () => {
    const backend = createOpenRouterAutoBackend();
    await expect(
      backend.select({ prompt: "hello", profile, catalog: fixtureSnapshot() }),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIALS" });
  });

  it("fails typed on upstream errors and non-JSON bodies", async () => {
    const backend = createOpenRouterAutoBackend({
      apiKey: "test-key",
      fetchImpl: (async () =>
        jsonResponse({ error: "rate limited" }, 429)) as typeof fetch,
    });
    await expect(
      backend.select({ prompt: "hello", profile, catalog: fixtureSnapshot() }),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });

    const badJson = createOpenRouterAutoBackend({
      apiKey: "test-key",
      fetchImpl: (async () =>
        new Response("not json", { status: 200 })) as typeof fetch,
    });
    await expect(
      badJson.select({ prompt: "hello", profile, catalog: fixtureSnapshot() }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("llm selector backend", () => {
  const completionFor = (model: string, reason = "best fit") =>
    jsonResponse({
      model: "test-selector",
      choices: [
        {
          message: {
            content: JSON.stringify({ model, reason }),
          },
        },
      ],
    });

  it("parses a JSON pick and validates it against the constraint shortlist", async () => {
    const backend = createLlmBackend({
      selectorModel: "test-selector",
      apiKey: "test-key",
      fetchImpl: (async () =>
        completionFor("bytedance-seed/seed-2.0-code")) as typeof fetch,
    });
    const selection = await backend.select({
      prompt: "hello",
      profile,
      catalog: fixtureSnapshot(),
    });
    expect(selection.model).toBe("bytedance-seed/seed-2.0-code");
    expect(selection.backend).toBe("llm");
    expect(selection.why).toContain("best fit");
  });

  it("rejects a hallucinated model id as typed failure, never a route", async () => {
    const backend = createLlmBackend({
      selectorModel: "test-selector",
      apiKey: "test-key",
      fetchImpl: (async () =>
        completionFor("made-up/model-name")) as typeof fetch,
    });
    await expect(
      backend.select({ prompt: "hello", profile, catalog: fixtureSnapshot() }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects a constraint-violating pick even when the id exists in the catalog", async () => {
    // o1-pro exists in the catalog but violates the profile's input-price cap;
    // the shortlist excludes it, so an LLM picking it must fail typed.
    const constrained = defineProfile({
      name: "capped",
      weights: { accuracy: 1, cost: 1, speed: 1 },
      constraints: { maxInputCostPerMTok: 5 },
    });
    const backend = createLlmBackend({
      selectorModel: "test-selector",
      apiKey: "test-key",
      fetchImpl: (async () => completionFor("openai/o1-pro")) as typeof fetch,
    });
    await expect(
      backend.select({
        prompt: "hello",
        profile: constrained,
        catalog: fixtureSnapshot(),
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("fails typed without a key or without a selector model", async () => {
    const noKey = createLlmBackend({
      selectorModel: "test-selector",
      fetchImpl: (async () =>
        completionFor("stealth/space-bunny-alpha")) as typeof fetch,
    });
    await expect(
      noKey.select({ prompt: "hello", profile, catalog: fixtureSnapshot() }),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIALS" });

    expect(() => createLlmBackend({} as never)).toThrow(/selectorModel/);
  });

  it("fails typed when no candidate satisfies the constraints", async () => {
    const impossible = defineProfile({
      name: "impossible",
      weights: { accuracy: 1, cost: 1, speed: 1 },
      constraints: { minContext: 10_000_000 },
    });
    const backend = createLlmBackend({
      selectorModel: "test-selector",
      apiKey: "test-key",
      fetchImpl: (async () =>
        completionFor("stealth/space-bunny-alpha")) as typeof fetch,
    });
    await expect(
      backend.select({
        prompt: "hello",
        profile: impossible,
        catalog: fixtureSnapshot(),
      }),
    ).rejects.toMatchObject({ code: "NO_MODEL_FITS" });
  });
});
