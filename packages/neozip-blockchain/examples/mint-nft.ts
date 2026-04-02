/**
 * Mint NFT Proof Token
 * 
 * Mints an NFT proof token for a timestamped ZIP file.
 * The NFT proves ownership and links to the original timestamp transaction.
 * 
 * This script:
 * 1. Reads the ZIP file and extracts TIMESTAMP.NZIP metadata
 * 2. Calls the Zipstamp server to prepare mint data
 * 3. Checks if the digest is already minted
 * 4. Sends mintWithTimestampProof() transaction from user's wallet
 * 5. Creates a new ZIP with TOKEN.NZIP containing extended metadata
 * 
 * Usage:
 *   yarn example:mint-nft <input.nzip> [output.nzip]
 *   ts-node examples/mint-nft.ts <input.nzip> [output.nzip] --private-key 0x...
 *   ts-node examples/mint-nft.ts <input.nzip> --private-key 0x... --chain-id 84532
 * 
 * Options:
 *   --private-key   User's wallet private key (required)
 *   --chain-id      Chain ID to mint on (defaults to chain from timestamp metadata)
 * 
 * Environment:
 *   ZIPSTAMP_SERVER_URL  Zipstamp server URL (default: https://zipstamp-dev.neozip.io)
 *   USER_PRIVATE_KEY  Alternative to --private-key flag
 * 
 * Examples:
 *   USER_PRIVATE_KEY=0x... yarn example:mint-nft examples/output/stamp-upgrade.nzip
 *   ts-node examples/mint-nft.ts examples/output/stamp-upgrade.nzip --private-key 0x...
 */

// Load environment variables from .env.local or .env
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  config({ path: envPath });
} else {
  config();
}

import { ethers } from 'ethers';
import { ZipkitNode, ZipCopyNode, ZipEntry, crc32 } from 'neozipkit/node';
import { 
  prepareMint, 
  checkNFTStatus, 
  getZipStampServerUrl,
  type PrepareMintResponse,
  type TimestampMetadata,
  TIMESTAMP_METADATA,
  SUBMIT_METADATA,
  NFT_METADATA,
  NFT_METADATA_LEGACY,
  findMetadataEntry,
  getMetadataFileNames,
} from '../src/zipstamp-server';

import * as os from 'os';

// Import NFT contract ABI and extended token metadata type from library
import { NZIP_CONTRACT_ABI_V250 } from '../src/core/contracts';
import type { ExtendedTokenMetadata } from '../src/zipstamp-server';

/**
 * Convert Unix timestamp to DOS date/time format
 */
function unixToDosDateTime(unixTimestamp: number): number {
  const date = new Date(unixTimestamp * 1000);
  const dosTime = ((date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2))) & 0xFFFF;
  const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xFFFF;
  return (dosDate << 16) | dosTime;
}

/**
 * Create and append a stored entry to the destination file
 */
function appendStoredEntry(
  destPath: string,
  dataOffset: number,
  filename: string,
  data: Buffer,
  timestamp?: number
): { entry: ZipEntry; newOffset: number } {
  // Create ZipEntry
  const entry = new ZipEntry(filename);
  entry.crc = crc32(data) >>> 0;
  entry.compressedSize = data.length;
  entry.uncompressedSize = data.length;
  entry.cmpMethod = 0; // STORED
  entry.localHdrOffset = dataOffset;
  
  // Set timestamp
  const ts = timestamp !== undefined ? timestamp : Math.floor(Date.now() / 1000);
  entry.timeDateDOS = unixToDosDateTime(ts);
  
  // Create local header
  const localHdr = entry.createLocalHdr();
  
  // Write to file
  const fd = fs.openSync(destPath, 'a');
  fs.writeSync(fd, localHdr);
  fs.writeSync(fd, data);
  fs.closeSync(fd);
  
  return {
    entry,
    newOffset: dataOffset + localHdr.length + data.length
  };
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
  inputPath: string;
  outputPath?: string;
  privateKey?: string;
  chainId?: number;
} {
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  let privateKey = process.env.USER_PRIVATE_KEY;
  let chainId: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--private-key' && args[i + 1]) {
      privateKey = args[i + 1];
      i++;
    } else if (arg === '--chain-id' && args[i + 1]) {
      chainId = parseInt(args[i + 1], 10);
      i++;
    } else if (!arg.startsWith('--')) {
      if (!inputPath) {
        inputPath = arg;
      } else if (!outputPath) {
        outputPath = arg;
      }
    }
  }

  if (!inputPath) {
    throw new Error('Input file path is required');
  }

  return { inputPath, outputPath, privateKey, chainId };
}

