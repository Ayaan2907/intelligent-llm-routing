#!/usr/bin/env node
/**
 * npm pack dry-run verifier: builds nothing, but asserts the tarball file
 * list is exactly the publishable surface — dist/ plus the npm auto-included
 * package.json, README.md, LICENSE, and CHANGELOG.md — with no junk leaking
 * in (src, tests, tsconfig, lockfiles). Run after the library build:
 *
 *   pnpm --filter llm-router-profiles build && node scripts/pack-verify.mjs
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PKG_DIR = join(process.cwd(), "packages", "llm-router-profiles");

if (!existsSync(join(PKG_DIR, "dist", "index.js"))) {
  console.error("pack-verify: dist/index.js missing — build the library first:\n  pnpm --filter llm-router-profiles build");
  process.exit(1);
}

// npm notice lines (including the file list) go to stderr — merge streams so
// the parser sees them.
const out = execSync("npm pack --dry-run 2>&1", { cwd: PKG_DIR, encoding: "utf8" });

// File list lines look like: "npm notice 2.1kB  dist/index.js" — the size
// prefix (digit-led token) distinguishes them from metadata lines such as
// "npm notice name: ..." or "npm notice total files: 7".
const sizeLine = /^npm notice\s+\d+(?:\.\d+)?\S*\s+(.+)$/gm;
const files = [];
for (const m of out.matchAll(sizeLine)) {
  const path = m[1].trim();
  if (path && !path.startsWith("Tarball ") && !path.endsWith(".tgz")) files.push(path);
}

const ALLOWED = [
  /^package\.json$/,
  /^README\.md$/,
  /^LICENSE$/,
  /^CHANGELOG\.md$/,
  /^dist\//,
];

const junk = files.filter((f) => !ALLOWED.some((re) => re.test(f)));
const required = ["package.json", "README.md", "LICENSE", "CHANGELOG.md", "dist/index.js", "dist/index.d.ts"];
const absent = required.filter((f) => !files.includes(f));

if (junk.length > 0 || absent.length > 0) {
  console.error("pack-verify: FAIL");
  for (const j of junk) console.error(`  junk in tarball: ${j}`);
  for (const a of absent) console.error(`  missing from tarball: ${a}`);
  process.exit(1);
}

const tarballLine = out.match(/npm notice\s+\S+\s*(\S+\.tgz)/);
console.log(`pack-verify: PASS — clean tarball (${tarballLine ? tarballLine[1] : "llm-router-profiles-0.1.0.tgz"}), ${files.length} files:`);
for (const f of files) console.log(`  ${f}`);
