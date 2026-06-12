#!/usr/bin/env node
/**
 * Smoke test — a fast, network-free sanity check that runs in CI before publish.
 *
 * It does NOT execute the browser scripts (they read argv and start servers /
 * event loops). Instead it asserts the package is structurally publishable:
 *   - package.json exposes the documented bin entries
 *   - every bin target exists and is an executable Node script (has a shebang)
 *   - core runtime dependencies resolve and load
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failures = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  ok   - ${label}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL - ${label}\n         ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

console.log('DOS Browser smoke test');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

check('package.json declares a non-placeholder name', () => {
  assert(pkg.name && pkg.name !== 'temp', `unexpected package name: ${pkg.name}`);
});

check('package.json is publishable (not private, has license)', () => {
  assert(pkg.private !== true, 'package is marked private');
  assert(typeof pkg.license === 'string' && pkg.license.length > 0, 'missing license field');
});

check('bin entries are declared', () => {
  assert(pkg.bin && Object.keys(pkg.bin).length > 0, 'no bin entries declared');
});

for (const [name, rel] of Object.entries(pkg.bin || {})) {
  check(`bin "${name}" -> ${rel} exists and is an executable Node script`, () => {
    const target = path.join(root, rel);
    assert(fs.existsSync(target), `bin target not found: ${rel}`);
    const firstLine = fs.readFileSync(target, 'utf8').split('\n', 1)[0];
    assert(firstLine.startsWith('#!') && firstLine.includes('node'),
      `bin target ${rel} is missing a node shebang`);
  });
}

check('LICENSE file is present', () => {
  assert(fs.existsSync(path.join(root, 'LICENSE')), 'LICENSE file missing');
});

check('core dependencies resolve and load', () => {
  require('@mozilla/readability');
  require('jsdom');
  require('dompurify');
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
