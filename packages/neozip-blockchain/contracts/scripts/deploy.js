#!/usr/bin/env node

/**
 * Unified deployment script for NZIP contracts
 * 
 * Usage:
 *   Deploy NFT:      node scripts/deploy.js nft --version 2.50 --network base-sepolia
 *   Deploy Registry: node scripts/deploy.js registry --version 0.90 --network base-sepolia
 *   
 * Options:
 *   --version    Contract version (required for nft, e.g., 2.50)
 *   --network    Network to deploy to (default: base-sepolia)
 *   --registry   Registry address (for nft deployment, optional)
 *   --authorize  Additional wallet to authorize (optional)
 *   --non-interactive  Skip confirmation prompts
 * 
 * Environment variables:
 *   PRIVATE_KEY - Deployer wallet private key (required)
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ============================================================================
// Contract Configuration
// ============================================================================

const CONTRACTS = {
  nft: {
    '2.50': {
      file: 'NZIP-NFT-v2.50.sol',
      contract: 'NZIPNFT',
      constructorArgs: (registryAddress) => [registryAddress || ethers.ZeroAddress],
      version: '2.50.0'
    },
    '2.51': {
      file: 'NZIP-NFT-v2.51.sol',
      contract: 'NZIPNFT',
      constructorArgs: (registryAddress) => [registryAddress || ethers.ZeroAddress],
      version: '2.51.0'
    }
    // Add more versions as needed:
    // '2.11': { file: 'legacy/NZIP-NFT-v2.11.sol', contract: 'ZipFileNFTPublic', ... }
  },
  registry: {
    '0.90': {
      file: 'NZIP-TimestampReg-v0.90.sol',
      contract: 'NZIPTimestampReg',
      constructorArgs: () => [],
      version: '0.90.0'
    }
  }
};

// Default versions
const DEFAULT_VERSIONS = {
  nft: '2.51',
  registry: '0.90'
};

// Network configurations
const NETWORKS = {
  'base-sepolia': {
    name: 'Base Sepolia',
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org'
  },
  'arbitrum-sepolia': {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    explorerUrl: 'https://sepolia.arbiscan.io'
  },
  'base': {
    name: 'Base Mainnet',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org'
  },
  'arbitrum': {
    name: 'Arbitrum One',
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io'
  }
};

// ============================================================================
// Helpers
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    contractType: args[0], // 'nft' or 'registry'
    version: null,
    network: 'base-sepolia',
    registry: null,
    authorize: null,
    nonInteractive: false
  };
  
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) {
      result.version = args[++i];
    } else if (args[i] === '--network' && args[i + 1]) {
      result.network = args[++i];
    } else if (args[i] === '--registry' && args[i + 1]) {
      result.registry = args[++i];
    } else if (args[i] === '--authorize' && args[i + 1]) {
      result.authorize = args[++i];
    } else if (args[i] === '--non-interactive') {
      result.nonInteractive = true;
    }
  }
  
  // Use default version if not specified
  if (!result.version && result.contractType) {
    result.version = DEFAULT_VERSIONS[result.contractType];
  }
  
  return result;
}

function loadArtifact(contractFile, contractName) {
  // Handle file path - check both regular and legacy locations
  const basePath = path.join(__dirname, '..', 'artifacts', 'src');
  let artifactPath = path.join(basePath, contractFile, `${contractName}.json`);
  
  // Check if it's in legacy folder
  if (!fs.existsSync(artifactPath) && contractFile.startsWith('legacy/')) {
    artifactPath = path.join(basePath, contractFile, `${contractName}.json`);
  }
  
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}\nRun 'npx hardhat compile' first.`);
  }
  
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

function createReadlineInterface() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });
  
  rl.on('SIGINT', () => {
    console.log('\n\nDeployment cancelled.');
    rl.close();
    process.exit(0);
  });
  
  return rl;
}

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer?.trim() || ''));
  });
}

function saveDeployment(networkKey, contractName, deploymentInfo) {
  const deployDir = path.join(__dirname, '..', 'deployments', networkKey);
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }
  
  const filePath = path.join(deployDir, `${contractName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`✓ Deployment saved to: ${filePath}`);
}

function saveABI(contractName, abi) {
  const abiPath = path.join(__dirname, '..', 'abi', `${contractName}.json`);
  fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2));
  console.log(`✓ ABI saved to: ${abiPath}`);
}

// ============================================================================
// Main Deployment Function
// ============================================================================

async function main() {
  const args = parseArgs();
  
  // Validate arguments
  if (!args.contractType || !['nft', 'registry'].includes(args.contractType)) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║               NZIP Contract Deployment Tool                  ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  node scripts/deploy.js <contract-type> [options]

Contract Types:
  nft       Deploy NZIP NFT contract (requires --version)
  registry  Deploy NZIPTimestampReg contract

Options:
  --version <ver>      Contract version (e.g., 2.50)
  --network <network>  Target network (default: base-sepolia)
  --registry <addr>    Registry address for NFT deployment
  --authorize <addr>   Additional wallet to authorize
  --non-interactive    Skip confirmation prompts

Examples:
  node scripts/deploy.js registry --network base-sepolia
  node scripts/deploy.js nft --version 2.50 --network base-sepolia --registry 0x...
`);
    process.exit(1);
  }
  
  const contractConfig = CONTRACTS[args.contractType]?.[args.version];
  if (!contractConfig) {
    console.error(`Unknown contract: ${args.contractType} v${args.version}`);
    console.error(`Available versions: ${Object.keys(CONTRACTS[args.contractType] || {}).join(', ')}`);
    process.exit(1);
  }
  
  const network = NETWORKS[args.network];
  if (!network) {
    console.error(`Unknown network: ${args.network}`);
    console.error(`Available networks: ${Object.keys(NETWORKS).join(', ')}`);
    process.exit(1);
  }
  
  const rl = args.nonInteractive ? null : createReadlineInterface();
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║               NZIP Contract Deployment                       ║
╚══════════════════════════════════════════════════════════════╝
`);
  
  try {
    // Get private key
    let privateKey = process.env.PRIVATE_KEY;
    if (!privateKey && rl) {
      console.log('⚠️  Private key will be visible as you type');
      privateKey = await prompt(rl, 'Enter deployer private key: ');
    }
    
    if (!privateKey) {
      throw new Error('PRIVATE_KEY is required');
    }
    
    // Clean and validate private key
    privateKey = privateKey.trim();
    if (!privateKey.startsWith('0x')) {
      privateKey = '0x' + privateKey;
    }
    
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error('Invalid private key format');
    }
    
    // Connect to network
    console.log(`Connecting to ${network.name}...`);
    const provider = new ethers.JsonRpcProvider(network.rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    const balance = await provider.getBalance(wallet.address);
    console.log(`✓ Connected as: ${wallet.address}`);
    console.log(`✓ Balance: ${ethers.formatEther(balance)} ETH\n`);
    
    if (balance === 0n) {
      throw new Error('Deployer wallet has no funds');
    }
    
    // Get constructor args
    let constructorArgs;
    if (args.contractType === 'nft') {
      let registryAddress = args.registry;
      if (!registryAddress && rl) {
        registryAddress = await prompt(rl, 'Enter NZIPTimestampReg address (or press Enter for none): ');
      }
      constructorArgs = contractConfig.constructorArgs(registryAddress || null);
    } else {
      constructorArgs = contractConfig.constructorArgs();
    }
    
    // Show deployment summary
    console.log('─────────────────────────────────────────────────────────────');
    console.log('Deployment Summary:');
    console.log(`  Contract: ${contractConfig.contract} (${contractConfig.file})`);
    console.log(`  Version:  ${contractConfig.version}`);
    console.log(`  Network:  ${network.name}`);
    console.log(`  Deployer: ${wallet.address}`);
    if (args.contractType === 'nft') {
      console.log(`  Registry: ${constructorArgs[0] === ethers.ZeroAddress ? '(none)' : constructorArgs[0]}`);
    }
    console.log('─────────────────────────────────────────────────────────────\n');
    
    // Confirm deployment
    if (rl) {
      const confirm = await prompt(rl, 'Proceed with deployment? (y/n): ');
      if (confirm.toLowerCase() !== 'y') {
        console.log('Deployment cancelled.');
        rl.close();
        return;
      }
    }
    
    // Load artifact and deploy
    console.log('\nLoading contract artifact...');
    const artifact = loadArtifact(contractConfig.file, contractConfig.contract);
    console.log('✓ Artifact loaded\n');
    
    console.log(`Deploying ${contractConfig.contract}...`);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const contract = await factory.deploy(...constructorArgs);
    await contract.waitForDeployment();
    
    const contractAddress = await contract.getAddress();
    const deployTx = contract.deploymentTransaction();
    
    console.log(`✓ ${contractConfig.contract} deployed at: ${contractAddress}`);
    console.log(`  Transaction: ${deployTx.hash}\n`);
    
    // Authorize additional wallet if specified
    if (args.authorize && ethers.isAddress(args.authorize)) {
      if (args.authorize.toLowerCase() !== wallet.address.toLowerCase()) {
        console.log(`Authorizing ${args.authorize}...`);
        
        if (args.contractType === 'registry') {
          const tx = await contract.addAuthorizedSubmitter(args.authorize);
          await tx.wait();
          console.log('✓ Added as authorized submitter\n');
        } else if (args.contractType === 'nft') {
          const tx = await contract.authorizeMinter(args.authorize);
          await tx.wait();
          console.log('✓ Added as authorized minter\n');
        }
      }
    }
    
    // Save deployment info
    const deploymentInfo = {
      network: network.name,
      networkKey: args.network,
      chainId: network.chainId,
      timestamp: new Date().toISOString(),
      deployer: wallet.address,
      contract: {
        name: contractConfig.contract,
        file: contractConfig.file,
        version: contractConfig.version,
        address: contractAddress,
        transactionHash: deployTx.hash,
        constructorArgs: constructorArgs
      },
      explorerUrl: `${network.explorerUrl}/address/${contractAddress}`
    };
    
    const deployFileName = args.contractType === 'nft' 
      ? `NZIP-NFT-v${args.version}`
      : `NZIP-TimestampReg-v${args.version}`;
    
    saveDeployment(args.network, deployFileName, deploymentInfo);
    saveABI(deployFileName, artifact.abi);
    
    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    DEPLOYMENT COMPLETE                         ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\n${contractConfig.contract}: ${contractAddress}`);
    console.log(`\nExplorer: ${network.explorerUrl}/address/${contractAddress}`);
    console.log('\nVerify contract:');
    console.log(`  npx hardhat verify --network ${args.network} ${contractAddress} ${constructorArgs.join(' ')}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    if (process.env.DEBUG) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    if (rl) rl.close();
  }
}

main().catch(console.error);
