#!/usr/bin/env node

/**
 * Verify Tokenized ZIP Example
 * 
 * Demonstrates verifying a tokenized ZIP file on the blockchain.
 * This example:
 * 1. Loads a tokenized ZIP file
 * 2. Extracts token metadata from META-INF/NZIP.TOKEN
 * 3. Calculates merkle root from ZIP contents
 * 4. Verifies the token on the blockchain
 * 5. Displays verification results
 * 
 * SECURITY WARNING:
 * - This example only reads blockchain data (no private keys required)
 * - However, if you're verifying your own tokenized files, ensure:
 *   - Private keys used for minting are stored securely
 *   - Never commit private keys to version control
 *   - Use testnet for development and testing
 * 
 * See SECURITY.md for complete security guidelines.
 * 
 * Usage:
 *   ts-node examples/verify-tokenized-zip.ts [path-to-tokenized.zip]
 */

import { ZipkitNode } from '../src/node';
import { ZipkitVerifier } from '../src/blockchain/core/ZipkitVerifier';
import type { TokenMetadata } from '../src/types';
import { TOKENIZED_METADATA } from '../src/core/constants/Headers';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Verify Tokenized ZIP Example\n');

  // Get ZIP file path from command line argument or use default
  const zipPath = process.argv[2] || path.join(__dirname, 'output', 'tokenized.zip');

  if (!fs.existsSync(zipPath)) {
    console.error(`❌ Error: ZIP file not found: ${zipPath}`);
    console.error('\nUsage:');
    console.error('  ts-node examples/verify-tokenized-zip.ts [path-to-tokenized.zip]');
    console.error('\nExample:');
    console.error('  ts-node examples/verify-tokenized-zip.ts examples/output/tokenized.zip');
    process.exit(1);
  }

  console.log(`📦 ZIP file: ${zipPath}`);
  const zipStats = fs.statSync(zipPath);
  console.log(`   Size: ${formatBytes(zipStats.size)}\n`);

  try {
    // Step 1: Load ZIP file
    console.log('Step 1: Loading ZIP file...');
    const zip = new ZipkitNode();
    await zip.loadZipFile(zipPath);
    console.log('✅ ZIP file loaded successfully\n');

    // Step 2: Extract token metadata
    console.log('Step 2: Extracting token metadata...');
    const entries = zip.getDirectory();
    const tokenEntry = entries.find(entry => entry.filename === TOKENIZED_METADATA);

    if (!tokenEntry) {
      console.error('❌ Error: Token metadata not found in ZIP file');
      console.error(`   Expected file: ${TOKENIZED_METADATA}`);
      console.error('\n💡 This ZIP file does not appear to be tokenized.');
      console.error('   Use blockchain-tokenize.ts to create a tokenized ZIP file.');
      await zip.closeFile();
      process.exit(1);
    }

    // Extract token metadata content to temporary file
    const tempTokenFile = path.join(__dirname, 'output', '.token-metadata-temp.json');
    const tempTokenDir = path.dirname(tempTokenFile);
    if (!fs.existsSync(tempTokenDir)) {
      fs.mkdirSync(tempTokenDir, { recursive: true });
    }

    let tokenMetadata: TokenMetadata;

    try {
      await zip.extractToFile(tokenEntry, tempTokenFile);
      const tokenContent = fs.readFileSync(tempTokenFile, 'utf8');
      
      // Clean up temp file
      fs.unlinkSync(tempTokenFile);
      
      try {
        tokenMetadata = JSON.parse(tokenContent);
      } catch (parseError) {
        console.error('❌ Error: Invalid token metadata format');
        console.error('   Token metadata must be valid JSON');
        await zip.closeFile();
        process.exit(1);
      }
    } catch (extractError) {
      console.error('❌ Error: Could not extract token metadata');
      console.error(`   ${extractError instanceof Error ? extractError.message : String(extractError)}`);
      // Clean up temp file if it exists
      if (fs.existsSync(tempTokenFile)) {
        try {
          fs.unlinkSync(tempTokenFile);
        } catch (unlinkError) {
          // Ignore
        }
      }
      await zip.closeFile();
      process.exit(1);
    }

    // Validate token metadata structure
    if (!tokenMetadata.tokenId || !tokenMetadata.contractAddress || !tokenMetadata.network) {
      console.error('❌ Error: Invalid token metadata structure');
      console.error('   Missing required fields: tokenId, contractAddress, or network');
      await zip.closeFile();
      process.exit(1);
    }

    console.log('✅ Token metadata extracted');
    console.log(`   Token ID: ${tokenMetadata.tokenId}`);
    console.log(`   Contract: ${tokenMetadata.contractAddress}`);
    console.log(`   Network: ${tokenMetadata.network}`);
    if (tokenMetadata.transactionHash) {
      console.log(`   Transaction: ${tokenMetadata.transactionHash}`);
    }
    console.log();

    // Step 3: Calculate merkle root from ZIP contents
    console.log('Step 3: Calculating merkle root from ZIP contents...');
    
    // Get merkle root (this excludes token metadata file automatically)
    const merkleRoot = (zip as any).getMerkleRoot?.();
    
    if (!merkleRoot) {
      console.error('❌ Error: Could not calculate merkle root');
      console.error('   Make sure the ZIP file was created with SHA-256 hashes enabled');
      await zip.closeFile();
      process.exit(1);
    }

    console.log(`✅ Merkle root calculated: ${merkleRoot}`);
    
    // Compare with metadata merkle root if present
    if (tokenMetadata.merkleRoot) {
      if (tokenMetadata.merkleRoot === merkleRoot) {
        console.log('   ✓ Matches merkle root in token metadata');
      } else {
        console.log('   ⚠️  WARNING: Does not match merkle root in token metadata!');
        console.log(`      Metadata: ${tokenMetadata.merkleRoot}`);
        console.log(`      Calculated: ${merkleRoot}`);
        console.log('   This may indicate the ZIP file has been modified.');
      }
    }
    console.log();

    // Close file handle before verification
    await zip.closeFile();

    // Step 4: Verify token on blockchain
    console.log('Step 4: Verifying token on blockchain...');
    console.log('   This may take a few moments...\n');

    const verifier = new ZipkitVerifier({
      debug: false
    });

    const verificationResult = await verifier.verifyToken(
      tokenMetadata,
      merkleRoot,
      {
        debug: false,
        skipHash: false
      }
    );

    // Step 5: Display verification results
    console.log('Step 5: Verification Results');
    console.log('═'.repeat(80));
    
    if (verificationResult.success) {
      console.log('✅ VERIFICATION SUCCESSFUL');
      console.log('═'.repeat(80));
      console.log(`Token ID: ${tokenMetadata.tokenId}`);
      console.log(`Contract: ${tokenMetadata.contractAddress}`);
      console.log(`Network: ${tokenMetadata.network}`);
      
      if (verificationResult.verificationDetails) {
        const details = verificationResult.verificationDetails;
        console.log(`\nBlockchain Data:`);
        if (details.merkleRoot) {
          console.log(`  Merkle Root: ${details.merkleRoot}`);
        }
        if (details.mintDate) {
          console.log(`  Tokenization Time: ${details.mintDate}`);
        }
        if (details.onChainValid !== undefined) {
          console.log(`  On-Chain Valid: ${details.onChainValid ? 'Yes' : 'No'}`);
        }
      }

      console.log(`\nMerkle Root Verification:`);
      if (verificationResult.verificationDetails?.merkleRootMatch) {
        console.log('  ✅ Calculated merkle root matches blockchain');
        if (verificationResult.verificationDetails.calculatedMerkleRoot && verificationResult.verificationDetails.declaredMerkleRoot) {
          console.log(`     Calculated: ${verificationResult.verificationDetails.calculatedMerkleRoot}`);
          console.log(`     On-chain:   ${verificationResult.verificationDetails.declaredMerkleRoot}`);
        }
      } else {
        console.log('  ❌ Calculated merkle root does NOT match blockchain!');
        if (verificationResult.errorDetails) {
          if (verificationResult.errorDetails.calculatedMerkleRoot) {
            console.log(`     Calculated: ${verificationResult.errorDetails.calculatedMerkleRoot}`);
          }
          if (verificationResult.errorDetails.onChainMerkleRoot) {
            console.log(`     On-chain:   ${verificationResult.errorDetails.onChainMerkleRoot}`);
          }
        }
      }

      if (verificationResult.verificationDetails?.onChainValid) {
        console.log('\n✅ Token is valid and verified on blockchain');
      }

      // Display explorer link
      const networkName = tokenMetadata.network.toLowerCase();
      let explorerUrl = '';
      
      if (networkName.includes('base') && networkName.includes('sepolia')) {
        explorerUrl = `https://sepolia.basescan.org/token/${tokenMetadata.contractAddress}?a=${tokenMetadata.tokenId}`;
      } else if (networkName.includes('base')) {
        explorerUrl = `https://basescan.org/token/${tokenMetadata.contractAddress}?a=${tokenMetadata.tokenId}`;
      } else if (networkName.includes('arbitrum') && networkName.includes('sepolia')) {
        explorerUrl = `https://sepolia.arbiscan.io/token/${tokenMetadata.contractAddress}?a=${tokenMetadata.tokenId}`;
      } else if (networkName.includes('arbitrum')) {
        explorerUrl = `https://arbiscan.io/token/${tokenMetadata.contractAddress}?a=${tokenMetadata.tokenId}`;
      } else if (networkName.includes('sepolia')) {
        explorerUrl = `https://sepolia.etherscan.io/token/${tokenMetadata.contractAddress}?a=${tokenMetadata.tokenId}`;
      } else if (networkName.includes('ethereum')) {
        explorerUrl = `https://etherscan.io/token/${tokenMetadata.contractAddress}?a=${tokenMetadata.tokenId}`;
      }

      if (explorerUrl) {
        console.log(`\n📄 View token on explorer:`);
        console.log(`   ${explorerUrl}`);
      }

    } else {
      console.log('❌ VERIFICATION FAILED');
      console.log('═'.repeat(80));
      console.log(`Error: ${verificationResult.message}`);
      
      if (verificationResult.errorDetails) {
        console.log(`\nError Details:`);
        console.log(`  Type: ${verificationResult.errorDetails.errorType || 'UNKNOWN'}`);
        if (verificationResult.errorDetails.networkName) {
          console.log(`  Network: ${verificationResult.errorDetails.networkName}`);
        }
        if (verificationResult.errorDetails.rpcUrl) {
          console.log(`  RPC URL: ${verificationResult.errorDetails.rpcUrl}`);
        }
      }

      console.log('\n💡 Possible causes:');
      console.log('   - Token does not exist on blockchain');
      console.log('   - Merkle root mismatch (ZIP file may have been modified)');
      console.log('   - Network connectivity issues');
      console.log('   - Invalid contract address or network');
    }

    console.log('═'.repeat(80));
    console.log();

    // Exit with appropriate code
    process.exit(verificationResult.success ? 0 : 1);

  } catch (error) {
    console.error('❌ Error during verification:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
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

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

