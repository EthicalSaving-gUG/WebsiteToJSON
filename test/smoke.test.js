#!/usr/bin/env node
/**
 * Zero-dependency smoke tests.
 *
 * These run in CI (`npm test`) before publishing. They intentionally avoid any
 * network access or heavy dependencies so they are fast and deterministic:
 *   1. Every shipped .js entry point parses (catches syntax errors before publish).
 *   2. package.json is actually publishable (real name, not private, has bin/license).
 *   3. server.json (the MCP registry manifest) is valid and consistent.
 *   4. config.json is valid JSON.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. Syntax-check every JS file we ship.
const jsEntryPoints = [
  'browser-cli.js',
  'tui-browser.js',
  'mcp-server.js',
  'src/credentials/CredentialProvider.js',
  'src/credentials/BitwardenProvider.js',
  'src/credentials/KeepassXCProvider.js',
  'src/credentials/BrowserPasswordImporter.js',
];

for (const rel of jsEntryPoints) {
  test(`parses: ${rel}`, () => {
    const file = path.join(root, rel);
    assert.ok(fs.existsSync(file), `missing file: ${rel}`);
    // Throws (non-zero exit) if the file has a syntax error.
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  });
}

// 2. package.json is publishable.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('package.json has a real name', () => {
  assert.ok(pkg.name && pkg.name !== 'temp', 'name must be set to a real value');
});

test('package.json is not private', () => {
  assert.notStrictEqual(pkg.private, true, 'private must not be true to publish');
});

test('package.json declares a license', () => {
  assert.ok(pkg.license, 'license is required');
});

test('package.json exposes bin entries', () => {
  assert.ok(pkg.bin && Object.keys(pkg.bin).length > 0, 'at least one bin entry expected');
});

test('every bin target exists and is executable JS', () => {
  for (const target of Object.values(pkg.bin)) {
    const file = path.join(root, target);
    assert.ok(fs.existsSync(file), `bin target missing: ${target}`);
    const firstLine = fs.readFileSync(file, 'utf8').split('\n', 1)[0];
    assert.ok(firstLine.startsWith('#!'), `bin target needs a shebang: ${target}`);
  }
});

// 3. server.json (MCP registry manifest) is valid.
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'server.json'), 'utf8'));

test('server.json is valid and consistent', () => {
  assert.ok(manifest.name, 'server name required');
  assert.ok(manifest.version, 'server version required');
  assert.ok(Array.isArray(manifest.packages) && manifest.packages.length > 0, 'packages required');
  assert.strictEqual(
    manifest.version,
    pkg.version,
    'server.json version should match package.json version',
  );
  const npmPkg = manifest.packages.find((p) => p.registryType === 'npm');
  assert.ok(npmPkg, 'an npm package entry is expected');
  assert.strictEqual(npmPkg.identifier, pkg.name, 'npm identifier should match package name');
});

test('server.json description fits the registry schema (<= 100 chars)', () => {
  assert.ok(
    manifest.description.length <= 100,
    `description is ${manifest.description.length} chars, schema max is 100`,
  );
});

test('package.json mcpName matches the server manifest name (registry verification)', () => {
  assert.strictEqual(pkg.mcpName, manifest.name, 'mcpName must equal server.json name');
});

test('npx --package runtime arg is pinned to the manifest version', () => {
  const npmPkg = manifest.packages.find((p) => p.registryType === 'npm');
  const pkgArg = (npmPkg.runtimeArguments || []).find((a) => a.name === '--package');
  assert.ok(pkgArg, 'a --package runtime argument is expected');
  assert.strictEqual(
    pkgArg.value,
    `${pkg.name}@${pkg.version}`,
    'pinned --package spec should be name@version so old registry entries do not run latest',
  );
});

// 4. config.json is valid JSON.
test('config.json is valid JSON', () => {
  JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
});

if (process.exitCode) {
  console.error('\nSmoke tests failed.');
} else {
  console.log(`\nAll ${passed} smoke tests passed.`);
}
