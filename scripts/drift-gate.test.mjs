#!/usr/bin/env node
/**
 * Hermetic unit tests for the drift-gate extractor (node:test, zero deps).
 * The extractor is the part that can silently rot — a regex that stops
 * matching model ids would turn the live gate into a no-op, so it gets its
 * own tests. Run: node --test scripts/drift-gate.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { extractModelIds } from "./drift-gate.mjs";

test("extracts a plain model id", () => {
  assert.deepEqual(extractModelIds("`openai/gpt-4o-mini`"), ["openai/gpt-4o-mini"]);
});

test("extracts ids with dots and :free suffix", () => {
  assert.deepEqual(
    extractModelIds("use `openai/gpt-3.5-turbo` or `openai/gpt-oss-20b:free`"),
    ["openai/gpt-3.5-turbo", "openai/gpt-oss-20b:free"],
  );
});

test("extracts from JSON string values", () => {
  const json = JSON.stringify({ id: "anthropic/claude-3.5-sonnet", other: "x" });
  assert.deepEqual(extractModelIds(json), ["anthropic/claude-3.5-sonnet"]);
});

test("ignores https URLs wholesale", () => {
  const text = "see https://openrouter.ai/api/v1/models and https://github.com/Ayaan2907/intelligent-llm-routing";
  assert.deepEqual(extractModelIds(text), []);
});

test("ignores ids mid-URL-path (after a host)", () => {
  const text = "https://openrouter.ai/openai/gpt-4o";
  assert.deepEqual(extractModelIds(text), []);
});

test("ignores repo paths like packages/llm-router-profiles", () => {
  assert.deepEqual(extractModelIds("packages/llm-router-profiles/src/index.ts"), []);
  assert.deepEqual(extractModelIds("src/app/api/chat/route.ts"), []);
});

test("ignores letterless vendors (dates, fractions)", () => {
  assert.deepEqual(extractModelIds("dated 2026/09/25, split 1/2"), []);
});

test("ignores numeric model tails (Tailwind opacity classes)", () => {
  assert.deepEqual(
    extractModelIds('className="bg-black/80 slide-in-from-left-1/2 text-foreground/50"'),
    [],
  );
});

test("ignores module specifiers on import lines", () => {
  assert.deepEqual(
    extractModelIds('import { NextResponse } from "next/server";'),
    [],
  );
  assert.deepEqual(
    extractModelIds('import test from "node:test";'),
    [],
  );
});

test("ignores multiline-import continuation lines", () => {
  assert.deepEqual(
    extractModelIds('  } from "@radix-ui/react-icons";'),
    [],
  );
});

test("ignores explicit non-model ids like MIME types", () => {
  assert.deepEqual(
    extractModelIds("headers: { Accept: 'application/json' }"),
    [],
  );
});

test("keeps real vendors that look like path segments", () => {
  assert.deepEqual(extractModelIds("`meta-llama/llama-3.1-8b-instruct`"), [
    "meta-llama/llama-3.1-8b-instruct",
  ]);
});

test("dedupes and sorts", () => {
  assert.deepEqual(
    extractModelIds("`openai/gpt-4o` then `openai/gpt-4o` and `anthropic/claude-3-opus`"),
    ["anthropic/claude-3-opus", "openai/gpt-4o"],
  );
});
