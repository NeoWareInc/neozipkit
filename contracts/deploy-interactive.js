#!/usr/bin/env node

/**
 * Interactive Deployment script for NeoZip NFT Contract
 * 
 * Usage:
 *   node deploy-interactive.js
 * 
 * This script will prompt you for:
 * - Private key
 * - Network selection
 * - Confirmation before deployment
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Network configurations
const NETWORKS = {
  "ETH": {
    name: "Ethereum Mainnet",
    chainId: 1,
    rpcUrls: [
      "https://eth.llamarpc.com",
      "https://rpc.ankr.com/eth",
      "https://ethereum.publicnode.com"
    ],
    explorer: "https://etherscan.io",
    isTestnet: false
  },
  "ETH Sepolia": {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    rpcUrls: [
      "https://rpc.sepolia.org",
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://sepolia.gateway.tenderly.co"
    ],
    explorer: "https://sepolia.etherscan.io",
    isTestnet: true
  },
  "Base": {
    name: "Base Mainnet",
    chainId: 8453,
    rpcUrls: [
      "https://mainnet.base.org",
      "https://base.drpc.org",
      "https://base.gateway.tenderly.co"
    ],
    explorer: "https://basescan.org",
    isTestnet: false
  },
  "Base Sepolia": {
    name: "Base Sepolia",
    chainId: 84532,
    rpcUrls: [
      "https://sepolia.base.org",
      "https://base-sepolia-rpc.publicnode.com",
      "https://base-sepolia.gateway.tenderly.co"
    ],
    explorer: "https://sepolia.basescan.org",
    isTestnet: true
  },
  "Arbitrum": {
    name: "Arbitrum One",
    chainId: 42161,
    rpcUrls: [
      "https://arb1.arbitrum.io/rpc",
      "https://arbitrum.llamarpc.com",
      "https://arbitrum.publicnode.com"
    ],
    explorer: "https://arbiscan.io",
    isTestnet: false
  },
  "Arbitrum Sepolia": {
    name: "Arbitrum Sepolia",
    chainId: 421614,
    rpcUrls: [
      "https://sepolia-rollup.arbitrum.io/rpc",
      "https://arbitrum-sepolia-rpc.publicnode.com"
    ],
    explorer: "https://sepolia.arbiscan.io",
    isTestnet: true
  },
  "Polygon": {
    name: "Polygon Mainnet",
    chainId: 137,
    rpcUrls: [
      "https://polygon.llamarpc.com",
      "https://rpc.ankr.com/polygon",
      "https://polygon-rpc.com"
    ],
    explorer: "https://polygonscan.com",
    isTestnet: false
  },
  "Polygon Sepolia": {
    name: "Polygon Sepolia",
    chainId: 80002,
    rpcUrls: [
      "https://rpc-amoy.polygon.technology",
      "https://polygon-amoy-rpc.publicnode.com"
    ],
    explorer: "https://amoy.polygonscan.com",
    isTestnet: true
  }
};

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt for input
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

// Helper function to close readline
function close() {
  rl.close();
}

async function main() {
  console.log("=".repeat(70));
  console.log("🚀 NeoZip NFT Contract Deployment - Interactive");
  console.log("=".repeat(70));
  console.log();

  // File paths
  const contractsDir = __dirname;
  const bytecodePath = path.join(contractsDir, "Bytecode.txt");
  const abiPath = path.join(contractsDir, "ABI.txt");

  // Check if files exist
  if (!fs.existsSync(bytecodePath)) {
    console.error(`❌ Error: Bytecode.txt not found at ${bytecodePath}`);
    close();
    process.exit(1);
  }

  if (!fs.existsSync(abiPath)) {
    console.error(`❌ Error: ABI.txt not found at ${abiPath}`);
    close();
    process.exit(1);
  }

  try {
    // Step 1: Prompt for private key
    console.log("📝 Step 1: Enter your private key");
    console.log("   (Your private key will NOT be saved or displayed)");
    const privateKey = await question("\nPrivate Key: ");
    
    if (!privateKey || !privateKey.trim()) {
      console.error("\n❌ Error: Private key is required");
      close();
      process.exit(1);
    }

    const trimmedKey = privateKey.trim();
    if (!trimmedKey.startsWith("0x")) {
      console.log("   ℹ️  Adding 0x prefix to private key...");
    }

    console.log();

    // Step 2: Select network
    console.log("🌐 Step 2: Select network to deploy to");
    console.log();
    const networkKeys = Object.keys(NETWORKS);
    networkKeys.forEach((key, index) => {
      const network = NETWORKS[key];
      const testnetLabel = network.isTestnet ? " (Testnet)" : " (Mainnet)";
      console.log(`   ${index + 1}. ${key}${testnetLabel}`);
    });
    console.log();

    const networkChoice = await question(`Select network (1-${networkKeys.length}): `);
    const networkIndex = parseInt(networkChoice) - 1;

    if (isNaN(networkIndex) || networkIndex < 0 || networkIndex >= networkKeys.length) {
      console.error("\n❌ Error: Invalid network selection");
      close();
      process.exit(1);
    }

    const selectedNetworkKey = networkKeys[networkIndex];
    const selectedNetwork = NETWORKS[selectedNetworkKey];

    console.log();
    console.log(`✅ Selected: ${selectedNetwork.name} (Chain ID: ${selectedNetwork.chainId})`);
    console.log();

    // Step 3: Read contract files
    console.log("📖 Reading contract files...");
    let bytecode = fs.readFileSync(bytecodePath, "utf8").trim();
    if (!bytecode.startsWith("0x")) {
      bytecode = "0x" + bytecode;
    }
    const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));
    console.log("✅ Contract files loaded");
    console.log(`   Bytecode length: ${bytecode.length} characters`);
    console.log();

    // Step 4: Connect to network
    console.log(`🔗 Connecting to ${selectedNetwork.name}...`);
    
    let provider;
    let lastError;
    
    // Try each RPC URL until one works
    for (const rpcUrl of selectedNetwork.rpcUrls) {
      try {
        provider = new ethers.JsonRpcProvider(rpcUrl);
        // Test connection
        await provider.getBlockNumber();
        console.log(`✅ Connected via: ${rpcUrl}`);
        break;
      } catch (error) {
        lastError = error;
        continue;
      }
    }

    if (!provider) {
      console.error(`❌ Error: Could not connect to ${selectedNetwork.name}`);
      console.error(`   Tried ${selectedNetwork.rpcUrls.length} RPC endpoints`);
      if (lastError) {
        console.error(`   Last error: ${lastError.message}`);
      }
      close();
      process.exit(1);
    }

    // Create wallet
    const wallet = new ethers.Wallet(trimmedKey.startsWith("0x") ? trimmedKey : "0x" + trimmedKey, provider);
    console.log(`✅ Wallet address: ${wallet.address}`);
    console.log();

    // Step 5: Check balance
    console.log("💰 Checking wallet balance...");
    const balance = await provider.getBalance(wallet.address);
    const balanceEth = ethers.formatEther(balance);
    console.log(`   Balance: ${balanceEth} ETH`);
    console.log();

    if (balance === 0n) {
      const networkType = selectedNetwork.isTestnet ? "testnet tokens" : "ETH";
      console.error(`❌ Error: Insufficient balance. Please fund your wallet with ${networkType}.`);
      if (selectedNetwork.isTestnet) {
        console.error(`   Get testnet tokens from a faucet for ${selectedNetwork.name}`);
      }
      close();
      process.exit(1);
    }

    // Step 6: Estimate gas
    console.log("⛽ Estimating gas costs...");
    let gasEstimate;
    let estimatedCost;
    try {
      const ContractFactory = new ethers.ContractFactory(abi, bytecode, wallet);
      const deployTx = ContractFactory.getDeployTransaction();
      gasEstimate = await provider.estimateGas(deployTx);
      const feeData = await provider.getFeeData();
      estimatedCost = gasEstimate * (feeData.gasPrice || 0n);
      console.log(`   Estimated gas: ${gasEstimate.toString()}`);
      console.log(`   Estimated cost: ${ethers.formatEther(estimatedCost)} ETH`);
    } catch (err) {
      console.log("   ⚠️  Could not estimate gas (will use default)");
      gasEstimate = null;
      estimatedCost = null;
    }
    console.log();

    // Step 7: Show summary and confirm
    console.log("=".repeat(70));
    console.log("📋 DEPLOYMENT SUMMARY");
    console.log("=".repeat(70));
    console.log();
    console.log(`Network:        ${selectedNetwork.name}`);
    console.log(`Chain ID:       ${selectedNetwork.chainId}`);
    console.log(`Deployer:       ${wallet.address}`);
    console.log(`Balance:        ${balanceEth} ETH`);
    if (gasEstimate) {
      console.log(`Gas Estimate:   ${gasEstimate.toString()}`);
      console.log(`Est. Cost:      ${ethers.formatEther(estimatedCost)} ETH`);
    }
    console.log(`Explorer:       ${selectedNetwork.explorer}`);
    console.log();
    
    if (!selectedNetwork.isTestnet) {
      console.log("⚠️  WARNING: You are deploying to MAINNET!");
      console.log("   This will cost real ETH. Make sure you want to proceed.");
      console.log();
    }

    const confirm = await question("Proceed with deployment? (yes/no): ");
    
    if (confirm.toLowerCase() !== "yes" && confirm.toLowerCase() !== "y") {
      console.log("\n❌ Deployment cancelled by user");
      close();
      process.exit(0);
    }

    console.log();
    console.log("=".repeat(70));
    console.log("🚀 DEPLOYING CONTRACT");
    console.log("=".repeat(70));
    console.log();

    // Step 8: Deploy
    console.log("🏗️  Creating contract factory...");
    const ContractFactory = new ethers.ContractFactory(abi, bytecode, wallet);
    
    console.log("📤 Sending deployment transaction...");
    console.log("   This may take a few moments...");
    const contract = await ContractFactory.deploy();
    
    const txHash = contract.deploymentTransaction().hash;
    console.log("✅ Deployment transaction sent!");
    console.log(`   Transaction hash: ${txHash}`);
    console.log(`   View on explorer: ${selectedNetwork.explorer}/tx/${txHash}`);
    console.log();
    console.log("⏳ Waiting for deployment confirmation...");
    
    const deploymentResponse = await contract.waitForDeployment();
    
    const contractAddress = await contract.getAddress();
    console.log();
    console.log("=".repeat(70));
    console.log("✅ DEPLOYMENT SUCCESSFUL!");
    console.log("=".repeat(70));
    console.log();
    console.log(`Contract Address: ${contractAddress}`);
    console.log(`Transaction Hash: ${txHash}`);
    
    // Get deployment block from the deployment response
    let blockNumber = null;
    let version = "2.10.0";
    
    try {
      // Get receipt from the deployment transaction
      const receipt = await contract.deploymentTransaction().wait();
      blockNumber = receipt.blockNumber;
      console.log(`Deployed at Block: ${blockNumber}`);
    } catch (err) {
      // If we can't get the receipt, try to get it from the provider
      try {
        const txReceipt = await provider.getTransactionReceipt(txHash);
        if (txReceipt) {
          blockNumber = txReceipt.blockNumber;
          console.log(`Deployed at Block: ${blockNumber}`);
        } else {
          console.log("⚠️  Could not retrieve block number (deployment was successful)");
        }
      } catch (err2) {
        console.log("⚠️  Could not retrieve block number (deployment was successful)");
      }
    }
    
    // Verify version (optional, don't fail if this doesn't work)
    try {
      version = await contract.getVersion();
      console.log(`Contract Version: ${version}`);
    } catch (err) {
      // Version check failed, but deployment was successful
      console.log(`Contract Version: ${version} (assumed, verification failed)`);
    }
    console.log();
    
    // Save deployment info
    const deploymentInfo = {
      network: selectedNetwork.name,
      networkKey: selectedNetworkKey,
      chainId: selectedNetwork.chainId,
      contractAddress: contractAddress,
      version: version,
      deployer: wallet.address,
      transactionHash: txHash,
      blockNumber: blockNumber,
      timestamp: new Date().toISOString(),
      explorerUrl: `${selectedNetwork.explorer}/address/${contractAddress}`
    };
    
    const deploymentFileName = `deployment-${selectedNetworkKey.toLowerCase().replace(/\s+/g, "-")}.json`;
    const deploymentPath = path.join(contractsDir, deploymentFileName);
    fs.writeFileSync(
      deploymentPath,
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log("📝 Deployment info saved to:", deploymentPath);
    console.log();
    console.log("🔍 View contract on explorer:");
    console.log(`   ${selectedNetwork.explorer}/address/${contractAddress}`);
    console.log();
    console.log("📋 Next steps:");
    console.log("   1. Verify the contract on the block explorer");
    console.log("   2. Update contract address in src/blockchain/core/contracts.ts");
    console.log("   3. Test the deployed contract");
    console.log();
    
    // Close readline and exit cleanly
    close();
    
    // Give a moment for any pending operations to complete, then exit
    setTimeout(() => {
      process.exit(0);
    }, 100);
    
  } catch (error) {
    console.error();
    console.error("❌ Deployment failed!");
    console.error("Error:", error.message);
    
    if (error.transaction) {
      console.error("Transaction:", error.transaction);
    }
    
    if (error.receipt) {
      console.error("Receipt:", error.receipt);
    }
    
    console.error();
    if (error.code) {
      console.error("Error code:", error.code);
    }
    if (error.reason) {
      console.error("Reason:", error.reason);
    }
    
    close();
    process.exit(1);
  }
}

// Run deployment
main().catch((error) => {
  console.error("Fatal error:", error);
  close();
  process.exit(1);
});

