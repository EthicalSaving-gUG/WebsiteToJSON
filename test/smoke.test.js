'use strict';

// Lightweight, network-free smoke tests that verify the published package is
// well-formed: every declared `bin` entry must exist, be executable as a Node
// script (shebang present), and parse without syntax errors.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('package.json is publishable', () => {
  assert.ok(pkg.name && pkg.name !== 'temp', 'name must be set and not the placeholder "temp"');
  assert.notStrictEqual(pkg.private, true, 'private must not be true for a published package');
  assert.ok(pkg.license, 'license must be declared');
  assert.ok(pkg.version, 'version must be declared');
});

test('LICENSE file exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'LICENSE')), 'LICENSE file should be present');
});

for (const [name, rel] of Object.entries(pkg.bin || {})) {
  test(`bin "${name}" -> ${rel} exists, has shebang, and parses`, () => {
    const file = path.join(root, rel);
    assert.ok(fs.existsSync(file), `${rel} should exist`);

    const firstLine = fs.readFileSync(file, 'utf8').split('\n', 1)[0];
    assert.match(firstLine, /^#!.*node/, `${rel} should start with a node shebang`);

    // `node --check` parses the file without executing it.
    assert.doesNotThrow(
      () => execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }),
      `${rel} should parse without syntax errors`
    );
  });
}
