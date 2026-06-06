#!/usr/bin/env node
/**
 * Dependency-free smoke test.
 *
 * Runs offline and is safe for CI: it validates that the shipped entry points
 * parse, that the package metadata stays consistent, and that bundled config
 * is well-formed. It intentionally does NOT start the MCP server or hit the
 * network — `mcp-server.js` connects to stdio on import, so we syntax-check it
 * with `node --check` instead of requiring it.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(`        ${err.message}`);
    process.exitCode = 1;
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('package.json bin targets exist and parse', () => {
  const bins = Object.values(pkg.bin || {});
  assert.ok(bins.length > 0, 'expected at least one bin entry');
  for (const rel of bins) {
    const file = path.join(root, rel);
    assert.ok(fs.existsSync(file), `missing bin target: ${rel}`);
    // node --check throws on a syntax error.
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    const firstLine = fs.readFileSync(file, 'utf8').split('\n')[0];
    assert.ok(firstLine.startsWith('#!'), `bin ${rel} is missing a shebang`);
  }
});

test('every file in the publish whitelist exists', () => {
  for (const rel of pkg.files || []) {
    assert.ok(fs.existsSync(path.join(root, rel)), `missing published file: ${rel}`);
  }
});

test('config.json is valid JSON', () => {
  JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
});

test('server.json version matches package.json version', () => {
  const server = JSON.parse(fs.readFileSync(path.join(root, 'server.json'), 'utf8'));
  assert.strictEqual(server.version, pkg.version, 'server.json/package.json version drift');
  const npmPkg = (server.packages || []).find((p) => p.registry_type === 'npm');
  assert.ok(npmPkg, 'server.json is missing an npm package entry');
  assert.strictEqual(npmPkg.identifier, pkg.name, 'server.json npm identifier must match package name');
  assert.strictEqual(npmPkg.version, pkg.version, 'server.json npm package version drift');
});

test('package is publishable (not private)', () => {
  assert.notStrictEqual(pkg.private, true, 'package.json is marked private');
  assert.ok(pkg.license, 'package.json is missing a license');
});

console.log(`\n${passed} check(s) passed.`);
