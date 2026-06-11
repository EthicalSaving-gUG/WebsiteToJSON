'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const binaries = ['tui-browser.js', 'browser-cli.js', 'mcp-server.js'];

test('all entry-point scripts exist', () => {
  for (const file of binaries) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} should exist`);
  }
});

test('all entry-point scripts start with a node shebang', () => {
  for (const file of binaries) {
    const firstLine = fs.readFileSync(path.join(root, file), 'utf8').split('\n')[0].trim();
    assert.strictEqual(firstLine, '#!/usr/bin/env node', `${file} should declare a node shebang`);
  }
});

test('all entry-point scripts are syntactically valid', () => {
  for (const file of binaries) {
    // `node --check` parses without executing; throws on syntax errors.
    execFileSync(process.execPath, ['--check', path.join(root, file)]);
  }
});

test('package.json exposes the expected bin entries', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(!pkg.private, 'package must be publishable (private must be unset)');
  assert.deepStrictEqual(Object.keys(pkg.bin).sort(), ['dos-browser', 'dos-browser-cli', 'dos-browser-mcp']);
  for (const target of Object.values(pkg.bin)) {
    assert.ok(binaries.includes(target), `${target} should be a known entry point`);
  }
});

test('server.json is a valid MCP registry manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'server.json'), 'utf8'));
  assert.ok(manifest.name && manifest.name.includes('/'), 'name must be reverse-DNS with a path');
  assert.ok(Array.isArray(manifest.packages) && manifest.packages.length > 0, 'must declare packages');
  assert.strictEqual(manifest.packages[0].identifier, 'dos-browser');
});
