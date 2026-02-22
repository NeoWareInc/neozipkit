#!/usr/bin/env node

/**
 * Check npm auth before publish. Exits 1 with clear instructions if not logged in.
 */

const { execSync, spawnSync } = require('child_process');

function npmWhoami() {
  try {
    execSync('npm whoami', { stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

if (!npmWhoami()) {
  console.error('');
  console.error('❌ Not logged in to npm. Publish would fail with 404.');
  console.error('');
  console.error('Do this:');
  console.error('  1. Run:  npm login');
  console.error('  2. Enter your npm username, password, and (if asked) email.');
  console.error('  3. If you use 2FA, enter the one-time code when prompted.');
  console.error('  4. Then run:  yarn release');
  console.error('');
  console.error('Or run:  npm login   then  npm publish --access public');
  console.error('');
  process.exit(1);
}

console.log('✅ npm auth OK');
process.exit(0);
