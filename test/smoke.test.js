'use strict';

// Offline smoke tests: validate that the published package is structurally sound
// (entry points exist, bins are executable scripts, metadata files parse, and the
// MCP registry listing stays in sync with package.json). These run in CI before
// publish without making any network calls.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const readJSON = (p) => JSON.parse(read(p));

const pkg = readJSON('package.json');

test('package metadata is publishable', () => {
  assert.strictEqual(pkg.name, 'dos-browser');
  assert.ok(!pkg.private, 'package must not be private to publish to npm');
  assert.ok(pkg.description && pkg.description.length > 10, 'needs a description');
  assert.ok(pkg.license, 'needs a license');
  assert.ok(pkg.repository && pkg.repository.url, 'needs a repository');
});

test('every bin entry points to an existing executable script', () => {
  const bins = pkg.bin || {};
  assert.ok(Object.keys(bins).length >= 1, 'expected at least one bin');
  for (const [name, rel] of Object.entries(bins)) {
    const target = path.join(root, rel);
    assert.ok(fs.existsSync(target), `bin "${name}" -> ${rel} is missing`);
    const firstLine = read(rel).split('\n', 1)[0];
    assert.ok(firstLine.startsWith('#!'), `bin "${name}" (${rel}) needs a shebang`);
  }
});

test('every file in the "files" allow-list exists', () => {
  for (const entry of pkg.files || []) {
    const clean = entry.replace(/\/$/, '');
    assert.ok(fs.existsSync(path.join(root, clean)), `files entry "${entry}" is missing`);
  }
});

test('config.json is valid JSON', () => {
  assert.doesNotThrow(() => readJSON('config.json'));
});

test('server.json matches package.json for the MCP registry', () => {
  const server = readJSON('server.json');
  assert.strictEqual(server.name, pkg.mcpName, 'server.json name must equal package.json mcpName');
  assert.strictEqual(server.version, pkg.version, 'server.json version must equal package.json version');
  const npmPkg = (server.packages || []).find((p) => p.registryType === 'npm');
  assert.ok(npmPkg, 'server.json must declare an npm package');
  assert.strictEqual(npmPkg.identifier, pkg.name, 'server.json npm identifier must equal package name');
});
