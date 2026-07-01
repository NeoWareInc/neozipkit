#!/usr/bin/env node

/**
 * Auto Build Script
 * Automatically chooses the correct build based on current branch
 * - main/master branches → build to /dist
 * - all other branches → build to /dev-dist
 */

const { getCurrentBranch, isMainBranch } = require('./check-branch');
const { execSync } = require('child_process');

function main() {
  const currentBranch = getCurrentBranch();
  
  if (!currentBranch) {
    console.error('❌ Could not determine current branch');
    process.exit(1);
  }

  console.log(`🌿 Current branch: ${currentBranch}`);

  // Check if we're in CI environment
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  
  // In CI: enforce branch protection
  // Locally: allow builds on any branch
  if (isCI && !isMainBranch(currentBranch)) {
    console.log('🔧 Non-main branch in CI - building to /dev-dist');
    console.log('🚀 Running: pnpm dev:build');
    execSync('pnpm dev:build', { stdio: 'inherit' });
  } else {
    // Local builds or main branch: build to /dist
    if (isMainBranch(currentBranch)) {
      console.log('✅ Main branch detected - building to /dist');
    } else {
      console.log('🔧 Local build on feature branch - building to /dist');
      console.log('💡 In CI, non-main branches would build to /dev-dist');
    }
    console.log('🚀 Running: pnpm build');
    execSync('pnpm build', { stdio: 'inherit' });
  }
}

if (require.main === module) {
  main();
}
