#!/usr/bin/env node

/**
 * Token Create - Create Tokenized ZIP File with NFT
 * 
 * Creates a ZIP file from input files, mints an NFT on the UnifiedNFT contract,
 * and adds TOKEN.NZIP metadata to the ZIP file.
 * 
 * Usage:
 *   yarn example:token-srv <output.nzip> <input-files...>
 *   ts-node examples/token-create.ts <output.nzip> <input-files...> --private-key <key> [--chain-id <id>]
 * 
 * Examples:
 *   USER_PRIVATE_KEY=0x... yarn example:token-srv examples/output/token-test.nzip examples/test-files/*
 *   ts-node examples/token-create.ts examples/output/token-test.nzip examples/test-files/* --private-key $USER_PRIVATE_KEY
 *   ts-node examples/token-create.ts examples/output/token-test.nzip examples/test-files/* --private-key $USER_PRIVATE_KEY --chain-id 84532
 * 
 * The NFT timestamp comes from the block in which the NFT is minted.
 * No timestamp proof is required - this creates a simple tokenized ZIP.
 * 
 * Difference from tokenize-zip.ts:
 * - token-create.ts uses UnifiedNFT contract directly (via ethers)
 * - tokenize-zip.ts uses ZipkitMinter (core API)
 * - Both create ZIP files with TOKEN.NZIP, but use different minting APIs
 */

// Load environment variables
import { config as dotenvConfig } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  dotenvConfig({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
} else {
  dotenvConfig();
}

// ZIP operations from neozipkit (peer dependency)
import { ZipkitNode } from 'neozipkit/node';
import type { CompressOptions } from 'neozipkit';

// Configuration
import { getContractConfig, NZIP_CONTRACT_ABI_V250 } from '../src/core/contracts';
import { NFT_METADATA } from '../src/zipstamp-server';

import { ethers } from 'ethers';
import * as os from 'os';

// Use v2.50/v2.51 ABI from contracts (single source of truth; Base Sepolia uses v2.51)
const UNIFIED_NFT_ABI = NZIP_CONTRACT_ABI_V250;

/**
 * Standard neozipkit-compatible TokenMetadata (TOKEN.NZIP)
 */
interface TokenMetadata {
  tokenId: string;
  contractAddress: string;
  network: string;
  merkleRoot: string;
  networkChainId: number;
  contractVersion: string;
  transactionHash: string;
  blockNumber: number;
  owner: string;
  mintedAt: string;
  
  // Optional timestamp proof (not used in simple mode)
  timestampProof?: {
    batchMerkleRoot: string;
    batchNumber: number;
    batchTransactionHash: string;
    batchBlockNumber: number;
    batchTimestamp: number;
    registryAddress: string;
    merkleProof: string[];
  };
}

/**
 * Simple wildcard pattern matcher
 */
function matchesPattern(filename: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}

/**
 * Expand file patterns to actual file paths
 */
function expandFilePatterns(patterns: string[]): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    if (pattern.includes('*') || pattern.includes('?')) {
      const patternDir = path.dirname(pattern);
      const patternBase = path.basename(pattern);
      const searchDir = path.isAbsolute(patternDir)
        ? patternDir
        : path.resolve(process.cwd(), patternDir === '.' ? '' : patternDir);
      
      if (!fs.existsSync(searchDir)) {
        throw new Error(`Directory not found: ${patternDir}`);
      }
      
      if (!fs.statSync(searchDir).isDirectory()) {
        throw new Error(`Path is not a directory: ${patternDir}`);
      }
      
      const dirEntries = fs.readdirSync(searchDir, { withFileTypes: true });
      
      for (const entry of dirEntries) {
        if (entry.isFile() && !entry.name.startsWith('.') && matchesPattern(entry.name, patternBase)) {
          const filePath = path.join(searchDir, entry.name);
          const absPath = path.resolve(filePath);
          
          if (!seen.has(absPath)) {
            seen.add(absPath);
            files.push(absPath);
          }
        }
      }
    } else {
      const absPath = path.isAbsolute(pattern) 
        ? pattern 
        : path.resolve(process.cwd(), pattern);
      
      if (!fs.existsSync(absPath)) {
        throw new Error(`Input file not found: ${pattern}`);
      }
      
      const stats = fs.statSync(absPath);
      if (!stats.isFile()) {
        throw new Error(`Input path is not a file: ${pattern}`);
      }
      
      if (!seen.has(absPath)) {
        seen.add(absPath);
        files.push(absPath);
      }
    }
  }

  return files.sort();
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Prompt for private key input (hidden)
 */
