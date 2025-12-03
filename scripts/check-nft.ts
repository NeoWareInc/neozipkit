#!/usr/bin/env node
/**
 * NFT Merkle Root Checker
 * 
 * This script queries an NFT on the blockchain and displays the stored Merkle Root
 * and other token information.
 * 
 * Usage:
 *   yarn check-nft
 *   (Interactive mode - will prompt for network and token ID)
 * 
 * Or with arguments:
 *   yarn check-nft <chainId> <tokenId>
 *   yarn ts-node packages/neozipkit/scripts/check-nft.ts <chainId> <tokenId>
 * 
 * Examples:
 *   yarn check-nft 11155111 1
 *   yarn check-nft 84532 1
 */

import { ethers } from 'ethers';
import * as readline from 'readline';
import { CONTRACT_CONFIGS, getContractConfig, NZIP_CONTRACT_ABI } from '../src/blockchain/core/contracts';

// RPC endpoint testing function (same as in serverActions.ts)
async function testRpcEndpoint(rpcUrl: string, chainId: number, timeoutMs: number = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        id: 1
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return false;
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return false;
    }
    
    const data = await response.json() as { jsonrpc?: string; result?: string };
    
    if (!data || typeof data !== 'object' || !data.jsonrpc || !data.result) {
      return false;
    }
    
    const actualChainId = parseInt(data.result, 16);
    if (actualChainId !== chainId) {
      return false;
    }
    
    return true;
  } catch (error: any) {
    return false;
  }
}

async function getWorkingRpcUrls(chainId: number): Promise<string[]> {
  const contractConfig = getContractConfig(chainId);
  const allUrls = contractConfig.rpcUrls || [];
  
  console.log(`🔍 Testing ${allUrls.length} RPC endpoints for chain ${chainId}...`);
  
  const testResults = await Promise.all(
    allUrls.map(async (url) => {
      const isWorking = await testRpcEndpoint(url, chainId, 5000);
      if (isWorking) {
        console.log(`✅ RPC endpoint working: ${url}`);
      } else {
        console.log(`❌ RPC endpoint failed: ${url}`);
      }
      return { url, isWorking };
    })
  );
  
  const workingUrls = testResults
    .filter(result => result.isWorking)
    .map(result => result.url);
  
  if (workingUrls.length === 0) {
    console.error(`❌ No working RPC endpoints found for chain ${chainId}. Will try all endpoints anyway.`);
    return allUrls;
  }
  
  console.log(`✅ Found ${workingUrls.length} working RPC endpoint(s)\n`);
  return workingUrls;
}

