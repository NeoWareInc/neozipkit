#!/usr/bin/env node

/**
 * Pre-commit Git Hook
 * Prevents commits that modify /dist on non-dev branches
 */

const { execSync } = require('child_process');
const { getCurrentBranch, isMainBranch } = require('./check-branch');

function getStagedFiles() {
  try {
    const files = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    return files.trim().split('\n').filter(f => f.length > 0);
  } catch (error) {
    console.error('Error getting staged files:', error.message);
    return [];
  }
}

function hasDistChanges(files) {
  return files.some(file => file.startsWith('dist/'));
}

function main() {
  const currentBranch = getCurrentBranch();
  
  if (!currentBranch) {
    console.error('❌ Could not determine current branch');
    process.exit(1);
  }

  // Allow dist changes on main branches only
  if (isMainBranch(currentBranch)) {
    return;
  }

  const stagedFiles = getStagedFiles();
  
  if (hasDistChanges(stagedFiles)) {
    console.error('❌ COMMIT BLOCKED: Cannot commit changes to /dist on non-main branch');
    console.error(`   Current branch: ${currentBranch}`);
    console.error('   Only main/master branches can modify /dist');
    console.error('   Files with /dist changes:', stagedFiles.filter(f => f.startsWith('dist/')));
    console.error('');
    console.error('💡 Solutions:');
    console.error('   1. Switch to main branch: git checkout main');
    console.error('   2. Use dev build: yarn dev:build');
    console.error('   3. Unstage dist files: git reset HEAD dist/');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
