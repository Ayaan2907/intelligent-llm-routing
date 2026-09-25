#!/usr/bin/env node
/**
 * Catalog drift gate — the test the audit called highest-value, aimed at
 * ourselves first.
 *
 * Every model id referenced by the README, the examples, or the demo `src/`
 * must exist in OpenRouter's live public catalog (GET /api/v1/models — no key
 * needed). A doc or example that names a dead model id fails CI with a named
 * report instead of rotting silently — the exact failure that killed the
 * original selector app.
 *
 * The test fixture (the packages' test/fixtures/catalog.json) is deliberately
 * excluded: its ids are synthetic copies of live entries, guarded by the
 * always-on fixture-sanity unit test instead.
 *
 * Zero dependencies (node >= 20): `node scripts/drift-gate.mjs`
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/** vendor/model — vendor is letters+dashes (must contain a letter), model may carry dots and colons (gpt-3.5-turbo, gpt-oss-20b:free). */
const MODEL_ID_RE = /\b([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9.:_-]*)/gi;

/**
 * Generic path segments that appear in repo paths, URLs, and shell commands
 * but are never an OpenRouter vendor. With the lookbehind guards below this
 * is belt-and-suspenders; keeping it explicit makes false negatives visible.
 */
const DENYLISTED_VENDORS = new Set([
  "packages", "src", "test", "tests", "dist", "examples", "scripts", "app",
  "components", "lib", "hooks", "utils", "types", "config", "public", "docs",
  "node_modules", "main", "master", "origin", "api", "v1", "tree", "blob",
  "issues", "releases", "tags", "work", "home", "user", "tmp", "www", "com",
  "org", "net", "dev", "io",
]);

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".json", ".md"]);

/** Directories never scanned (build output, deps, synthetic fixtures). */
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".git", "fixtures"]);

/**
 * Extract candidate model ids from free text. Guards against URL and path
 * false positives: a match is skipped when the character before it is `.`
 * (tail of a hostname like openrouter.`ai`/api) or `/` (mid-URL path), or
 * when the vendor segment is denylisted or letterless (dates, fractions).
 */
export function extractModelIds(text) {
  const found = new Set();
  for (const match of text.matchAll(MODEL_ID_RE)) {
    const start = match.index;
    const before = start > 0 ? text[start - 1] : "";
    if (before === "." || before === "/") continue;
    const [, vendor, model] = match;
    if (!/[a-z]/i.test(vendor)) continue;
    if (DENYLISTED_VENDORS.has(vendor.toLowerCase())) continue;
    if (DENYLISTED_VENDORS.has(model.toLowerCase())) continue;
    found.add(`${vendor}/${model}`);
  }
  return [...found].sort();
}

/** Walk a directory collecting scan-eligible files. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (SCAN_EXTENSIONS.has(extname(p))) out.push(p);
  }
  return out;
}

/** Collect { id, files } for every model id referenced in the scanned trees. */
export function collectReferences(roots) {
  const byId = new Map();
  for (const root of roots) {
    for (const file of walk(root)) {
      const text = readFileSync(file, "utf8");
      for (const id of extractModelIds(text)) {
        const ref = byId.get(id) ?? { id, files: [] };
        ref.files.push(file);
        byId.set(id, ref);
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Fetch the live catalog id set; 2 attempts against network flake. */
export async function fetchLiveCatalogIds(fetchImpl = fetch) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetchImpl(OPENROUTER_MODELS_URL, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`catalog responded ${res.status}`);
      const json = await res.json();
      const ids = new Set();
      for (const entry of json?.data ?? []) {
        if (typeof entry?.id === "string") ids.add(entry.id);
      }
      if (ids.size < 10) throw new Error(`catalog suspiciously small (${ids.size} ids)`);
      return ids;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 3_000));
    }
  }
  throw lastErr;
}

async function main() {
  const repoRoot = process.cwd();
  const libRoot = join(repoRoot, "packages", "llm-router-profiles");
  const roots = [repoRoot, libRoot].filter((r) => {
    try { statSync(r); return true; } catch { return false; }
  });

  const refs = collectReferences(roots);
  console.log(`drift-gate: ${refs.length} unique model ids referenced across README, examples, and src`);

  if (refs.length < 3) {
    console.error("drift-gate: FAIL — fewer than 3 ids extracted; extraction itself may be broken");
    process.exit(1);
  }

  const live = await fetchLiveCatalogIds();
  console.log(`drift-gate: live catalog has ${live.size} models`);

  const missing = refs.filter((r) => !live.has(r.id));
  if (missing.length > 0) {
    console.error("\ndrift-gate: FAIL — referenced model ids missing from the live OpenRouter catalog:\n");
    for (const ref of missing) {
      console.error(`  ✗ ${ref.id}`);
      for (const f of ref.files) console.error(`      referenced in: ${f}`);
    }
    console.error("\nUpdate the docs/examples to live ids, or pick different models.");
    process.exit(1);
  }

  console.log("drift-gate: PASS — every referenced model id exists in the live catalog");
}

/** Only run main when executed directly (tests import the pure functions). */
if (process.argv[1] && process.argv[1].endsWith("drift-gate.mjs")) {
  main().catch((err) => {
    console.error(`drift-gate: FAIL — ${err.message}`);
    process.exit(1);
  });
}
