#!/usr/bin/env node
/**
 * Offline smoke tests for the dos-browser suite.
 *
 * These run in CI (and gate the npm publish workflow), so they must not make
 * any network calls. They verify that every published entry point is present,
 * has a CLI shebang, parses without syntax errors, and that the package
 * metadata is actually publishable to a registry.
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

let failures = 0;
function check(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failures++;
        console.error(`  ✗ ${name}\n      ${e.message}`);
    }
}

console.log('dos-browser smoke tests\n');

// 1. Package metadata must be publishable to npm.
check('package is publishable (named, versioned, not private)', () => {
    assert(pkg.name && pkg.name !== 'temp', 'package needs a real name');
    assert(pkg.version, 'package needs a version');
    assert(pkg.license, 'package needs a license');
    assert(pkg.private !== true, 'package must not be marked private to publish');
});

// 2. Every declared bin must exist, be executable as a CLI, and parse cleanly.
assert(pkg.bin && Object.keys(pkg.bin).length > 0, 'package.json should declare bins');
for (const [bin, rel] of Object.entries(pkg.bin)) {
    check(`bin "${bin}" -> ${rel} exists, has shebang, parses`, () => {
        const file = path.join(root, rel);
        assert(fs.existsSync(file), `${rel} is missing`);
        const src = fs.readFileSync(file, 'utf8');
        assert(src.startsWith('#!'), `${rel} is missing a #! shebang`);
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    });
}

// 3. Core runtime dependencies must resolve.
for (const dep of ['jsdom', '@mozilla/readability', 'dompurify']) {
    check(`dependency "${dep}" resolves`, () => {
        require.resolve(dep);
    });
}

// 4. Files promised in the `files` allowlist must exist.
for (const entry of pkg.files || []) {
    check(`shipped path "${entry}" exists`, () => {
        assert(fs.existsSync(path.join(root, entry)), `${entry} is listed in "files" but missing`);
    });
}

console.log('');
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
console.log('All smoke tests passed.');
