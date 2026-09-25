#!/usr/bin/env node
/**
 * Dogfooding check: the demo Next.js app must consume the library — not carry
 * its own selector. Asserts the server routing module imports
 * llm-router-profiles and that the old duplicated-selector paths are gone
 * from src/: the LLM selector with its silent fallback, the hardcoded
 * AVAILABLE_MODELS catalog, and raw OpenAI SDK calls. Zero deps.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const SRC = join(process.cwd(), "src");

// The library import must exist somewhere in the server graph.
const routerLib = join(SRC, "lib", "router.ts");
if (!readFileSync(routerLib, "utf8").includes('from "llm-router-profiles"')) {
  console.error(`no-duplicated-selector: FAIL — ${routerLib} does not import "llm-router-profiles"`);
  process.exit(1);
}

// The old selector paths must not reappear anywhere in demo code.
const FORBIDDEN = [
  [/chat\.completions\.create/, "raw OpenAI SDK completion call (bypasses the router)"],
  [/selectBestModel/, "old LLM-selector function"],
  [/AVAILABLE_MODELS/, "hardcoded model catalog"],
  [/from ["']openai["']/, "direct openai SDK import"],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ([".ts", ".tsx"].includes(extname(p))) out.push(p);
  }
  return out;
}

const violations = [];
for (const file of walk(SRC)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const [re, why] of FORBIDDEN) {
      if (re.test(line)) violations.push(`${file}:${i + 1} — ${why}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error("no-duplicated-selector: FAIL — duplicated selector logic found:\n");
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log("no-duplicated-selector: PASS — demo imports llm-router-profiles; no duplicated selector paths in src/");
