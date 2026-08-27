#!/usr/bin/env node
/*
 * Lightweight smoke test — no test framework required.
 * Runs in CI (`npm test`) before publishing.
 *
 *   1. Syntax-checks every shipped JS entry point with `node --check`.
 *   2. Verifies package.json metadata needed for a clean npm listing.
 *   3. Confirms each `bin` target exists and starts with a shebang.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

console.log('DOS Browser smoke tests\n');

// 1. Syntax-check the shipped entry points and credential providers.
const jsFiles = [
    'browser-cli.js',
    'tui-browser.js',
    'mcp-server.js',
    'src/credentials/CredentialProvider.js',
    'src/credentials/KeepassXCProvider.js',
    'src/credentials/BitwardenProvider.js',
    'src/credentials/BrowserPasswordImporter.js',
];

// The CLIs are CommonJS; the credential providers are ES modules. Detect the
// module kind from the source so each is syntax-checked under the right parser.
function syntaxCheck(abs) {
    const src = fs.readFileSync(abs, 'utf8');
    const isEsm = /^\s*(import|export)\s/m.test(src);
    if (isEsm) {
        execFileSync(process.execPath, ['--check', '--input-type=module', '-'], {
            input: src,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    } else {
        execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
    }
}

for (const rel of jsFiles) {
    check(`syntax: ${rel}`, () => {
        const abs = path.join(root, rel);
        if (!fs.existsSync(abs)) throw new Error('file not found');
        syntaxCheck(abs);
    });
}

// 2. Validate package.json metadata required for a healthy npm listing.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

check('package.json: is publishable (not private)', () => {
    if (pkg.private) throw new Error('"private": true blocks publishing');
});

for (const field of ['name', 'version', 'description', 'license', 'repository']) {
    check(`package.json: has ${field}`, () => {
        if (!pkg[field]) throw new Error(`missing "${field}"`);
    });
}

check('package.json: has keywords for discoverability', () => {
    if (!Array.isArray(pkg.keywords) || pkg.keywords.length === 0) {
        throw new Error('no keywords');
    }
});

// 3. Every bin target must exist and be an executable script (shebang).
check('package.json: declares bin entries', () => {
    if (!pkg.bin || Object.keys(pkg.bin).length === 0) throw new Error('no bin entries');
});

for (const [cmd, rel] of Object.entries(pkg.bin || {})) {
    check(`bin "${cmd}" -> ${rel} exists and is executable`, () => {
        const abs = path.join(root, rel);
        if (!fs.existsSync(abs)) throw new Error('bin target not found');
        const firstLine = fs.readFileSync(abs, 'utf8').split('\n', 1)[0];
        if (!firstLine.startsWith('#!')) throw new Error('bin target has no shebang');
    });
}

// 4. LICENSE file must ship with the package.
check('LICENSE file present', () => {
    if (!fs.existsSync(path.join(root, 'LICENSE'))) throw new Error('LICENSE missing');
});

console.log('');
if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
}
console.log('All smoke tests passed.');