async function main() {
  console.log('Mint NFT Proof Token\n');

  // Parse arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log('Usage: tsx stamp-zip/mint-nft.ts <input.nzip> [output.nzip] --private-key 0x...');
    console.log();
    console.log('Options:');
    console.log('  --private-key   User wallet private key (or set USER_PRIVATE_KEY env var)');
    console.log('  --chain-id      Chain ID to mint on (defaults to chain from timestamp)');
    console.log();
    console.log('Examples:');
    console.log('  tsx stamp-zip/mint-nft.ts stamped.nzip --private-key 0x...');
    console.log('  tsx stamp-zip/mint-nft.ts stamped.nzip minted.nzip --private-key 0x...');
    console.log('  USER_PRIVATE_KEY=0x... tsx stamp-zip/mint-nft.ts stamped.nzip');
    process.exit(0);
  }

  let inputPath: string;
  let outputPath: string | undefined;
  let privateKey: string | undefined;
  let chainIdArg: number | undefined;

  try {
    const parsed = parseArgs(args);
    inputPath = parsed.inputPath;
    outputPath = parsed.outputPath;
    privateKey = parsed.privateKey;
    chainIdArg = parsed.chainId;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
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

  // Generate output path if not provided
  if (!outputPath) {
    const inputDir = path.dirname(inputPath);
    const inputBase = path.basename(inputPath);
    const inputExt = path.extname(inputBase);
    const inputName = path.basename(inputBase, inputExt);
    outputPath = path.join(inputDir, `${inputName}-nft${inputExt}`);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`📦 Input: ${inputPath}`);
  console.log(`📤 Output: ${outputPath}`);
  console.log();

  const tempDir = os.tmpdir();

  try {
    // Step 1: Read the ZIP file and extract metadata
    console.log('Step 1: Reading ZIP file...');
    const zip = new ZipkitNode();
    await zip.loadZipFile(inputPath);

    // Check for timestamp metadata
    const entries = zip.getDirectory();
    const metadataResult = findMetadataEntry(entries);

    if (!metadataResult) {
      console.error('❌ Error: No timestamp metadata found');
      console.error(`   Expected files: ${getMetadataFileNames().join(' or ')}`);
      console.error('   This ZIP file must have a confirmed timestamp first.');
      console.error('   Use upgrade-zip.ts to upgrade a pending timestamp.');
      await zip.closeFile();
      process.exit(1);
    }

    // Must have confirmed timestamp (TIMESTAMP.NZIP)
    if (metadataResult.type !== 'confirmed') {
      console.error('❌ Error: ZIP file has pending timestamp');
      console.error('   You need to upgrade the timestamp first using upgrade-zip.ts');
      await zip.closeFile();
      process.exit(1);
    }

    // Check if TOKEN.NZIP (or legacy NZIP.TOKEN) already exists
    const nftEntry = entries.find((e: any) => e.filename === NFT_METADATA || e.filename === NFT_METADATA_LEGACY);
    if (nftEntry) {
      const formatName = nftEntry.filename === NFT_METADATA ? 'TOKEN.NZIP' : 'NZIP.TOKEN (legacy, read-only)';
      console.log(`⚠️  Warning: ZIP already contains ${formatName}`);
      console.log('   This file may already have an NFT minted.');
      console.log('   Proceeding will create a new output file...');
      console.log();
    }

    // Extract metadata to temp file
    const tempMetadataFile = path.join(tempDir, `timestamp-metadata-${Date.now()}.json`);
    
    let timestampMetadata: TimestampMetadata;
    try {
      await zip.extractToFile(metadataResult.entry, tempMetadataFile);
      const metadataContent = fs.readFileSync(tempMetadataFile, 'utf8');
      fs.unlinkSync(tempMetadataFile);
      timestampMetadata = JSON.parse(metadataContent);
    } catch (error) {
      console.error('❌ Error: Could not read timestamp metadata');
      await zip.closeFile();
      process.exit(1);
    }

    await zip.closeFile();

    console.log('✅ Timestamp metadata extracted');
    console.log(`   Digest: ${timestampMetadata.digest}`);
    console.log(`   Batch: ${timestampMetadata.batchNumber || 'Unknown'}`);
    console.log(`   Transaction: ${timestampMetadata.transactionHash}`);
    console.log();

    const chainId = chainIdArg || timestampMetadata.chainId;
    if (!chainId) {
      console.error('❌ Error: Chain ID not specified and not found in metadata');
      console.error('   Use --chain-id to specify the chain');
      process.exit(1);
    }

    console.log(`   Chain ID: ${chainId}`);
    console.log();

    // Step 2: Check if already minted
    console.log('Step 2: Checking if already minted...');
    const zipStampServerUrl = getZipStampServerUrl();
    console.log(`   Server: ${zipStampServerUrl}`);

    let nftStatus;
    try {
      nftStatus = await checkNFTStatus(timestampMetadata.digest, chainId);
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`\n💡 Make sure the Zipstamp server is running at ${zipStampServerUrl}`);
      process.exit(1);
    }

    if (nftStatus.isMinted) {
      console.log(`⚠️  NFT already minted!`);
      console.log(`   Token ID: ${nftStatus.tokenId}`);
      console.log(`   Owner: ${nftStatus.owner}`);
      console.log();
      console.log('   Each digest can only be minted once.');
      console.log('   If you own this token, you can still create the TOKEN.NZIP file.');
      
      // Ask if they want to proceed to create TOKEN.NZIP anyway
      // For now, we'll proceed with the existing token data
      console.log('   Proceeding to create TOKEN.NZIP with existing token data...');
      console.log();
    } else {
      console.log('✅ Digest not yet minted');
      console.log();
    }

    // Step 3: Prepare mint data
    console.log('Step 3: Preparing mint data...');
    
    // Pass batchId from timestamp metadata to ensure we use the correct batch
    const batchId = timestampMetadata.batchId || undefined;
    if (batchId) {
      console.log(`   Using batch ID: ${batchId}`);
    }
    
    let mintData: PrepareMintResponse['mintData'];
    try {
      const prepareResult = await prepareMint(timestampMetadata.digest, chainId, batchId);
      if (!prepareResult.success || !prepareResult.mintData) {
        console.error(`❌ Error: ${prepareResult.error || 'Failed to prepare mint data'}`);
        process.exit(1);
      }
      mintData = prepareResult.mintData;
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }

    console.log('✅ Mint data prepared');
    console.log(`   NFT Contract: ${mintData.nftContractAddress}`);
    console.log(`   Mint Fee: ${mintData.mintFee} ETH`);
    console.log(`   Batch Transaction: ${mintData.batchTransactionHash}`);
    console.log();

    let tokenId: string;
    let mintTransactionHash: string;
    let mintBlockNumber: number;
    let ownerAddress: string;

    if (nftStatus.isMinted && nftStatus.tokenId) {
      // Already minted - use existing data
      tokenId = nftStatus.tokenId;
      ownerAddress = nftStatus.owner || 'unknown';
      mintTransactionHash = 'already-minted';
      mintBlockNumber = 0;
      
      console.log('Step 4: Skipping mint (already minted)');
      console.log(`   Using existing token ID: ${tokenId}`);
      console.log();
    } else {
      // Step 4: Connect wallet and send transaction
      console.log('Step 4: Connecting wallet and minting NFT...');

      // Get RPC URL from mint data network
      const rpcUrls: Record<number, string> = {
        84532: 'https://sepolia.base.org',
        421614: 'https://sepolia-rollup.arbitrum.io/rpc',
        11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
        8453: 'https://mainnet.base.org',
        42161: 'https://arb1.arbitrum.io/rpc',
        1: 'https://eth.llamarpc.com',
      };

      const rpcUrl = rpcUrls[chainId];
      if (!rpcUrl) {
        console.error(`❌ Error: Unknown chain ID ${chainId}`);
        process.exit(1);
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
      const wallet = new ethers.Wallet(privateKey, provider);
      ownerAddress = wallet.address;

      console.log(`   Wallet: ${wallet.address}`);
      
      // Check balance
      const balance = await provider.getBalance(wallet.address);
      const balanceEth = ethers.formatEther(balance);
      console.log(`   Balance: ${balanceEth} ETH`);

      const mintFeeWei = BigInt(mintData.mintFeeWei);
      if (balance < mintFeeWei) {
        console.error(`❌ Error: Insufficient balance`);
        console.error(`   Required: ${mintData.mintFee} ETH`);
        console.error(`   Available: ${balanceEth} ETH`);
        process.exit(1);
      }

      // Create contract instance
      const nftContract = new ethers.Contract(
        mintData.nftContractAddress,
        NZIP_CONTRACT_ABI_V250,
        wallet
      );

      // Send mint transaction
      console.log('   Sending transaction...');
      
      try {
        const tx = await nftContract.mintWithTimestampProof(
          mintData.digest,
          mintData.merkleProof,
          mintData.batchMerkleRoot,
          { value: mintFeeWei }
        );

        console.log(`   Transaction: ${tx.hash}`);
        console.log('   Waiting for confirmation...');

        const receipt = await tx.wait();
        
        if (!receipt || receipt.status !== 1) {
          throw new Error('Transaction failed');
        }

        mintTransactionHash = receipt.hash;
        mintBlockNumber = receipt.blockNumber;

        // Parse TimestampProofMinted event to get token ID
        tokenId = '0';
        for (const eventLog of receipt.logs) {
          try {
            const parsed = nftContract.interface.parseLog({
              topics: eventLog.topics as string[],
              data: eventLog.data,
            });
            if (parsed && parsed.name === 'TimestampProofMinted') {
              tokenId = parsed.args.tokenId.toString();
              break;
            }
          } catch {
            // Not our event
          }
        }

        console.log('✅ NFT minted successfully!');
        console.log(`   Token ID: ${tokenId}`);
        console.log(`   Transaction: ${mintTransactionHash}`);
        console.log(`   Block: ${mintBlockNumber}`);
        console.log();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('digest already minted')) {
          console.error('❌ Error: This digest has already been minted');
          console.error('   Each digest can only be minted once.');
        } else if (errorMessage.includes('invalid proof')) {
          console.error('❌ Error: Invalid merkle proof');
          console.error('   The proof verification failed on the blockchain.');
        } else {
          console.error(`❌ Error: ${errorMessage}`);
        }
        process.exit(1);
      }
    }

    // Step 5: Create TOKEN.NZIP metadata
    console.log('Step 5: Creating TOKEN.NZIP metadata...');

    const nftMetadata: ExtendedTokenMetadata = {
      // Standard neozipkit fields
      tokenId,
      contractAddress: mintData.nftContractAddress,
      network: mintData.network,
      merkleRoot: mintData.digest, // ZIP's merkle root = digest
      networkChainId: chainId,
      contractVersion: mintData.contractVersion,
      transactionHash: mintTransactionHash,
      blockNumber: mintBlockNumber,
      owner: ownerAddress,
      mintedAt: new Date().toISOString(),
      
      // Extended timestamp proof fields
      timestampProof: {
        digest: mintData.digest,
        merkleProof: mintData.merkleProof,
        batchMerkleRoot: mintData.batchMerkleRoot,
        batchNumber: mintData.batchNumber,
        batchTransactionHash: mintData.batchTransactionHash,
        batchBlockNumber: mintData.batchBlockNumber,
        batchTimestamp: mintData.batchTimestamp,
        registryAddress: mintData.registryAddress,
        nftContractAddress: mintData.nftContractAddress,
        serverUrl: getZipStampServerUrl(),
      },
    };

    // Step 6: Create new ZIP with TOKEN.NZIP
    console.log('Step 6: Creating output ZIP file...');

    const tempOutputPath = path.join(tempDir, `nft-${Date.now()}.nzip`);

    // Create output directory if needed
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Copy all entries, excluding timestamp metadata (TIMESTAMP.NZIP, TS-SUBMIT.NZIP)
    // and any existing token metadata (TOKEN.NZIP standard; legacy NZIP.TOKEN), then append TOKEN.NZIP
    const zipCopy = new ZipCopyNode();
    const { dataEndOffset, copiedEntries } = await zipCopy.copyZipEntriesOnly(inputPath, tempOutputPath, {
      entryFilter: (entry) => 
        entry.filename !== NFT_METADATA && 
        entry.filename !== NFT_METADATA_LEGACY && 
        entry.filename !== TIMESTAMP_METADATA && 
        entry.filename !== SUBMIT_METADATA
    });

    // Append TOKEN.NZIP
    const nftMetadataContent = JSON.stringify(nftMetadata, null, 2);
    const nftMetadataBuffer = Buffer.from(nftMetadataContent, 'utf8');
    
    // Append entry using neozipkit ZipEntry
    const { entry: newEntry } = appendStoredEntry(
      tempOutputPath,
      dataEndOffset,
      NFT_METADATA,
      nftMetadataBuffer
    );
    
    // Write central directory and EOCD with all entries
    const allEntries = [...copiedEntries, newEntry];
    zipCopy.writeCentralDirectoryAndEOCD(tempOutputPath, allEntries);

    // Move to final location
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    fs.renameSync(tempOutputPath, outputPath);

    const finalStats = fs.statSync(outputPath);

    console.log('✅ Output file created!');
    console.log();

    // Display summary
    console.log('═'.repeat(60));
    console.log('✅ NFT MINTING COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Output: ${outputPath} (${formatBytes(finalStats.size)})`);
    console.log();
    console.log('NFT Details:');
    console.log(`  Token ID: ${tokenId}`);
    console.log(`  Contract: ${mintData.nftContractAddress}`);
    console.log(`  Owner: ${ownerAddress}`);
    console.log(`  Network: ${mintData.network} (Chain ${chainId})`);
    console.log();
    console.log('Timestamp Proof:');
    console.log(`  Digest: ${mintData.digest}`);
    console.log(`  Batch: ${mintData.batchNumber}`);
    console.log(`  Batch Transaction: ${mintData.batchTransactionHash}`);
    console.log(`  Batch Timestamp: ${new Date(mintData.batchTimestamp * 1000).toISOString()}`);
    console.log();
    console.log('The TOKEN.NZIP file contains both NFT ownership proof');
    console.log('and a link to the original timestamp transaction.');
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('❌ Error during NFT minting:');
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

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
