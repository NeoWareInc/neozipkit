#!/usr/bin/env node

/**
 * Clean Script - Cross-platform file cleanup
 * Removes dist/, root-level .js/.d.ts files, and generated directories
 * Compatible with all platforms (Linux, macOS, Windows, Vercel)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

// Directories to remove
const dirsToRemove = [
  'dist',
  'components',
  'constants',
  'platform',
  'types'
];

// Remove directory recursively
function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`✅ Removed: ${dirPath}`);
    } catch (error) {
      console.error(`❌ Error removing ${dirPath}:`, error.message);
    }
  }
}

// Remove file
function removeFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`✅ Removed: ${filePath}`);
    } catch (error) {
      console.error(`❌ Error removing ${filePath}:`, error.message);
    }
  }
}

// Files to preserve in root (should not be deleted)
const PRESERVED_FILES = [
  'jest.config.js',  // Jest configuration
  'scripts/clean.js' // This script itself
];

// Find and remove root-level .js and .d.ts files
function removeRootLevelFiles() {
  try {
    const files = fs.readdirSync(ROOT_DIR);
    for (const file of files) {
      const filePath = path.join(ROOT_DIR, file);
      const stat = fs.statSync(filePath);
      
      // Only process files (not directories) in root
      // Skip preserved files
      if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.d.ts'))) {
        if (!PRESERVED_FILES.includes(file)) {
          removeFile(filePath);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error reading root directory:', error.message);
  }
}

// Main cleanup function
function main() {
  console.log('🧹 Cleaning build artifacts...\n');
  
  // Remove directories
  for (const dir of dirsToRemove) {
    const dirPath = path.join(ROOT_DIR, dir);
    removeDir(dirPath);
  }
  
  // Remove root-level .js and .d.ts files
  removeRootLevelFiles();
  
  console.log('\n✅ Cleanup complete!');
}

if (require.main === module) {
  main();
}

module.exports = { main };

