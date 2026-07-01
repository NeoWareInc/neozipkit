#!/usr/bin/env node

/**
 * Branch Protection Script
 * Prevents building to /dist on non-dev branches
 */

const { execSync } = require('child_process');
const path = require('path');

function getCurrentBranch() {
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    return branch;
  } catch (error) {
    console.error('Error getting current branch:', error.message);
    return null;
  }
}

function isMainBranch(branch) {
  const mainBranches = ['main', 'master'];
  return mainBranches.includes(branch);
}

function main() {
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const refType = process.env.GITHUB_REF_TYPE; // 'branch' or 'tag' in GitHub Actions

  // When building from a tag (release publish workflow), allow build (detached HEAD has no branch)
  if (isCI && refType === 'tag') {
    console.log('✅ Tag build detected - branch protection skipped (release publish)');
    return;
  }

  const currentBranch = getCurrentBranch();

  if (!currentBranch) {
    console.error('❌ Could not determine current branch');
    process.exit(1);
  }

  console.log(`🌿 Current branch: ${currentBranch}`);

  if (!isCI) {
    console.log('✅ Local build detected - branch protection skipped');
    console.log('💡 In CI, only main/master branches can build to /dist');
    return; // Allow build to proceed locally
  }

  // CI-only protection: block non-main branches
  if (!isMainBranch(currentBranch)) {
    console.error('❌ CI BUILD PROTECTION: Cannot build to /dist on non-main branch');
    console.error(`   Current branch: ${currentBranch}`);
    console.error('   Only main/master branches can build to /dist in CI');
    console.error('');
    console.error('💡 Use dev build instead:');
    console.error('   pnpm dev:build    # Builds to dev-dist/');
    console.error('   pnpm dev:watch    # Watch mode for dev-dist/');
    process.exit(1);
  }

  console.log('✅ Branch check passed - proceeding with build');
}

if (require.main === module) {
  main();
}

module.exports = { getCurrentBranch, isMainBranch };