async function promptForPrivateKey(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Hide input by writing to stdout without echo
    process.stdout.write('Enter your private key (0x...): ');
    
    // Mute the output for the input
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }

    let input = '';
    const onData = (char: Buffer) => {
      const c = char.toString();
      if (c === '\n' || c === '\r') {
        if (stdin.isTTY) {
          stdin.setRawMode(wasRaw ?? false);
        }
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(input);
      } else if (c === '\x7f' || c === '\x08') {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
        }
      } else if (c === '\x03') {
        // Ctrl+C
        process.exit(1);
      } else {
        input += c;
      }
    };

    stdin.on('data', onData);
  });
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): {
  outputPath: string;
  inputPatterns: string[];
  privateKey: string;
  chainId: number;
} {
  const result = {
    outputPath: '',
    inputPatterns: [] as string[],
    privateKey: '',
    chainId: process.env.NEOZIP_CHAIN_ID ? parseInt(process.env.NEOZIP_CHAIN_ID, 10) : 84532,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    
    if (arg === '--private-key' || arg === '-k') {
      result.privateKey = args[++i] || '';
    } else if (arg === '--chain-id' || arg === '-c') {
      result.chainId = parseInt(args[++i] || '84532', 10);
    } else if (arg.startsWith('--')) {
      // Unknown flag, skip
      i++;
    } else if (!result.outputPath) {
      result.outputPath = arg;
    } else {
      result.inputPatterns.push(arg);
    }
    i++;
  }

  // Try to get private key from environment if not provided
  if (!result.privateKey) {
    result.privateKey = process.env.USER_PRIVATE_KEY || '';
  }

  return result;
}

