#!/usr/bin/env node
/**
 * Smoke test — runs in CI (`npm test`) before publishing.
 *
 * It performs no network access and never starts a long-running process.
 * Instead it syntax-checks every published entry point with `node --check`
 * and verifies that the files declared in package.json actually exist.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

let failures = 0;
const fail = (msg) => { console.error(`  ✗ ${msg}`); failures++; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

console.log('DOS Browser smoke test\n');

// 1. Every bin and published JS file must parse without syntax errors.
const jsEntryPoints = new Set([
  ...Object.values(pkg.bin || {}),
  'browser-cli.js',
  'tui-browser.js',
  'mcp-server.js',
]);

console.log('Syntax-checking entry points:');
for (const rel of jsEntryPoints) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) { fail(`missing file: ${rel}`); continue; }
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    ok(`${rel} parses`);
  } catch (err) {
    fail(`${rel} has a syntax error:\n${err.stderr || err.message}`);
  }
}

// 2. Everything listed in "files" must exist so we don't publish a broken tarball.
console.log('\nVerifying published "files" exist:');
for (const rel of pkg.files || []) {
  if (fs.existsSync(path.join(root, rel))) ok(`${rel}`);
  else fail(`declared in "files" but missing: ${rel}`);
}

// 3. Sanity-check required metadata for an npm listing.
console.log('\nVerifying package metadata:');
for (const field of ['name', 'version', 'description', 'license']) {
  if (pkg[field]) ok(`${field} = ${pkg[field]}`);
  else fail(`package.json is missing "${field}"`);
}
if (pkg.private) fail('package.json has "private": true — it cannot be published');

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All smoke checks passed.');
