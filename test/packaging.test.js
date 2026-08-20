// Packaging smoke tests — safe (no network, no browser launch).
// These guard the npm listing/publish path: they verify the manifest is
// coherent and every declared entry point actually exists and is executable.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('package is publishable (not private, has name and semver version)', () => {
  assert.ok(!pkg.private, 'package.json must not be private to be listable on npm');
  assert.match(pkg.name, /^[a-z0-9][a-z0-9._-]*$/, 'name must be a valid npm package name');
  assert.match(pkg.version, /^\d+\.\d+\.\d+/, 'version must be semver');
  assert.ok(pkg.license, 'a license is required for listing');
  assert.ok(pkg.description, 'a description helps discoverability');
});

test('LICENSE file exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'LICENSE')), 'LICENSE file must exist');
});

test('every bin entry points to an existing executable file with a node shebang', () => {
  assert.ok(pkg.bin && Object.keys(pkg.bin).length > 0, 'at least one bin entry expected');
  for (const [name, rel] of Object.entries(pkg.bin)) {
    const abs = path.join(root, rel);
    assert.ok(fs.existsSync(abs), `bin "${name}" -> missing file ${rel}`);
    const firstLine = fs.readFileSync(abs, 'utf8').split('\n', 1)[0];
    assert.match(firstLine, /^#!.*node/, `bin "${name}" (${rel}) must start with a node shebang`);
  }
});

test('every file in the "files" whitelist exists', () => {
  assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0, '"files" whitelist expected');
  for (const rel of pkg.files) {
    assert.ok(fs.existsSync(path.join(root, rel)), `"files" entry "${rel}" does not exist`);
  }
});
