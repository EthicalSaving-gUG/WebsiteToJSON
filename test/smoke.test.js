'use strict';

// Lightweight smoke tests that run in CI (`npm test`) before the package is
// published. They verify that every shipped entrypoint is syntactically valid
// and that the packaging/listing metadata is well formed, without launching a
// browser or reaching the network.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

const ENTRYPOINTS = ['browser-cli.js', 'tui-browser.js', 'mcp-server.js'];

test('all CLI/MCP entrypoints parse without syntax errors', () => {
  for (const file of ENTRYPOINTS) {
    const full = path.join(root, file);
    assert.ok(fs.existsSync(full), `${file} should exist`);
    // `node --check` parses the file without executing it.
    execFileSync(process.execPath, ['--check', full]);
  }
});

test('every entrypoint has a node shebang', () => {
  for (const file of ENTRYPOINTS) {
    const firstLine = fs.readFileSync(path.join(root, file), 'utf8').split('\n', 1)[0];
    assert.equal(firstLine, '#!/usr/bin/env node', `${file} should start with a node shebang`);
  }
});

test('package.json exposes valid npm listing metadata', () => {
  const pkg = require(path.join(root, 'package.json'));
  assert.equal(pkg.name, 'dos-browser');
  assert.ok(pkg.description && pkg.description.length > 20, 'has a real description');
  assert.ok(Array.isArray(pkg.keywords) && pkg.keywords.length > 0, 'has keywords');
  assert.ok(pkg.license, 'declares a license');
  assert.notEqual(pkg.private, true, 'must not be private to be publishable');

  // Every declared bin target must point at an existing, shipped file.
  assert.ok(pkg.bin && Object.keys(pkg.bin).length > 0, 'declares bin entries');
  for (const [name, target] of Object.entries(pkg.bin)) {
    assert.ok(fs.existsSync(path.join(root, target)), `bin "${name}" -> ${target} exists`);
  }

  // The test runner itself must be wired up.
  assert.ok(pkg.scripts && pkg.scripts.test, 'has a test script');
});

test('server.json is a valid MCP registry manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'server.json'), 'utf8'));
  assert.ok(manifest.name, 'has a reverse-DNS name');
  assert.ok(manifest.description, 'has a description');
  assert.ok(manifest.version, 'has a version');
  assert.ok(Array.isArray(manifest.packages) && manifest.packages.length > 0, 'lists packages');

  const pkg = require(path.join(root, 'package.json'));
  assert.equal(manifest.name, pkg.mcpName, 'server.json name matches package.json mcpName');
  assert.equal(manifest.version, pkg.version, 'server.json version matches package.json version');
});

test('LICENSE file is present', () => {
  assert.ok(fs.existsSync(path.join(root, 'LICENSE')), 'LICENSE file exists');
});
