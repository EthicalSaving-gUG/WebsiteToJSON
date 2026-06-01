#!/usr/bin/env node
/**
 * Smoke test for the dos-browser package.
 *
 * Network-free and dependency-free: it validates that the package is
 * publishable and that every advertised entry point is present and well-formed.
 * This runs in the `build` job of the npm-publish workflow before publishing.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL - ${name}: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

check('package.json has a publishable name', () => {
  assert(pkg.name && pkg.name !== 'temp', `invalid package name: ${pkg.name}`);
  assert(!pkg.private, 'package is marked private and cannot be published');
});

check('package.json has version, license and description', () => {
  assert(/^\d+\.\d+\.\d+/.test(pkg.version), `invalid version: ${pkg.version}`);
  assert(pkg.license, 'missing license');
  assert(pkg.description && pkg.description.length > 10, 'missing description');
});

check('LICENSE file exists', () => {
  assert(fs.existsSync(path.join(root, 'LICENSE')), 'LICENSE file is missing');
});

check('every bin entry exists, has a shebang and parses', () => {
  const bins = pkg.bin || {};
  assert(Object.keys(bins).length > 0, 'no bin entries declared');
  for (const [name, rel] of Object.entries(bins)) {
    const file = path.join(root, rel);
    assert(fs.existsSync(file), `bin "${name}" -> ${rel} does not exist`);
    const firstLine = fs.readFileSync(file, 'utf8').split('\n', 1)[0];
    assert(firstLine.startsWith('#!'), `bin "${name}" is missing a shebang`);
    // node --check throws on syntax errors and returns a non-zero exit code.
    require('child_process').execFileSync(process.execPath, ['--check', file], {
      stdio: 'pipe',
    });
  }
});

check('every file in the "files" allowlist exists', () => {
  for (const entry of pkg.files || []) {
    const clean = entry.replace(/\/$/, '');
    assert(fs.existsSync(path.join(root, clean)), `listed file/dir is missing: ${entry}`);
  }
});

if (failures > 0) {
  console.error(`\n${failures} smoke test(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoke tests passed.');
