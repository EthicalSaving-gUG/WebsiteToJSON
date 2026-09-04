'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

// The three executables shipped as `bin` entrypoints are CommonJS.
// `node --check` parses them without executing, catching syntax errors
// that would otherwise only surface at runtime.
const entrypoints = ['browser-cli.js', 'tui-browser.js', 'mcp-server.js'];

for (const file of entrypoints) {
  test(`${file} parses and is executable-shaped`, () => {
    const full = path.join(root, file);
    assert.ok(fs.existsSync(full), `${file} should exist`);

    const firstLine = fs.readFileSync(full, 'utf8').split('\n', 1)[0].trimEnd();
    assert.strictEqual(firstLine, '#!/usr/bin/env node', `${file} needs a node shebang`);

    // Throws (non-zero exit) if the file has a syntax error.
    execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' });
  });
}

test('package.json exposes the CLI bin entrypoints', () => {
  const pkg = require(path.join(root, 'package.json'));
  assert.ok(pkg.bin, 'package.json should declare bin entries');
  for (const target of Object.values(pkg.bin)) {
    assert.ok(fs.existsSync(path.join(root, target)), `bin target ${target} should exist`);
  }
});
