#!/usr/bin/env node

/**
 * Contract Verification Script for NeoZip NFT Contract
 * 
 * This script verifies a deployed contract on the appropriate blockchain scanner
 * using Hardhat's verify plugin and Etherscan API V2.
 * 
 * Usage:
 *   node scripts/verify-contract.js <contractAddress> <network>
 *   or
 *   yarn verify <contractAddress> <network>
 * 
 * Examples:
 *   node scripts/verify-contract.js 0x1234...5678 arbitrumSepolia
 *   node scripts/verify-contract.js 0x1234...5678 sepolia
 *   node scripts/verify-contract.js 0x1234...5678 baseSepolia
 * 
 * Supported Networks:
 *   - ethereum (Ethereum Mainnet)
 *   - sepolia (Ethereum Sepolia)
 *   - base (Base Mainnet)
 *   - baseSepolia (Base Sepolia)
 *   - arbitrum (Arbitrum One)
 *   - arbitrumSepolia (Arbitrum Sepolia)
 *   - polygon (Polygon Mainnet)
 *   - polygonSepolia (Polygon Sepolia)
 */

const hre = require("hardhat");
const path = require("path");

// Network name mapping (user-friendly to Hardhat network names)
const NETWORK_MAP = {
  "eth": "ethereum",
  "ethereum": "ethereum",
  "eth-sepolia": "sepolia",
  "sepolia": "sepolia",
  "base": "base",
  "base-sepolia": "baseSepolia",
  "baseSepolia": "baseSepolia",
  "arbitrum": "arbitrum",
  "arbitrum-one": "arbitrum",
  "arbitrum-sepolia": "arbitrumSepolia",
  "arbitrumSepolia": "arbitrumSepolia",
  "polygon": "polygon",
  "polygon-sepolia": "polygonSepolia",
  "polygonSepolia": "polygonSepolia",
  "amoy": "polygonSepolia"
};

function getNetworkName(userInput) {
  const normalized = userInput.toLowerCase().trim();
  return NETWORK_MAP[normalized] || normalized;
}

function validateAddress(address) {
  if (!address || typeof address !== "string") {
    return false;
  }
  // Basic Ethereum address validation
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

async function main() {
  console.log("=".repeat(70));
  console.log("🔍 NeoZip NFT Contract Verification");
  console.log("=".repeat(70));
  console.log();

  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("❌ Error: Missing required arguments");
    console.error();
    console.error("Usage: node scripts/verify-contract.js <contractAddress> <network>");
    console.error();
    console.error("Examples:");
    console.error("  node scripts/verify-contract.js 0x1234...5678 arbitrumSepolia");
    console.error("  node scripts/verify-contract.js 0x1234...5678 sepolia");
    console.error();
    console.error("Supported networks:");
    console.error("  - ethereum, sepolia");
    console.error("  - base, baseSepolia");
    console.error("  - arbitrum, arbitrumSepolia");
    console.error("  - polygon, polygonSepolia");
    console.error();
    process.exit(1);
  }

  const contractAddress = args[0];
  const networkInput = args[1];
  const networkName = getNetworkName(networkInput);

  // Validate contract address
  if (!validateAddress(contractAddress)) {
    console.error(`❌ Error: Invalid contract address: ${contractAddress}`);
    console.error("   Address must be a valid Ethereum address (0x followed by 40 hex characters)");
    process.exit(1);
  }

  // Check if network is configured
  const networks = hre.config.networks;
  if (!networks[networkName]) {
    console.error(`❌ Error: Network '${networkName}' is not configured in hardhat.config.js`);
    console.error();
    console.error("Available networks:");
    Object.keys(networks).forEach(net => {
      console.error(`  - ${net}`);
    });
    process.exit(1);
  }

  // Check for API key
  const apiKey = hre.config.etherscan?.apiKey?.[networkName] || 
                 hre.config.etherscan?.apiKey?.mainnet ||
                 process.env.ETHERSCAN_API_KEY;

  if (!apiKey) {
    console.error("❌ Error: Etherscan API key not found");
    console.error();
    console.error("Please set one of the following:");
    console.error("  - ETHERSCAN_API_KEY environment variable");
    console.error("  - etherscan.apiKey in hardhat.config.js");
    console.error();
    console.error("Get your API key from:");
    console.error("  https://etherscan.io/apis (works for all Etherscan-based explorers)");
    process.exit(1);
  }

  console.log(`📋 Contract Address: ${contractAddress}`);
  console.log(`🌐 Network: ${networkName}`);
  console.log();

  try {
    console.log("🔍 Verifying contract on blockchain scanner...");
    console.log("   This may take a few moments...");
    console.log();

    // Verify the contract
    // The contract has no constructor arguments
    await hre.run("verify:verify", {
      address: contractAddress,
      network: networkName
    });

    console.log();
    console.log("=".repeat(70));
    console.log("✅ Contract verified successfully!");
    console.log("=".repeat(70));
    console.log();

    // Get explorer URL
    const networkConfig = networks[networkName];
    let explorerUrl = "";
    
    if (networkName === "sepolia") {
      explorerUrl = `https://sepolia.etherscan.io/address/${contractAddress}`;
    } else if (networkName === "ethereum") {
      explorerUrl = `https://etherscan.io/address/${contractAddress}`;
    } else if (networkName === "baseSepolia") {
      explorerUrl = `https://sepolia.basescan.org/address/${contractAddress}`;
    } else if (networkName === "base") {
      explorerUrl = `https://basescan.org/address/${contractAddress}`;
    } else if (networkName === "arbitrumSepolia") {
      explorerUrl = `https://sepolia.arbiscan.io/address/${contractAddress}`;
    } else if (networkName === "arbitrum") {
      explorerUrl = `https://arbiscan.io/address/${contractAddress}`;
    } else if (networkName === "polygonSepolia") {
      explorerUrl = `https://amoy.polygonscan.com/address/${contractAddress}`;
    } else if (networkName === "polygon") {
      explorerUrl = `https://polygonscan.com/address/${contractAddress}`;
    }

    if (explorerUrl) {
      console.log(`🔗 View contract on explorer:`);
      console.log(`   ${explorerUrl}`);
      console.log();
    }

  } catch (error) {
    console.error();
    console.error("❌ Verification failed:");
    
    if (error.message.includes("Already Verified")) {
      console.error("   Contract is already verified on the explorer.");
      console.error("   This is not an error - the contract is already public.");
    } else if (error.message.includes("bytecode")) {
      console.error("   Bytecode mismatch detected.");
      console.error("   This usually means:");
      console.error("   1. The contract was compiled with different settings");
      console.error("   2. The contract source code has changed");
      console.error("   3. The deployed bytecode doesn't match the source");
      console.error();
      console.error("   Solution:");
      console.error("   1. Recompile the contract: yarn compile:extract");
      console.error("   2. Redeploy with the new bytecode");
      console.error("   3. Or verify using the exact compiler settings used for deployment");
    } else {
      console.error(`   ${error.message}`);
    }
    
    if (error.stack && !error.message.includes("Already Verified")) {
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
    console.error("Unexpected error:", error);
    process.exit(1);
  });

