'use strict';

// Lightweight smoke tests that run under `node --test` with zero extra
// dependencies. They guard the published entry points without launching the
// long-running servers/UIs (mcp-server.js connects a stdio transport on load,
// so it is syntax-checked in a child process rather than required directly).

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const entryPoints = ['browser-cli.js', 'tui-browser.js', 'mcp-server.js'];

test('all CLI/MCP entry points are syntactically valid', () => {
  for (const file of entryPoints) {
    const full = path.join(root, file);
    assert.ok(fs.existsSync(full), `missing entry point: ${file}`);
    // `node --check` parses the file without executing it.
    execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' });
  }
});

test('package.json is publishable (named, public, has bins)', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  );
  assert.notStrictEqual(pkg.name, 'temp', 'package name must be set');
  assert.notStrictEqual(pkg.private, true, 'package must not be private');
  assert.ok(pkg.license, 'a license must be declared');
  for (const file of entryPoints) {
    assert.ok(
      Object.values(pkg.bin).includes(file),
      `bin should expose ${file}`
    );
    assert.ok(pkg.files.includes(file), `files should ship ${file}`);
  }
});

test('declared bin/files targets exist on disk', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  );
  for (const file of pkg.files) {
    assert.ok(
      fs.existsSync(path.join(root, file)),
      `files entry does not exist: ${file}`
    );
  }
});
