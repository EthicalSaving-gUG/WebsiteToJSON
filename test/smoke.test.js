'use strict';

// Network-free smoke tests that run in CI before publishing.
// They validate that every published entry point parses, that the
// package.json `bin` targets exist, and that the MCP manifest is sane.

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

const entryPoints = ['browser-cli.js', 'tui-browser.js', 'mcp-server.js'];

for (const entry of entryPoints) {
  test(`${entry} is syntactically valid`, () => {
    // `node --check` parses the file without executing it, so the
    // self-starting MCP server never opens a stdio transport here.
    execFileSync(process.execPath, ['--check', path.join(root, entry)]);
  });
}

test('package.json bin targets exist and are executable entry points', () => {
  assert.ok(pkg.bin && typeof pkg.bin === 'object', 'bin map is missing');
  for (const [name, target] of Object.entries(pkg.bin)) {
    const full = path.join(root, target);
    assert.ok(fs.existsSync(full), `bin "${name}" -> ${target} does not exist`);
    const firstLine = fs.readFileSync(full, 'utf8').split('\n', 1)[0];
    assert.ok(firstLine.startsWith('#!'), `bin "${name}" -> ${target} is missing a shebang`);
  }
});

test('every file listed in package.json "files" exists', () => {
  for (const entry of pkg.files) {
    const full = path.join(root, entry);
    assert.ok(fs.existsSync(full), `files entry "${entry}" does not exist`);
  }
});

test('server.json MCP manifest matches the published npm package', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'server.json'), 'utf8')
  );
  assert.equal(manifest.version, pkg.version, 'server.json version is out of sync with package.json');
  const npmPkg = manifest.packages.find((p) => p.registryType === 'npm');
  assert.ok(npmPkg, 'server.json has no npm package entry');
  assert.equal(npmPkg.identifier, pkg.name, 'server.json npm identifier must match package name');
  assert.equal(npmPkg.version, pkg.version, 'server.json npm version is out of sync with package.json');
  assert.equal(npmPkg.transport.type, 'stdio');
});
