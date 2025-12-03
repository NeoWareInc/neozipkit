#!/usr/bin/env node

/**
 * Dev Clean Script - Cross-platform dev-dist cleanup
 * Removes dev-dist/ directory
 * Compatible with all platforms (Linux, macOS, Windows, Vercel)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DEV_DIST_DIR = path.join(ROOT_DIR, 'dev-dist');

// Remove directory recursively
function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`✅ Removed: ${dirPath}`);
    } catch (error) {
      console.error(`❌ Error removing ${dirPath}:`, error.message);
      process.exit(1);
    }
  } else {
    console.log(`ℹ️  Directory does not exist: ${dirPath}`);
  }
}

// Main cleanup function
function main() {
  console.log('🧹 Cleaning dev-dist...\n');
  removeDir(DEV_DIST_DIR);
  console.log('\n✅ Dev cleanup complete!');
}

if (require.main === module) {
  main();
}

module.exports = { main };

