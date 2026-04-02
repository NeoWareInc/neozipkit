#!/usr/bin/env node

/**
 * Token Direct Example
 *
 * Direct mint: create a NZIP file and mint it on the blockchain using the NZIP contract v2.51
 * (no Zipstamp server). Default network is Base Sepolia, which uses the v2.51 contract.
 *
 * PREREQUISITES:
 * - This example requires neozipkit to be installed: npm install neozipkit
 * - This example uses local source files from ../src for blockchain operations (package not yet published)
 *
 * SECURITY WARNING:
 * - NEVER use mainnet private keys in examples
 * - ONLY use testnet keys with minimal test funds
 * - NEVER commit private keys to version control
 * - Store private keys in .env file (excluded from git)
 * - Rotate keys immediately if accidentally exposed
 * - Wallet files (wallet/neozip-wallet.json) are automatically excluded from git
 *
 * Note: This example requires:
 * - A wallet private key with testnet ETH
 * - Network configuration (defaults to Base Sepolia testnet, NZIP v2.51)
 * - Gas fees for minting
 *
 * Usage: yarn example:token-direct
 * Output: examples/output/token-direct.nzip
 */

// ZIP operations from neozipkit (peer dependency)
import { ZipkitNode } from 'neozipkit/node';
import type { CompressOptions } from 'neozipkit';
import { crc32 } from 'neozipkit';

// Blockchain operations from neozip-blockchain (local source)
import { ZipkitMinter } from '../src/core/ZipkitMinter';
import { getContractConfig, TOKENIZED_METADATA, DEFAULT_CONTRACT_VERSION } from '../src/core/contracts';
import type { TokenMetadata } from '../src/types';

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

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
 * Prompt for y/n confirmation. When defaultNo is true, Enter means No.
 */
function promptConfirm(message: string, defaultNo: boolean = true): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    const suffix = defaultNo ? ' (y/N)' : ' (Y/n)';
    rl.question(message + suffix + ': ', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') {
        resolve(!defaultNo);
        return;
      }
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

/** Choice: use existing token, mint new, or cancel */
type ActionChoice = 'use-existing' | 'mint' | 'cancel';

/**
 * Prompt for 1/2/3 (or 1/2 when no existing token). Returns choice or 'cancel' on invalid/3.
 */
function promptAction(hasUserOwnedToken: boolean): Promise<ActionChoice> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    if (hasUserOwnedToken) {
      console.log('\n  1) Use your existing NFT token for this merkle root (no gas cost).');
      console.log('  2) Mint a new NFT token on-chain (costs gas).');
      console.log('  3) Exit without minting.');
    } else {
      console.log('\n  1) Mint a new NFT token on-chain (costs gas).');
      console.log('  2) Exit without minting.');
    }
    const choicePrompt = hasUserOwnedToken ? '\nChoice (1-3): ' : '\nChoice (1-2): ';
    rl.question(choicePrompt, (answer) => {
      rl.close();
      const n = answer.trim();
      if (hasUserOwnedToken) {
        if (n === '1') {
          resolve('use-existing');
          return;
        }
        if (n === '2') {
          resolve('mint');
          return;
        }
        resolve('cancel');
        return;
      }
      if (n === '1') {
        resolve('mint');
        return;
      }
      resolve('cancel');
    });
  });
}

