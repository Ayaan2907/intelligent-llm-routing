#!/usr/bin/env node
/**
 * Catalog drift gate — the test the audit called highest-value, aimed at
 * ourselves first.
 *
 * Every model id referenced by the docs (READMEs), the examples/, or the demo
 * `src/` must exist in OpenRouter's live public catalog (GET /api/v1/models —
 * no key needed). A doc or example that names a dead model id fails CI with a
 * named report instead of rotting silently — the exact failure that killed
 * the original selector app.
 *
 * Scope is deliberate. Library source, library tests, and scripts never
 * catalogue a model id for users: the library tests run hermetically on
 * synthetic fixtures (per the spec's locked decisions), so scanning them
 * would only manufacture false positives. The gate covers the surfaces a
 * builder reads and copies.
 *
 * Extraction filters out non-model lookalikes:
 *   - import/require lines (`from "next/server"` is a module, not a model)
 *   - numeric tails (`bg-black/80`, `slide-in-from-left-1/2` — Tailwind)
 *   - an explicit NON_MODEL_IDS set for strings like `application/json`
 *   - URL/path guards (hostname tails, mid-URL paths, repo segments)
 *
 * The test fixture (the packages' test/fixtures/catalog.json) is excluded:
 * its ids are synthetic copies of live entries, guarded by the always-on
 * fixture-sanity unit test instead.
 *
 * Zero dependencies (node >= 20): `node scripts/drift-gate.mjs`
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/** vendor/model — vendor is letters+dashes (must contain a letter), model may carry dots and colons (gpt-3.5-turbo, gpt-oss-20b:free). */
const MODEL_ID_RE = /\b([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9.:_-]*)/gi;

/** Generic path segments that appear in repo paths and URLs but are never an OpenRouter vendor. */
const DENYLISTED_VENDORS = new Set([
  "packages", "src", "test", "tests", "dist", "examples", "scripts", "app",
  "components", "lib", "hooks", "utils", "types", "config", "public", "docs",
  "node_modules", "main", "master", "origin", "api", "v1", "tree", "blob",
  "issues", "releases", "tags", "work", "home", "user", "tmp", "www", "com",
  "org", "net", "dev", "io",
]);

/**
 * Strings that match the model-id shape but are never a model id. Explicit
 * and documented — anything added here must come with a comment naming where
 * it appears.
 */
const NON_MODEL_IDS = new Set([
  "application/json", // Content-Type headers in fetch calls and curl examples
]);

/** import/require lines — module specifiers, not model ids. The last branch
 * catches multiline-import continuation lines (`} from "@scope/pkg";`). */
const IMPORT_LINE_RE =
  /^\s*(?:import\b|export\s+(?:\*|{)[^;]*\bfrom\s*["']|export\s+\*\s+from|const\s+\w+\s*=\s*require\(|.*\brequire\(\s*["']|.*\bfrom\s*["'][^"']*["']\s*;?\s*$)/;

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".json", ".md"]);

/** Directories never scanned even inside a target tree (build output, deps). */
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".git", "fixtures"]);

/**
 * Extract candidate model ids from free text, line by line so import lines
 * can be skipped wholesale.
 */
export function extractModelIds(text) {
  const found = new Set();
  for (const line of text.split("\n")) {
    if (IMPORT_LINE_RE.test(line)) continue;
    for (const match of line.matchAll(MODEL_ID_RE)) {
      const start = match.index;
      const before = start > 0 ? line[start - 1] : "";
      if (before === "." || before === "/") continue;
      const [, vendor, model] = match;
      if (!/[a-z]/i.test(vendor)) continue;
      if (!/[a-z]/i.test(model)) continue; // numeric tail: Tailwind opacity, fractions, dates
      if (DENYLISTED_VENDORS.has(vendor.toLowerCase())) continue;
      if (DENYLISTED_VENDORS.has(model.toLowerCase())) continue;
      const id = `${vendor}/${model}`;
      if (NON_MODEL_IDS.has(id.toLowerCase())) continue;
      found.add(id);
    }
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
export function collectReferences(targets) {
  const byId = new Map();
  for (const target of targets) {
    if (!existsSync(target)) continue;
    const files = statSync(target).isDirectory() ? walk(target) : [target];
    for (const file of files) {
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

/**
 * The scan surface: docs (READMEs), examples, and the demo app source.
 * Deliberately NOT library src/tests or scripts — see the header comment.
 */
export function scanTargets(repoRoot) {
  const targets = [
    join(repoRoot, "README.md"),
    join(repoRoot, "examples"),
    join(repoRoot, "src"), // the demo app lives at the repo root
  ];
  const packagesDir = join(repoRoot, "packages");
  if (existsSync(packagesDir)) {
    for (const name of readdirSync(packagesDir)) {
      const readme = join(packagesDir, name, "README.md");
      if (existsSync(readme)) targets.push(readme);
    }
  }
  return targets.filter((t) => existsSync(t));
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
  const refs = collectReferences(scanTargets(repoRoot));
  console.log(`drift-gate: ${refs.length} unique model ids referenced across README, examples, and demo src`);

  if (refs.length === 0) {
    console.error("drift-gate: FAIL — no model ids extracted; extraction itself may be broken");
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