async function main() {
  console.log('Token Create - Create Tokenized ZIP File with NFT\n');

  const args = process.argv.slice(2);
  
  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage:');
    console.log('  tsx stamp-zip/token-create.ts <output.nzip> <input-files...> --private-key <key> [--chain-id <id>]');
    console.log('\nOptions:');
    console.log('  --private-key, -k  Private key for minting (or set USER_PRIVATE_KEY env var)');
    console.log('  --chain-id, -c     Chain ID (default: 84532 for Base Sepolia)');
    console.log('\nExamples:');
    console.log('  tsx stamp-zip/token-create.ts output.nzip document.txt --private-key $USER_PRIVATE_KEY');
    console.log('  tsx stamp-zip/token-create.ts output.nzip *.txt --private-key $USER_PRIVATE_KEY');
    console.log('  tsx stamp-zip/token-create.ts output.nzip test-files/* --private-key $USER_PRIVATE_KEY --chain-id 84532');
    process.exit(1);
  }

  const { outputPath, inputPatterns, privateKey, chainId } = parseArgs(args);

  // Validate arguments
  if (!outputPath) {
    console.error('Error: Output path is required');
    process.exit(1);
  }

  if (inputPatterns.length === 0) {
    console.error('Error: At least one input file is required');
    process.exit(1);
  }

  // Prompt for private key if not provided
  if (!privateKey) {
    console.log('Private key not found in environment or command line.');
    privateKey = await promptForPrivateKey();
    
    if (!privateKey || privateKey.trim() === '') {
      console.error('Error: Private key is required');
      process.exit(1);
    }
  }

  // Get chain configuration (reuse neozip-blockchain network config)
  const chainConfig = getContractConfig(chainId);
  if (!chainConfig) {
    console.error(`Error: Chain ${chainId} is not configured`);
    process.exit(1);
  }

  // Use neozip-blockchain's configured contract address for this chain.
  // This example treats it as the UnifiedNFT contract address.
  const unifiedNftAddress = chainConfig.address;
  if (!unifiedNftAddress) {
    console.error(`Error: Contract address not configured for chain ${chainId}`);
    process.exit(1);
  }

  // Resolve output path
  const absoluteOutputPath = path.isAbsolute(outputPath) 
    ? outputPath 
    : path.resolve(process.cwd(), outputPath);

  // Expand input file patterns
  let resolvedFiles: string[];
  try {
    resolvedFiles = expandFilePatterns(inputPatterns);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (resolvedFiles.length === 0) {
    console.error('Error: No input files found matching the provided patterns');
    process.exit(1);
  }

  console.log(`Output: ${absoluteOutputPath}`);
  console.log(`Network: ${chainConfig.network} (Chain ${chainId})`);
  console.log(`Contract: ${unifiedNftAddress}`);
  console.log(`\nInput files (${resolvedFiles.length}):`);
  resolvedFiles.forEach(file => {
    const stats = fs.statSync(file);
    console.log(`  - ${path.basename(file)} (${formatBytes(stats.size)})`);
  });
  console.log();

  // Create temporary directory for intermediate files
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-create-'));

  try {
    // Step 1: Create ZIP file from input files
    console.log('Step 1: Creating ZIP archive with SHA-256 hashes...');
    
    const tempZipPath = path.join(tempDir, 'temp.zip');
    const zip = new ZipkitNode();

    const options: CompressOptions = {
      level: 6,
      useZstd: true,
      useSHA256: true,
    };

    const writer = await zip.initializeZipFile(tempZipPath);

    for (const filePath of resolvedFiles) {
      const entry = await zip.prepareEntryFromFile(filePath);
      await zip.writeZipEntry(writer, entry, filePath, options);
    }

    // Step 2: Calculate merkle root
    console.log('Step 2: Calculating merkle root...');
    const merkleRoot = (zip as any).getMerkleRoot?.();

    if (!merkleRoot) {
      console.error('Error: Could not calculate merkle root');
      await zip.finalizeZipFile(writer);
      await zip.closeFile();
      throw new Error('Could not calculate merkle root');
    }

    console.log(`   Merkle Root: ${merkleRoot}`);
    console.log();

    // Step 3: Connect to blockchain and check if already minted
    console.log('Step 3: Connecting to blockchain...');
    
    const rpcUrl = chainConfig.rpcUrls[0];
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    const wallet = new ethers.Wallet(privateKey, provider);
    const nftContract = new ethers.Contract(unifiedNftAddress, UNIFIED_NFT_ABI, wallet);

    console.log(`   Wallet: ${wallet.address}`);
    
    const balance = await provider.getBalance(wallet.address);
    console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);
    console.log();

    // Use creation timestamp for checking duplicates (current time)
    const creationTimestamp = Math.floor(Date.now() / 1000);
    
    // The merkle root as a string (neozipkit v2.11 uses strings)
    const merkleRootString = merkleRoot.startsWith('0x') ? merkleRoot.substring(2) : merkleRoot;
    
    let tokenId: string;
    let mintTxHash: string;
    let mintBlockNumber: number;
    let mintBlockTimestamp: number;

    // Step 4: Mint NFT using v2.11 compatible interface
    console.log('Step 4: Minting NFT on UnifiedNFT contract (v2.50/v2.51)...');
    
    // Check if fee is required and get fee amount
    let mintFee = BigInt(0);
    try {
      const feeRequired = await nftContract.mintFeeRequired();
      if (feeRequired) {
        mintFee = await nftContract.mintFee();
        console.log(`   Mint Fee: ${ethers.formatEther(mintFee)} ETH`);
        
        if (balance < mintFee) {
          throw new Error(`Insufficient balance. Need ${ethers.formatEther(mintFee)} ETH, have ${ethers.formatEther(balance)} ETH`);
        }
      } else {
        console.log(`   Mint Fee: Not required`);
      }
    } catch (e) {
      // If mintFeeRequired doesn't exist, try getting the fee anyway
      try {
        mintFee = await nftContract.mintFee();
        console.log(`   Mint Fee: ${ethers.formatEther(mintFee)} ETH (fee check not available)`);
      } catch {
        console.log(`   Mint Fee: Not configured`);
      }
    }

    // Call publicMintZipFile (v2.11 compatible - 4 param version)
    const tx = await nftContract['publicMintZipFile(string,uint256,string,string)'](
      merkleRootString,
      creationTimestamp,
      '', // ipfsHash - empty for now
      '', // metadataURI - empty for now
      { value: mintFee }
    );
    console.log(`   Transaction: ${tx.hash}`);
    console.log('   Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log(`   Confirmed in block: ${receipt.blockNumber}`);

    // Extract tokenId from ZipFileTokenized event
    const mintEvent = receipt.logs.find((log: any) => {
      try {
        const parsed = nftContract.interface.parseLog({ topics: log.topics as string[], data: log.data });
        return parsed?.name === 'ZipFileTokenized';
      } catch {
        return false;
      }
    });

    if (!mintEvent) {
      throw new Error('Could not find ZipFileTokenized event in transaction logs');
    }

    const parsedEvent = nftContract.interface.parseLog({ 
      topics: mintEvent.topics as string[], 
      data: mintEvent.data 
    });
    
    tokenId = parsedEvent!.args.tokenId.toString();
    mintTxHash = tx.hash;
    mintBlockNumber = receipt.blockNumber;

    // Get block timestamp
    const block = await provider.getBlock(receipt.blockNumber);
    mintBlockTimestamp = block?.timestamp || Math.floor(Date.now() / 1000);

    console.log(`   Token ID: ${tokenId}`);
    console.log();

    // Step 5: Create TOKEN.NZIP metadata
    console.log('Step 5: Creating TOKEN.NZIP metadata...');

    const contractVersion = await nftContract.getVersion();
    const currentOwner = await nftContract.ownerOf(tokenId);

    const tokenMetadata: TokenMetadata = {
      tokenId,
      contractAddress: unifiedNftAddress,
      network: chainConfig.network,
      merkleRoot: merkleRoot.startsWith('0x') ? merkleRoot : `0x${merkleRoot}`,
      networkChainId: chainId,
      contractVersion,
      transactionHash: mintTxHash,
      blockNumber: mintBlockNumber,
      owner: currentOwner,
      mintedAt: new Date(mintBlockTimestamp * 1000).toISOString(),
    };

    const metadataContent = JSON.stringify(tokenMetadata, null, 2);
    const metadataBuffer = Buffer.from(metadataContent, 'utf8');

    // Write metadata to temp file
    const tempMetadataFile = path.join(tempDir, 'nzip.token');
    fs.writeFileSync(tempMetadataFile, metadataBuffer);

    // Add metadata entry to ZIP
    const metadataEntry = await zip.prepareEntryFromFile(tempMetadataFile);
    metadataEntry.filename = NFT_METADATA;
    metadataEntry.cmpMethod = 0; // STORED (no compression)
    metadataEntry.compressedSize = metadataBuffer.length;

    await zip.writeZipEntry(writer, metadataEntry, tempMetadataFile, {
      level: 0,
      useZstd: false,
      useSHA256: false,
    });

    console.log(`   Added: ${NFT_METADATA}`);
    console.log();

    // Step 6: Finalize ZIP file
    console.log('Step 6: Finalizing ZIP file...');

    const allEntries = zip.getDirectory();
    const centralDirOffset = writer.currentPosition;
    const centralDirSize = await zip.writeCentralDirectory(writer, allEntries);

    await zip.writeEndOfCentralDirectory(
      writer,
      allEntries.length,
      centralDirSize,
      centralDirOffset
    );

    await zip.finalizeZipFile(writer);
    await zip.closeFile();

    // Move to final location
    const outputDir = path.dirname(absoluteOutputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (fs.existsSync(absoluteOutputPath)) {
      fs.unlinkSync(absoluteOutputPath);
    }
    fs.renameSync(tempZipPath, absoluteOutputPath);

    const finalStats = fs.statSync(absoluteOutputPath);

    // Display summary
    console.log('═'.repeat(60));
    console.log('TOKENIZATION COMPLETE');
    console.log('═'.repeat(60));
    console.log();
    console.log(`Output: ${absoluteOutputPath} (${formatBytes(finalStats.size)})`);
    console.log();
    console.log('NFT Details:');
    console.log(`  Token ID: ${tokenId}`);
    console.log(`  Contract: ${unifiedNftAddress}`);
    console.log(`  Owner: ${currentOwner}`);
    console.log(`  Network: ${chainConfig.network} (Chain ${chainId})`);
    console.log(`  Version: ${contractVersion}`);
    console.log();
    console.log('ZIP File:');
    console.log(`  Merkle Root: ${merkleRoot}`);
    console.log(`  Files: ${resolvedFiles.length}`);
    console.log();
    console.log('Mint Details:');
    if (mintTxHash !== 'already-minted') {
      console.log(`  Transaction: ${mintTxHash}`);
    }
    console.log(`  Block: ${mintBlockNumber}`);
    console.log(`  Timestamp: ${new Date(mintBlockTimestamp * 1000).toISOString()}`);
    console.log(`             (${new Date(mintBlockTimestamp * 1000).toLocaleString()})`);
    console.log();
    console.log('View on explorer:');
    console.log(`  NFT: ${chainConfig.explorerUrl}/token/${unifiedNftAddress}?a=${tokenId}`);
    if (mintTxHash !== 'already-minted') {
      console.log(`  TX: ${chainConfig.explorerUrl}/tx/${mintTxHash}`);
    }
    console.log();
    console.log('To verify this file:');
    console.log(`  tsx stamp-zip/verify-zip.ts ${absoluteOutputPath}`);
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack && process.env.DEBUG) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
