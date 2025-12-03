#!/usr/bin/env node

/**
 * Version Update Script for NeoZipKit
 * 
 * This script updates the package.json version and ensures all version references
 * are automatically synchronized through the dynamic version system.
 * 
 * Usage:
 *   node scripts/update-version.js [version]
 *   
 * Examples:
 *   node scripts/update-version.js 0.2.2
 *   node scripts/update-version.js 1.0.0
 *   npm run version:patch  (runs: node scripts/update-version.js patch)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get the package.json path
const packageJsonPath = path.join(__dirname, '..', 'package.json');

// Read current package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Get version argument
const versionArg = process.argv[2];

if (!versionArg) {
  console.log('Current version:', packageJson.version);
  console.log('Usage: node scripts/update-version.js [version|patch|minor|major]');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/update-version.js 0.2.2');
  console.log('  node scripts/update-version.js patch');
  console.log('  node scripts/update-version.js minor');
  console.log('  node scripts/update-version.js major');
  process.exit(0);
}

let newVersion;

if (['patch', 'minor', 'major'].includes(versionArg)) {
  // Use npm version command for semantic versioning
  try {
    execSync(`npm version ${versionArg} --no-git-tag-version`, { 
      cwd: path.dirname(packageJsonPath),
      stdio: 'pipe'
    });
    
    // Read the updated package.json
    const updatedPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    newVersion = updatedPackageJson.version;
  } catch (error) {
    console.error('Error updating version:', error.message);
    process.exit(1);
  }
} else {
  // Use provided version directly
  newVersion = versionArg;
  
  // Validate version format (basic semver check)
  if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
    console.error('Invalid version format. Use semantic versioning (e.g., 1.0.0)');
    process.exit(1);
  }
  
  // Update package.json
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}

console.log(`✅ Version updated to ${newVersion}`);
console.log('');
console.log('📋 What was updated:');
console.log('  • package.json version');
console.log('  • All version references will be automatically updated on next build');
console.log('');
console.log('🔨 Next steps:');
console.log('  • Run: npm run build');
console.log('  • Test the changes');
console.log('  • Commit and tag if ready');
console.log('');
console.log('📦 All version information now comes from package.json!');
