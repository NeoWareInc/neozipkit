#!/usr/bin/env node

/**
 * Compile and Extract Script for NeoZip NFT Contract
 * 
 * This script:
 * 1. Compiles the NZIP-NFT.sol contract using Hardhat
 * 2. Extracts the ABI and bytecode from compilation artifacts
 * 3. Writes ABI.txt and Bytecode.txt in the contracts directory
 * 
 * Usage:
 *   node scripts/compile-and-extract.js
 *   or
 *   yarn compile:extract
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=".repeat(70));
  console.log("🔨 Compiling NeoZip NFT Contract");
  console.log("=".repeat(70));
  console.log();

  try {
    // Compile the contract
    console.log("📦 Compiling contracts...");
    await hre.run("compile");
    console.log("✅ Compilation successful!");
    console.log();

    // Get the contract artifact
    const contractName = "ZipFileNFTPublic";
    
    // Read the build info to get the exact artifact
    // Hardhat stores artifacts in artifacts/src/<source-file>/<contract-name>.json
    const artifactPath = path.join(__dirname, "..", "artifacts", "src", "NZIP-NFT.sol", `${contractName}.json`);
    
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Artifact not found at ${artifactPath}. Make sure the contract compiled successfully.`);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    
    // Extract ABI
    const abi = artifact.abi;
    if (!abi || abi.length === 0) {
      throw new Error("ABI not found in artifact");
    }

    // Extract bytecode (deployment bytecode, not creation code)
    let bytecode = artifact.bytecode;
    if (!bytecode || bytecode === "0x") {
      throw new Error("Bytecode not found in artifact");
    }

    // Remove 0x prefix if present (deploy-interactive.js handles adding it)
    if (bytecode.startsWith("0x")) {
      bytecode = bytecode.slice(2);
    }

    // Write to compiled files (NOT the deployment files)
    // ABI.txt and Bytecode.txt are the DEPLOYED versions and must not be overwritten
    const abiPath = path.join(__dirname, "..", "ABI-compiled.txt");
    const bytecodePath = path.join(__dirname, "..", "Bytecode-compiled.txt");
    
    fs.writeFileSync(abiPath, JSON.stringify(abi, null, "\t"), "utf8");
    console.log(`✅ ABI written to: ${path.relative(process.cwd(), abiPath)}`);
    console.log(`   ⚠️  Note: This is the COMPILED ABI, not the deployed ABI.txt`);

    fs.writeFileSync(bytecodePath, bytecode, "utf8");
    console.log(`✅ Bytecode written to: ${path.relative(process.cwd(), bytecodePath)}`);
    console.log(`   ⚠️  Note: This is the COMPILED bytecode, not the deployed Bytecode.txt`);
    console.log();

    // Display summary
    console.log("=".repeat(70));
    console.log("📊 Compilation Summary");
    console.log("=".repeat(70));
    console.log(`Contract: ${contractName}`);
    console.log(`ABI Functions: ${abi.filter(item => item.type === "function").length}`);
    console.log(`Bytecode Length: ${bytecode.length} characters (${Math.floor(bytecode.length / 2)} bytes)`);
    console.log();
    console.log("⚠️  IMPORTANT: These are COMPILED files, not the deployed files!");
    console.log("   - ABI-compiled.txt: Newly compiled ABI");
    console.log("   - Bytecode-compiled.txt: Newly compiled bytecode");
    console.log();
    console.log("   The deployed files (ABI.txt and Bytecode.txt) were NOT modified.");
    console.log("   To use the new compilation for deployment:");
    console.log("   1. Review the compiled files");
    console.log("   2. If correct, manually copy them to ABI.txt and Bytecode.txt");
    console.log("   3. Then use deploy-interactive.js to deploy");
    console.log();

  } catch (error) {
    console.error();
    console.error("❌ Error during compilation:");
    console.error(error.message);
    if (error.stack) {
      console.error();
      console.error("Stack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

