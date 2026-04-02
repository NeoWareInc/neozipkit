#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Paths
const browserJsPath = path.join(__dirname, '../dist/browser/index.js');
const browserJsOutput = path.join(__dirname, '../dist/browser.js');
const browserDtsPath = path.join(__dirname, '../dist/browser/index.d.ts');
const browserDtsOutput = path.join(__dirname, '../dist/browser.d.ts');

// Replacement patterns for JavaScript
const jsReplacements = [
  [/require\("\.\.\/core"\)/g, 'require("./core")'],
  [/require\("\.\.\/Zipkit"\)/g, 'require("./Zipkit")'],
  [/require\("\.\.\/ZipEntry"\)/g, 'require("./ZipEntry")'],
  [/require\("\.\/ZipkitBrowser"\)/g, 'require("./browser/ZipkitBrowser")'],
  [/require\("\.\.\/components\//g, 'require("./components/'],
  [/require\("\.\.\/encryption\//g, 'require("./encryption/'],
  [/require\("\.\.\/types"\)/g, 'require("./types")'],
  [/require\("\.\.\/constants\//g, 'require("./constants/'],
  [/require\("\.\.\/version"\)/g, 'require("./version")'],
];

// Replacement patterns for TypeScript (handle both single and double quotes)
const tsReplacements = [
  [/from ["']\.\.\/core["']/g, 'from "./core"'],
  [/from ["']\.\.\/Zipkit["']/g, 'from "./Zipkit"'],
  [/from ["']\.\.\/ZipEntry["']/g, 'from "./ZipEntry"'],
  [/from ["']\.\/ZipkitBrowser["']/g, 'from "./browser/ZipkitBrowser"'],
  [/from ["']\.\.\/components\//g, 'from "./components/'],
  [/from ["']\.\.\/encryption\//g, 'from "./encryption/'],
  [/from ["']\.\.\/types["']/g, 'from "./types"'],
  [/from ["']\.\.\/constants\//g, 'from "./constants/'],
  [/from ["']\.\.\/version["']/g, 'from "./version"'],
];

function applyReplacements(content, replacements) {
  let result = content;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

try {
  // Process JavaScript file
  if (!fs.existsSync(browserJsPath)) {
    console.error(`Error: ${browserJsPath} does not exist`);
    process.exit(1);
  }
  
  let jsContent = fs.readFileSync(browserJsPath, 'utf8');
  jsContent = applyReplacements(jsContent, jsReplacements);
  fs.writeFileSync(browserJsOutput, jsContent, 'utf8');
  console.log(`✅ Created ${browserJsOutput}`);

  // Process TypeScript definitions file
  if (!fs.existsSync(browserDtsPath)) {
    console.error(`Error: ${browserDtsPath} does not exist`);
    process.exit(1);
  }
  
  let dtsContent = fs.readFileSync(browserDtsPath, 'utf8');
  dtsContent = applyReplacements(dtsContent, tsReplacements);
  fs.writeFileSync(browserDtsOutput, dtsContent, 'utf8');
  console.log(`✅ Created ${browserDtsOutput}`);

  console.log('✅ Browser entry files created successfully');
} catch (error) {
  console.error('❌ Error creating browser entry files:', error);
  process.exit(1);
}

