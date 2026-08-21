#!/usr/bin/env node
/**
 * Offline smoke test for DOS Browser.
 *
 * Runs in CI (`npm test`) before publishing. It performs no network access:
 * it only verifies that the published entry points parse, expose a Node
 * shebang, and are wired up correctly in package.json so a broken build can
 * never reach the npm registry.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
let failures = 0;

function check(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
    } catch (err) {
        failures++;
        console.error(`  ✗ ${name}\n      ${err.message}`);
    }
}

console.log('DOS Browser smoke test\n');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// The three shipped entry points must exist, be valid JS, and be executable
// via `node`.
const entries = ['browser-cli.js', 'tui-browser.js', 'mcp-server.js'];

for (const entry of entries) {
    const file = path.join(root, entry);

    check(`${entry} exists`, () => {
        if (!fs.existsSync(file)) throw new Error('missing file');
    });

    check(`${entry} has a node shebang`, () => {
        const first = fs.readFileSync(file, 'utf8').split('\n', 1)[0];
        if (!/^#!.*node/.test(first)) throw new Error(`unexpected first line: ${first}`);
    });

    check(`${entry} parses (node --check)`, () => {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    });
}

// Every bin target declared in package.json must point at a file that exists
// and is listed in the published `files` allow-list.
check('package.json bin targets exist and are published', () => {
    const bin = pkg.bin || {};
    const files = pkg.files || [];
    for (const [cmd, target] of Object.entries(bin)) {
        if (!fs.existsSync(path.join(root, target))) {
            throw new Error(`bin "${cmd}" -> ${target} does not exist`);
        }
        if (!files.includes(target)) {
            throw new Error(`bin "${cmd}" -> ${target} is not in the "files" allow-list`);
        }
    }
});

// The package must be publishable (not marked private) and self-describing.
check('package.json is publishable and self-describing', () => {
    if (pkg.private) throw new Error('package is marked private');
    for (const field of ['name', 'version', 'description', 'license']) {
        if (!pkg[field]) throw new Error(`missing "${field}" field`);
    }
});

check('config.json is valid JSON', () => {
    JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
});

console.log('');
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
console.log('All smoke checks passed.');