async function main() {
  console.log('Token Direct Example (NZIP contract v2.51)\n');

  // Check for wallet private key, prompt if not set
  let walletPrivateKey = process.env.USER_PRIVATE_KEY;
  if (!walletPrivateKey) {
    console.log('Private key not found in environment.');
    console.log('💡 Get testnet ETH from: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet\n');
    walletPrivateKey = await promptForPrivateKey();

    if (!walletPrivateKey || walletPrivateKey.trim() === '') {
      console.error('❌ Error: Private key is required');
      process.exit(1);
    }
  }

  // Network configuration (default to Base Sepolia testnet — uses NZIP v2.51)
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

  // Define output NZIP file path
  const outputZip = path.join(__dirname, 'output', 'token-direct.nzip');
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

    // Initialize blockchain minter (uses network config — Base Sepolia = v2.51)
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

    const hasUserOwnedToken = duplicateCheck.userOwnedTokens.length > 0;

    if (duplicateCheck.hasExistingTokens) {
      console.log(`⚠️  Found ${duplicateCheck.allTokens.length} existing token(s) with this merkle root:`);
      duplicateCheck.userOwnedTokens.forEach(token => {
        console.log(`   - Token ID ${token.tokenId} (owned by you)`);
      });
      duplicateCheck.othersTokens.forEach(token => {
        console.log(`   - Token ID ${token.tokenId} (owned by others)`);
      });
    } else {
      console.log('✅ No existing tokens found.');
    }

    const choice = await promptAction(hasUserOwnedToken);

    if (choice === 'cancel') {
      console.log('Cancelled.\n');
      process.exit(0);
    }

    if (choice === 'use-existing') {
      const existing = duplicateCheck.userOwnedTokens[0];
      const networkConfig = getContractConfig(walletInfo.chainId);
      const contractVersion = networkConfig.version || DEFAULT_CONTRACT_VERSION;

      console.log('\n✅ Using your existing token (no mint needed).');
      console.log(`   Token ID: ${existing.tokenId}\n`);

      console.log('Step 5: Adding token metadata to ZIP file...');
      const tokenMetadata: TokenMetadata = {
        tokenId: existing.tokenId,
        contractAddress: networkConfig.address,
        network: walletInfo.networkName,
        networkChainId: walletInfo.chainId,
        merkleRoot: merkleRoot,
        contractVersion: contractVersion,
        owner: existing.owner
      };
      await addTokenMetadataToZip(zip, outputZip, tokenMetadata, testFiles, options);

      console.log(`✅ Token metadata added to ZIP file`);
      console.log(`   Metadata file: ${TOKENIZED_METADATA}`);
      console.log(`   Contract version: ${contractVersion}`);
      console.log();
      console.log(`📄 View token on explorer:`);
      const explorerUrl = `https://sepolia.basescan.org/token/${networkConfig.address}?a=${existing.tokenId}`;
      console.log(`   ${explorerUrl}`);
      process.exit(0);
    }

    // choice === 'mint' — proceed to gas estimate and mint

    // Estimate gas costs
    console.log('Step 5: Estimating gas costs...');
    const gasCosts = await minter.estimateGasCosts();
    console.log(`   Estimated gas cost: ${gasCosts.estimatedCost} ETH\n`);

    // Confirm before minting (allow abort)
    const proceed = await promptConfirm('Proceed with mint?');
    if (!proceed) {
      console.log('Mint aborted.\n');
      process.exit(0);
    }

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

      // Get contract version from network config (Base Sepolia = v2.51)
      const networkConfig = getContractConfig(walletInfo.chainId);
      const contractVersion = networkConfig.version || DEFAULT_CONTRACT_VERSION;
      if (!networkConfig.version) {
        console.log(`   Using default contract version: ${DEFAULT_CONTRACT_VERSION}\n`);
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
        contractVersion: contractVersion  // Required field - v2.51 on Base Sepolia
      };

      // Rebuild ZIP with token metadata
      await addTokenMetadataToZip(zip, outputZip, tokenMetadata, testFiles, options);

      console.log(`✅ Token metadata added to ZIP file`);
      console.log(`   Metadata file: ${TOKENIZED_METADATA}`);
      console.log(`   Contract version: ${contractVersion}`);
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
    console.error('❌ Error during direct tokenization:');
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
      writer.outputStream.write(localHeader, (error: Error | null | undefined) => {
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
      writer.outputStream.write(tokenBuffer, (error: Error | null | undefined) => {
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
