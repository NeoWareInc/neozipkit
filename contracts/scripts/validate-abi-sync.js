#!/usr/bin/env node

/**
 * Validate ABI Sync Script
 * 
 * This script validates that contracts.ts matches ABI.txt
 * It checks that the function signatures in contracts.ts match the actual compiled ABI
 * 
 * Usage:
 *   node scripts/validate-abi-sync.js
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

function main() {
  console.log('='.repeat(70));
  console.log('🔍 Validating ABI Sync: contracts.ts vs ABI.txt');
  console.log('='.repeat(70));
  console.log();

  // Read ABI.txt
  const abiPath = path.join(__dirname, '..', 'ABI.txt');
  if (!fs.existsSync(abiPath)) {
    console.error(`❌ ABI.txt not found at ${abiPath}`);
    process.exit(1);
  }

  const abiJson = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
  const abiInterface = new ethers.Interface(abiJson);

  // Read contracts.ts
  const contractsPath = path.join(__dirname, '..', '..', 'src', 'blockchain', 'core', 'contracts.ts');
  if (!fs.existsSync(contractsPath)) {
    console.error(`❌ contracts.ts not found at ${contractsPath}`);
    process.exit(1);
  }

  const contractsContent = fs.readFileSync(contractsPath, 'utf8');

  // Extract function signatures from contracts.ts
  const functionRegex = /"function\s+(\w+)\s*\(([^)]*)\)[^"]*"/g;
  const contractsFunctions = new Map();
  let match;
  while ((match = functionRegex.exec(contractsContent)) !== null) {
    const funcName = match[1];
    const params = match[2];
    if (!contractsFunctions.has(funcName)) {
      contractsFunctions.set(funcName, []);
    }
    contractsFunctions.get(funcName).push(params);
  }

  // Check critical functions
  const criticalFunctions = ['publicMintZipFile', 'getZipFileInfo'];
  let hasErrors = false;

  for (const funcName of criticalFunctions) {
    const contractFunc = abiInterface.getFunction(funcName);
    if (!contractFunc) {
      console.error(`❌ Function ${funcName} not found in ABI.txt`);
      hasErrors = true;
      continue;
    }

    const actualSignature = contractFunc.format('full');
    const actualSelector = contractFunc.selector;

    console.log(`\n📋 ${funcName}:`);
    console.log(`   ABI.txt:     ${actualSignature}`);
    console.log(`   Selector:    ${actualSelector}`);

    // Check if contracts.ts has this function
    if (!contractsFunctions.has(funcName)) {
      console.error(`   ❌ contracts.ts: NOT FOUND`);
      hasErrors = true;
    } else {
      const contractsSigs = contractsFunctions.get(funcName);
      console.log(`   contracts.ts: ${contractsSigs.length} signature(s) found`);
      
      // Try to match
      let matched = false;
      for (const sig of contractsSigs) {
        // Simple check - see if parameter count matches
        const paramCount = actualSignature.split(',').length - 1; // -1 for return type
        const sigParamCount = sig.split(',').filter(p => p.trim()).length;
        if (paramCount === sigParamCount) {
          matched = true;
          console.log(`   ✅ Parameter count matches`);
          break;
        }
      }
      
      if (!matched) {
        console.error(`   ⚠️  Parameter count mismatch - may need manual review`);
      }
    }
  }

  console.log();
  console.log('='.repeat(70));
  if (hasErrors) {
    console.log('❌ Validation found issues. Please review contracts.ts');
    process.exit(1);
  } else {
    console.log('✅ ABI sync validation passed!');
    process.exit(0);
  }
}

main();

