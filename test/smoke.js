#!/usr/bin/env node
/**
 * Smoke test: verifies that every shipped entry point parses cleanly
 * (`node --check`) so a broken build can never be published. Intentionally
 * dependency-free so it runs in CI before `npm publish` without a full install.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const files = [
  'browser-cli.js',
  'tui-browser.js',
  'mcp-server.js',
  'src/credentials/CredentialProvider.js',
  'src/credentials/KeepassXCProvider.js',
  'src/credentials/BitwardenProvider.js',
  'src/credentials/BrowserPasswordImporter.js',
  'examples/browser-import-example.js',
];

let failed = 0;
for (const rel of files) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error(`MISSING  ${rel}`);
    failed++;
    continue;
  }
  try {
    execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
    console.log(`ok       ${rel}`);
  } catch (e) {
    console.error(`SYNTAX   ${rel}`);
    console.error(String(e.stderr || e.message));
    failed++;
  }
}

// Sanity-check that package.json bin targets exist and are executable entry points.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const [name, target] of Object.entries(pkg.bin || {})) {
  const abs = path.join(root, target);
  if (!fs.existsSync(abs)) {
    console.error(`BIN      "${name}" -> ${target} does not exist`);
    failed++;
  } else {
    console.log(`ok       bin ${name} -> ${target}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} smoke check(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
