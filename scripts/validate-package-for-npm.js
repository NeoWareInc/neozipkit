#!/usr/bin/env node
/**
 * Fail npm pack/publish if package.json still contains Yarn workspace: protocol
 * in dependency fields that consumers resolve (dependencies, peerDependencies, optionalDependencies).
 *
 * npm publish does not rewrite workspace:* — only Yarn's pack/publish does.
 * Run via prepack in publishable workspace packages.
 */

const fs = require('fs');
const path = require('path');

const pkgPath = path.join(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];

function hasWorkspaceProtocol(value) {
  return typeof value === 'string' && value.startsWith('workspace:');
}

const problems = [];

for (const field of FIELDS) {
  const block = pkg[field];
  if (!block || typeof block !== 'object') continue;
  for (const [name, version] of Object.entries(block)) {
    if (hasWorkspaceProtocol(version)) {
      problems.push(`${field}.${name} = "${version}"`);
    }
  }
}

if (problems.length > 0) {
  console.error(`\n❌ ${pkg.name}: cannot publish to npm with workspace: dependencies:\n`);
  for (const p of problems) {
    console.error(`   - ${p}`);
  }
  console.error(
    '\nUse a semver range (e.g. "^0.8.0") in peerDependencies; devDependencies may use the same range.\n' +
      'pnpm links the local workspace when versions match (see root .npmrc link-workspace-packages).\n'
  );
  process.exit(1);
}

console.log(`✅ ${pkg.name}: package.json is safe for npm publish (no workspace: in consumer deps).`);
