#!/usr/bin/env node
'use strict';

/**
 * Dependency-free smoke test.
 *
 * Runs in CI (`npm test`) before publishing, so it must not require network
 * access, a display, or any third-party packages. It validates that the
 * published surface of the package is internally consistent: the manifest is
 * valid, every advertised `bin` points at a real, executable Node entrypoint,
 * and the bundled config parses.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('DOS Browser smoke test\n');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

check('package.json declares a public, named package', () => {
  assert.strictEqual(pkg.name, 'dos-browser', 'name should be "dos-browser"');
  assert.ok(pkg.version, 'version is required');
  assert.notStrictEqual(pkg.private, true, 'package must not be private to publish');
  assert.ok(pkg.license, 'license is required');
  assert.ok(pkg.description, 'description is required');
});

check('every bin entry points at an executable Node script', () => {
  assert.ok(pkg.bin && Object.keys(pkg.bin).length > 0, 'bin entries are required');
  for (const [name, rel] of Object.entries(pkg.bin)) {
    const file = path.join(root, rel);
    assert.ok(fs.existsSync(file), `bin "${name}" -> missing file ${rel}`);
    const firstLine = fs.readFileSync(file, 'utf8').split('\n', 1)[0];
    assert.ok(
      firstLine.startsWith('#!') && firstLine.includes('node'),
      `bin "${name}" (${rel}) must start with a Node shebang`
    );
  }
});

check('all published files exist on disk', () => {
  for (const rel of pkg.files || []) {
    assert.ok(fs.existsSync(path.join(root, rel)), `listed in "files" but missing: ${rel}`);
  }
});

check('bundled config.json is valid JSON', () => {
  JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
});

check('MCP registry server.json is valid and version-aligned', () => {
  const server = JSON.parse(fs.readFileSync(path.join(root, 'server.json'), 'utf8'));
  assert.strictEqual(
    server.version,
    pkg.version,
    'server.json version must match package.json version'
  );
  const npmPkg = (server.packages || []).find((p) => p.registryType === 'npm');
  assert.ok(npmPkg, 'server.json must list an npm package');
  assert.strictEqual(npmPkg.identifier, pkg.name, 'server.json npm identifier must match package name');
});

if (process.exitCode === 1) {
  console.error('\nSmoke test FAILED.');
} else {
  console.log(`\nAll ${passed} checks passed.`);
}