async function checkNFT(chainId: number, contractAddress: string, tokenId: string) {
  console.log('='.repeat(80));
  console.log('🎫 NFT Merkle Root Checker');
  console.log('='.repeat(80));
  console.log(`Network Chain ID: ${chainId}`);
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Token ID: ${tokenId}\n`);

  try {
    // Get contract config
    const contractConfig = getContractConfig(chainId);
    console.log(`Network: ${contractConfig.network}`);
    console.log(`Explorer: ${contractConfig.explorerUrl}\n`);

    // Get working RPC URLs
    const rpcUrls = await getWorkingRpcUrls(chainId);
    
    if (rpcUrls.length === 0) {
      throw new Error(`No working RPC URLs found for network ${chainId}`);
    }

    // Try each RPC endpoint until one works
    let zipInfo: any = null;
    let owner: string | null = null;
    let lastError: Error | null = null;

    for (let i = 0; i < rpcUrls.length; i++) {
      const rpcUrl = rpcUrls[i];
      console.log(`🔄 Trying RPC endpoint ${i + 1}/${rpcUrls.length}: ${rpcUrl}`);
      
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        
        // Test connection
        const blockNumber = await provider.getBlockNumber();
        console.log(`✅ Connected to blockchain (block: ${blockNumber})`);
        
        // Create contract instance
        const contract = new ethers.Contract(contractAddress, NZIP_CONTRACT_ABI, provider);
        
        // Get token info
        console.log(`📡 Calling getZipFileInfo(${tokenId})...`);
        zipInfo = await contract.getZipFileInfo(tokenId);
        
        // Get owner
        console.log(`📡 Calling ownerOf(${tokenId})...`);
        owner = await contract.ownerOf(tokenId);
        
        console.log(`✅ Successfully retrieved NFT data\n`);
        break;
        
      } catch (rpcError: any) {
        console.warn(`❌ RPC endpoint ${rpcUrl} failed:`, rpcError?.message || rpcError);
        lastError = rpcError instanceof Error ? rpcError : new Error(String(rpcError));
        continue;
      }
    }

    if (!zipInfo) {
      if (lastError) {
        throw lastError;
      }
      throw new Error('Failed to retrieve NFT data from all RPC endpoints');
    }

    // Display results
    console.log('='.repeat(80));
    console.log('📊 NFT Information');
    console.log('='.repeat(80));
    console.log(`Token ID:           ${tokenId}`);
    console.log(`Owner:              ${owner}`);
    console.log(`Creator:            ${zipInfo.creator}`);
    console.log(`\n🔐 Merkle Root Hash:`);
    console.log(`   ${zipInfo.merkleRootHash}`);
    console.log(`\n📅 Timestamps:`);
    console.log(`   Creation:         ${new Date(Number(zipInfo.creationTimestamp) * 1000).toISOString()}`);
    console.log(`   Tokenization:    ${new Date(Number(zipInfo.tokenizationTime) * 1000).toISOString()}`);
    console.log(`   Block Number:     ${zipInfo.blockNumber.toString()}`);
    if (zipInfo.ipfsHash) {
      console.log(`\n📦 IPFS Hash:`);
      console.log(`   ${zipInfo.ipfsHash}`);
    }
    console.log(`\n🔗 Explorer Links:`);
    console.log(`   Token:            ${contractConfig.explorerUrl}/token/${contractAddress}?a=${tokenId}`);
    console.log(`   Contract:         ${contractConfig.explorerUrl}/address/${contractAddress}`);
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('\n❌ Error checking NFT:');
    console.error(error?.message || error);
    if (error?.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Helper function to create readline interface
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Helper function to prompt for input
function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

// Display network selection menu
function displayNetworkMenu(): void {
  console.log('\n' + '='.repeat(80));
  console.log('🌐 Select Network');
  console.log('='.repeat(80));
  
  const networks = Object.entries(CONTRACT_CONFIGS)
    .sort(([a], [b]) => parseInt(a) - parseInt(b));
  
  networks.forEach(([chainId, config], index) => {
    console.log(`  ${index + 1}. ${config.network} (Chain ID: ${chainId})`);
  });
  
  console.log('='.repeat(80) + '\n');
}

// Get network selection from user
async function selectNetwork(rl: readline.Interface): Promise<{ chainId: number; contractAddress: string; network: string }> {
  displayNetworkMenu();
  
  const networks = Object.entries(CONTRACT_CONFIGS)
    .sort(([a], [b]) => parseInt(a) - parseInt(b));
  
  while (true) {
    const answer = await question(rl, `Select network (1-${networks.length}): `);
    const selection = parseInt(answer.trim(), 10);
    
    if (selection >= 1 && selection <= networks.length) {
      const [chainId, config] = networks[selection - 1];
      return {
        chainId: parseInt(chainId, 10),
        contractAddress: config.address,
        network: config.network
      };
    }
    
    console.error(`❌ Invalid selection. Please enter a number between 1 and ${networks.length}.`);
  }
}

// Get token ID from user
async function getTokenId(rl: readline.Interface): Promise<string> {
  while (true) {
    const answer = await question(rl, 'Enter Token ID: ');
    const tokenId = answer.trim();
    
    if (tokenId && !isNaN(parseInt(tokenId, 10))) {
      return tokenId;
    }
    
    console.error('❌ Invalid token ID. Please enter a valid number.');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  // If chainId and tokenId are provided as arguments, use them directly
  if (args.length >= 2) {
    const chainId = parseInt(args[0], 10);
    const tokenId = args[1];
    
    if (isNaN(chainId)) {
      console.error(`Error: Invalid chain ID: ${args[0]}`);
      process.exit(1);
    }
    
    try {
      const contractConfig = getContractConfig(chainId);
      await checkNFT(chainId, contractConfig.address, tokenId);
      process.exit(0);
    } catch (error: any) {
      console.error('Fatal error:', error);
      process.exit(1);
    }
    return;
  }
  
  // Interactive mode
  const rl = createReadlineInterface();
  
  try {
    // Select network
    const { chainId, contractAddress, network } = await selectNetwork(rl);
    console.log(`\n✅ Selected: ${network} (Chain ID: ${chainId})`);
    console.log(`   Contract: ${contractAddress}\n`);
    
    // Get token ID
    const tokenId = await getTokenId(rl);
    console.log(`\n✅ Token ID: ${tokenId}\n`);
    
    rl.close();
    
    // Check NFT
    await checkNFT(chainId, contractAddress, tokenId);
    process.exit(0);
    
  } catch (error: any) {
    rl.close();
    console.error('\n❌ Error:', error?.message || error);
    if (error?.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run main function
main();

