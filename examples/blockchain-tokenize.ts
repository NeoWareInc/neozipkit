#!/usr/bin/env node

/**
 * Blockchain Tokenization Example
 * 
 * Demonstrates creating a tokenized ZIP file with blockchain NFT minting.
 * This is a minimal example showing the basic tokenization flow.
 * 
 * SECURITY WARNING:
 * - NEVER use mainnet private keys in examples
 * - ONLY use testnet keys with minimal test funds
 * - NEVER commit private keys to version control
 * - Store private keys in .env file (excluded from git)
 * - Rotate keys immediately if accidentally exposed
 * - Wallet files (wallet/neozip-wallet.json) are automatically excluded from git
 * 
 * See SECURITY.md for complete security guidelines.
 * 
 * Note: This example requires:
 * - A wallet private key with testnet ETH
 * - Network configuration (defaults to Base Sepolia testnet)
 * - Gas fees for minting
 */

import { ZipkitNode } from '../src/node';
import { ZipkitMinter } from '../src/blockchain/core/ZipkitMinter';
import { getContractConfig } from '../src/blockchain/core/contracts';
import type { CompressOptions } from '../src/core';
import type { TokenMetadata } from '../src/types';
import { TOKENIZED_METADATA } from '../src/core/constants/Headers';
import { crc32 } from '../src/core/encryption/ZipCrypto';
import ZipEntry from '../src/core/ZipEntry';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Blockchain Tokenization Example\n');

  // Check for wallet private key
  const walletPrivateKey = process.env.NEOZIP_WALLET_PASSKEY;
  if (!walletPrivateKey) {
    console.error('❌ Error: NEOZIP_WALLET_PASSKEY environment variable is required');
    console.error('   Please set your wallet private key:');
    console.error('   export NEOZIP_WALLET_PASSKEY="0x..."');
    console.error('\n💡 Get testnet ETH from:');
    console.error('   https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet');
    process.exit(1);
  }

  // Network configuration (default to Base Sepolia testnet)
  const network = process.env.NEOZIP_NETWORK || 'base-sepolia';

  // Create some test files
  const testFiles: string[] = [];
  const testDir = path.join(__dirname, 'test-files');
  
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const file1 = path.join(testDir, 'document.txt');
  const file2 = path.join(testDir, 'data.json');

  if (!fs.existsSync(file1)) {
    fs.writeFileSync(file1, 'This is a sample document.\nIt will be tokenized on the blockchain.');
  }
  testFiles.push(file1);

  if (!fs.existsSync(file2)) {
    fs.writeFileSync(file2, JSON.stringify({ name: 'Sample Data', value: 12345 }, null, 2));
  }
  testFiles.push(file2);

  console.log('Source files:');
  testFiles.forEach(file => {
    const stats = fs.statSync(file);
    console.log(`  - ${path.basename(file)} (${stats.size} bytes)`);
  });
  console.log();

  // Create ZipkitNode instance
  const zip = new ZipkitNode();

  // Define output ZIP file path
  const outputZip = path.join(__dirname, 'output', 'tokenized.zip');
  const outputDir = path.dirname(outputZip);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Compression options with SHA-256 enabled (required for merkle root calculation)
  const options: CompressOptions = {
    level: 6,
    useZstd: true,
    useSHA256: true  // IMPORTANT: Enable SHA-256 for blockchain features
  };

  try {
    console.log('Step 1: Creating ZIP archive with SHA-256 hashes...');
    
    // Create ZIP file from files
    // After compression, entries have SHA-256 values populated - no reload needed
    await zip.createZipFromFiles(testFiles, outputZip, options);

    console.log(`✅ ZIP archive created: ${outputZip}\n`);

    // Get merkle root immediately (entries already have SHA-256 values from compression)
    console.log('Step 2: Calculating merkle root...');
    const merkleRoot = (zip as any).getMerkleRoot?.();
    
    if (!merkleRoot) {
      console.error('❌ Error: Could not calculate merkle root');
      console.error('   Make sure useSHA256: true is set in compression options');
      await zip.closeFile(); // Close file handle before exiting
      process.exit(1);
    }

    console.log(`✅ Merkle root calculated: ${merkleRoot}\n`);

    // Close file handle
    await zip.closeFile();

    // Initialize blockchain minter
    console.log('Step 3: Initializing blockchain minter...');
    const minter = new ZipkitMinter(merkleRoot, {
      walletPrivateKey: walletPrivateKey,
      network: network,
      verbose: true,
      debug: false
    });

    // Get wallet information
    const walletInfo = await minter.getWalletInfo();
    console.log(`✅ Wallet: ${walletInfo.address}`);
    console.log(`   Balance: ${walletInfo.balance} ETH`);
    console.log(`   Network: ${walletInfo.networkName}\n`);

    // Check for existing tokens
    console.log('Step 4: Checking for existing tokens...');
    const duplicateCheck = await minter.checkForDuplicates();
    
    if (duplicateCheck.hasExistingTokens) {
      console.log(`⚠️  Found ${duplicateCheck.allTokens.length} existing token(s) with this merkle root:`);
      duplicateCheck.userOwnedTokens.forEach(token => {
        console.log(`   - Token ID ${token.tokenId} (owned by you)`);
      });
      duplicateCheck.othersTokens.forEach(token => {
        console.log(`   - Token ID ${token.tokenId} (owned by others)`);
      });
      console.log('\n💡 This example will proceed with minting a new token.');
      console.log('   In a real application, you might want to use an existing token instead.\n');
    } else {
      console.log('✅ No existing tokens found. Proceeding with new mint.\n');
    }

    // Estimate gas costs
    console.log('Step 5: Estimating gas costs...');
    const gasCosts = await minter.estimateGasCosts();
    console.log(`   Estimated gas cost: ${gasCosts.estimatedCost} ETH\n`);

    // Mint the token
    console.log('Step 6: Minting NFT token on blockchain...');
    console.log('   This will incur gas costs. Please wait...\n');
    
    const mintResult = await minter.mintToken();

    if (mintResult.success) {
      console.log(`✅ Token minted successfully!`);
      console.log(`   Token ID: ${mintResult.tokenId}`);
      console.log(`   Transaction: ${mintResult.transactionHash}`);
      console.log(`   Contract: ${mintResult.contractAddress}`);
      if (mintResult.gasUsed) {
        console.log(`   Gas Used: ${mintResult.gasUsed}`);
      }
      if (mintResult.gasCost) {
        console.log(`   Gas Cost: ${mintResult.gasCost} ETH`);
      }
      console.log();

      // Step 7: Add token metadata to ZIP file
      console.log('Step 7: Adding token metadata to ZIP file...');
      
      // Get contract version from network config
      const networkConfig = getContractConfig(walletInfo.chainId);
      if (!networkConfig.version) {
        throw new Error(`Contract version not specified for network ${walletInfo.networkName} (chainId: ${walletInfo.chainId})`);
      }
      
      // Create token metadata object
      const tokenMetadata: TokenMetadata = {
        tokenId: mintResult.tokenId!,
        contractAddress: mintResult.contractAddress!,
        network: walletInfo.networkName,
        networkChainId: walletInfo.chainId,  // Required field - get from walletInfo
        transactionHash: mintResult.transactionHash,
        merkleRoot: merkleRoot,
        mintedAt: new Date().toISOString(),
        mintDate: new Date().toISOString(),
        contractVersion: networkConfig.version  // Required field - get from network config
      };

      // Rebuild ZIP with token metadata
      await addTokenMetadataToZip(zip, outputZip, tokenMetadata, testFiles, options);

      console.log(`✅ Token metadata added to ZIP file`);
      console.log(`   Metadata file: ${TOKENIZED_METADATA}`);
      console.log();
      console.log(`📄 View token on explorer:`);
      const explorerUrl = `https://sepolia.basescan.org/token/${mintResult.contractAddress}?a=${mintResult.tokenId}`;
      console.log(`   ${explorerUrl}`);
      
      // Explicitly exit to prevent hanging
      process.exit(0);

    } else {
      console.error(`❌ Token minting failed: ${mintResult.message}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error during tokenization:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    // Ensure file handle is closed on error
    try {
      await zip.closeFile();
    } catch (closeError) {
      // Ignore close errors
    }
    process.exit(1);
  }
}

/**
 * Add token metadata to ZIP file by rebuilding it with the metadata entry
 */
async function addTokenMetadataToZip(
  zip: ZipkitNode,
  zipPath: string,
  tokenMetadata: TokenMetadata,
  originalFiles: string[],
  options: CompressOptions
): Promise<void> {
  // Create token metadata content
  const tokenContent = JSON.stringify(tokenMetadata, null, 2);
  const tokenBuffer = Buffer.from(tokenContent, 'utf8');

  // Create temporary ZIP file
  const tempZipPath = zipPath + '.tmp';
  
  // Create a fresh ZipkitNode instance for the new ZIP
  const newZip = new ZipkitNode();
  
  // Initialize new ZIP file
  const writer = await newZip.initializeZipFile(tempZipPath);

  try {
    // Add all original files
    for (const filePath of originalFiles) {
      const entry = await newZip.prepareEntryFromFile(filePath);
      await newZip.writeZipEntry(writer, entry, filePath, options);
    }

    // Add token metadata entry (STORED, uncompressed)
    const tokenEntry = newZip.createZipEntry(TOKENIZED_METADATA);
    tokenEntry.timeDateDOS = tokenEntry.setDateTime(new Date());
    tokenEntry.uncompressedSize = tokenBuffer.length;
    tokenEntry.compressedSize = tokenBuffer.length;
    tokenEntry.cmpMethod = 0; // STORED (no compression)
    tokenEntry.crc = crc32(tokenBuffer);
    tokenEntry.fileBuffer = tokenBuffer;
    
    // Add entry to ZIP entries list
    newZip.getDirectory().push(tokenEntry);
    
    // Write token entry manually (STORED method)
    tokenEntry.localHdrOffset = writer.currentPosition;
    writer.entryPositions.set(TOKENIZED_METADATA, tokenEntry.localHdrOffset);
    const localHeader = tokenEntry.createLocalHdr();
    
    await new Promise<void>((resolve, reject) => {
      writer.outputStream.write(localHeader, (error) => {
        if (error) {
          reject(error);
        } else {
          writer.currentPosition += localHeader.length;
          resolve();
        }
      });
    });

    // Write token data
    await new Promise<void>((resolve, reject) => {
      writer.outputStream.write(tokenBuffer, (error) => {
        if (error) {
          reject(error);
        } else {
          writer.currentPosition += tokenBuffer.length;
          resolve();
        }
      });
    });

    // Get all entries (including token metadata)
    const allEntries = newZip.getDirectory();

    // Write central directory
    const centralDirOffset = writer.currentPosition;
    const centralDirSize = await newZip.writeCentralDirectory(writer, allEntries);

    // Write EOCD
    await newZip.writeEndOfCentralDirectory(
      writer,
      allEntries.length,
      centralDirSize,
      centralDirOffset
    );

    // Finalize and close
    await newZip.finalizeZipFile(writer);

    // Wait a moment for file system to sync
    await new Promise(resolve => setTimeout(resolve, 100));

    // Replace original ZIP with new one
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    fs.renameSync(tempZipPath, zipPath);

    // Ensure file handles are released
    await new Promise(resolve => setTimeout(resolve, 100));

  } catch (error) {
    // Clean up temp file on error
    if (fs.existsSync(tempZipPath)) {
      try {
        fs.unlinkSync(tempZipPath);
      } catch (unlinkError) {
        // Ignore unlink errors
      }
    }
    throw error;
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

