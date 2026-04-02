#!/usr/bin/env node

/**
 * Synchronized version management for the neozipkit monorepo.
 *
 * Updates the version in:
 *   - Root package.json
 *   - packages/neozipkit/package.json
 *   - packages/neozip-blockchain/package.json  (version + peerDependencies.neozipkit)
 *
 * Usage:
 *   node scripts/version-sync.js patch        # 0.7.0 → 0.7.1
 *   node scripts/version-sync.js minor        # 0.7.0 → 0.8.0
 *   node scripts/version-sync.js major        # 0.7.0 → 1.0.0
 *   node scripts/version-sync.js 1.2.3        # explicit version
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const PACKAGE_FILES = [
  path.join(ROOT, 'package.json'),
  path.join(ROOT, 'packages', 'neozipkit', 'package.json'),
  path.join(ROOT, 'packages', 'neozip-blockchain', 'package.json'),
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function bumpVersion(current, type) {
  const parts = current.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid current version: ${current}`);
  }
  switch (type) {
    case 'patch': return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    case 'minor': return `${parts[0]}.${parts[1] + 1}.0`;
    case 'major': return `${parts[0] + 1}.0.0`;
    default: throw new Error(`Unknown bump type: ${type}`);
  }
}

function isExplicitVersion(str) {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(str);
}

// ── Main ──────────────────────────────────────────────────────────────────

const arg = process.argv[2];

if (!arg) {
  const rootPkg = readJson(PACKAGE_FILES[0]);
  console.log(`Current version: ${rootPkg.version}`);
  console.log('\nUsage:');
  console.log('  node scripts/version-sync.js patch');
  console.log('  node scripts/version-sync.js minor');
  console.log('  node scripts/version-sync.js major');
  console.log('  node scripts/version-sync.js <semver>');
  process.exit(0);
}

const rootPkg = readJson(PACKAGE_FILES[0]);
const currentVersion = rootPkg.version;

let newVersion;
if (['patch', 'minor', 'major'].includes(arg)) {
  newVersion = bumpVersion(currentVersion, arg);
} else if (isExplicitVersion(arg)) {
  newVersion = arg;
} else {
  console.error(`Error: "${arg}" is not patch, minor, major, or a valid semver string.`);
  process.exit(1);
}

console.log(`Bumping version: ${currentVersion} → ${newVersion}\n`);

for (const filePath of PACKAGE_FILES) {
  const pkg = readJson(filePath);
  pkg.version = newVersion;

  // Update peerDependencies.neozipkit in neozip-blockchain
  if (pkg.peerDependencies && pkg.peerDependencies.neozipkit !== undefined) {
    pkg.peerDependencies.neozipkit = `^${newVersion}`;
  }

  writeJson(filePath, pkg);
  const rel = path.relative(ROOT, filePath);
  console.log(`  Updated ${rel} → ${newVersion}`);
}

console.log(`\nDone. Next steps:`);
console.log(`  git add -A && git commit -m "release: v${newVersion}"`);
console.log(`  git tag v${newVersion}`);
console.log(`  git push origin dev --tags`);
