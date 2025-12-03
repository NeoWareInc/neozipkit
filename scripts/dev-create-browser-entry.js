#!/usr/bin/env node

/**
 * Dev Create Browser Entry Script - Cross-platform file copying
 * Copies browser entry files for dev builds
 * Compatible with all platforms (Linux, macOS, Windows, Vercel)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

// Paths
const devDistBrowserJsPath = path.join(ROOT_DIR, 'dev-dist/browser/index.js');
const devDistBrowserJsOutput = path.join(ROOT_DIR, 'dev-dist/browser.js');
const devDistBrowserDtsPath = path.join(ROOT_DIR, 'dev-dist/browser/index.d.ts');
const devDistBrowserDtsOutput = path.join(ROOT_DIR, 'dev-dist/browser.d.ts');

// Copy file
function copyFile(source, destination) {
  try {
    if (!fs.existsSync(source)) {
      console.error(`❌ Error: ${source} does not exist`);
      process.exit(1);
    }
    
    // Ensure destination directory exists
    const destDir = path.dirname(destination);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.copyFileSync(source, destination);
    console.log(`✅ Created ${destination}`);
  } catch (error) {
    console.error(`❌ Error copying ${source} to ${destination}:`, error.message);
    process.exit(1);
  }
}

// Main function
function main() {
  try {
    // Copy JavaScript file
    copyFile(devDistBrowserJsPath, devDistBrowserJsOutput);
    
    // Copy TypeScript definitions file
    copyFile(devDistBrowserDtsPath, devDistBrowserDtsOutput);
    
    console.log('✅ Dev browser entry files created successfully');
  } catch (error) {
    console.error('❌ Error creating dev browser entry files:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };

