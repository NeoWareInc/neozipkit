/**
 * Upgrade ZIP Timestamp
 * 
 * Upgrades a pending timestamp (TS-SUBMIT.NZIP) to a confirmed timestamp (TIMESTAMP.NZIP)
 * once the batch has been minted on the blockchain.
 * 
 * Similar to OpenTimestamps' `ots upgrade` command:
 * - Checks if the batch has been confirmed on the blockchain
 * - If confirmed, downloads the complete proof data (merkle proof, transaction hash, etc.)
 * - Creates a new ZIP file with TIMESTAMP.NZIP containing complete proof
 * - The original ZIP file is preserved
 * - The upgraded ZIP can be verified directly against the blockchain without the Zipstamp server
 * 
 * Usage:
 *   yarn example:upgrade <input.nzip> [output.nzip]
 *   ts-node examples/upgrade-zip.ts <input.nzip> [output.nzip]
 *   ts-node examples/upgrade-zip.ts <input.nzip> --wait
 * 
 * Options:
 *   --wait    Poll until the batch is confirmed (default: check once and report status)
 * 
 * Examples:
 *   yarn example:upgrade examples/output/stamp.nzip
 *     # Creates: examples/output/stamp-upgrade.nzip
 *   ts-node examples/upgrade-zip.ts examples/output/stamp.nzip custom-name.nzip
 *     # Creates: custom-name.nzip
 *   ts-node examples/upgrade-zip.ts examples/output/stamp.nzip --wait
 */

import { ZipkitNode, ZipCopyNode, ZipEntry, crc32 } from 'neozipkit/node';
import { verifyDigest, pollForConfirmation, getZipStampServerUrl, type TimestampMetadata, SUBMIT_METADATA, TIMESTAMP_METADATA, findMetadataEntry, shouldUpgrade, getMetadataFileNames } from '../src/zipstamp-server';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

async function main() {
  console.log('Upgrade ZIP Timestamp\n');

  // Parse arguments
  const args = process.argv.slice(2);
  const waitMode = args.includes('--wait');
  const nonFlagArgs = args.filter(arg => !arg.startsWith('--'));

  if (nonFlagArgs.length === 0) {
    console.error('Usage: tsx stamp-zip/upgrade-zip.ts <input.nzip> [output.nzip] [--wait]');
    console.error('\nOptions:');
    console.error('  --wait    Poll until the batch is confirmed');
    console.error('\nExamples:');
    console.error('  tsx stamp-zip/upgrade-zip.ts stamp-zip/output/stamped.nzip');
    console.error('  tsx stamp-zip/upgrade-zip.ts stamp-zip/output/stamped.nzip custom-name.nzip');
    console.error('  tsx stamp-zip/upgrade-zip.ts stamp-zip/output/stamped.nzip --wait');
    process.exit(1);
  }

  const inputPath = nonFlagArgs[0];
  
  // If output path is specified, use it; otherwise append "-upgrade" before the extension
  let outputPath = nonFlagArgs[1];
  if (!outputPath) {
    const inputDir = path.dirname(inputPath);
    const inputBase = path.basename(inputPath);
    const inputExt = path.extname(inputBase);
    const inputName = path.basename(inputBase, inputExt);
    outputPath = path.join(inputDir, `${inputName}-upgrade${inputExt}`);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`📦 Input: ${inputPath}`);
  console.log(`📤 Output: ${outputPath}`);
  if (waitMode) {
    console.log(`⏳ Mode: Wait for confirmation`);
  }
  console.log();

  const tempDir = os.tmpdir();

  try {
    // Step 1: Read the ZIP file and extract metadata
    console.log('Step 1: Reading ZIP file...');
    const zip = new ZipkitNode();
    await zip.loadZipFile(inputPath);

    // Check for timestamp metadata using utilities
    const entries = zip.getDirectory();
    const metadataResult = findMetadataEntry(entries);

    if (!metadataResult) {
      console.error('❌ Error: No timestamp metadata found');
      console.error(`   Expected files: ${getMetadataFileNames().join(' or ')}`);
      console.error('   This ZIP file does not appear to be timestamped.');
      console.error('   Use stamp-zip.ts to create a timestamped ZIP file first.');
      await zip.closeFile();
      process.exit(1);
    }

    // If already confirmed, no upgrade needed
    if (metadataResult.type === 'confirmed') {
      console.log('✅ ZIP already has confirmed timestamp (TIMESTAMP.NZIP)');
      console.log('   No upgrade needed.');
      await zip.closeFile();
      process.exit(0);
    }

    // Extract metadata to temp file
    const tempSubmitMetadataFile = path.join(tempDir, `submit-metadata-${Date.now()}.json`);
    
    let metadata: TimestampMetadata;
    try {
      await zip.extractToFile(metadataResult.entry, tempSubmitMetadataFile);
      const metadataContent = fs.readFileSync(tempSubmitMetadataFile, 'utf8');
      fs.unlinkSync(tempSubmitMetadataFile);
      metadata = JSON.parse(metadataContent);
    } catch (error) {
      console.error('❌ Error: Could not read timestamp metadata');
      await zip.closeFile();
      process.exit(1);
    }

    console.log('✅ Pending timestamp metadata extracted');
    console.log(`   Digest: ${metadata.digest}`);
    console.log(`   Batch ID: ${metadata.batchId || 'Not assigned'}`);
    if (metadata.batchNumber) {
      console.log(`   Batch Number: ${metadata.batchNumber}`);
    }
    console.log();

    // Step 2: Check if batch is confirmed
    console.log('Step 2: Checking batch status...');
    const zipStampServerUrl = getZipStampServerUrl();
    console.log(`   Server: ${zipStampServerUrl}`);

    let verificationResult;
    
    if (waitMode) {
      console.log('   Waiting for confirmation (this may take several minutes)...');
      verificationResult = await pollForConfirmation(
        metadata.digest,
        metadata.chainId,
        metadata.batchId || undefined,
        600000,  // 10 minute timeout
        10000    // Check every 10 seconds
      );
      
      if (!verificationResult) {
        console.log('\n⏳ Timeout waiting for confirmation');
        console.log('   The batch has not been minted yet.');
        console.log('   Try again later or check the admin panel.');
        await zip.closeFile();
        process.exit(1);
      }
    } else {
      try {
        verificationResult = await verifyDigest(
          metadata.digest,
          metadata.chainId,
          metadata.batchId || undefined
        );
      } catch (error) {
        console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`\n💡 Make sure the Zipstamp server is running at ${zipStampServerUrl}`);
        await zip.closeFile();
        process.exit(1);
      }
    }

    // Check status
    if (!verificationResult.success) {
      console.error(`❌ Error: ${verificationResult.error || 'Verification failed'}`);
      await zip.closeFile();
      process.exit(1);
    }

    if (verificationResult.status === 'pending' || !verificationResult.transactionHash) {
      console.log('\n⏳ BATCH PENDING');
      console.log('═'.repeat(60));
      console.log(`Digest: ${metadata.digest}`);
      console.log(`Batch ID: ${verificationResult.batchId || metadata.batchId || 'Unknown'}`);
      if (verificationResult.batchNumber) {
        console.log(`Batch Number: ${verificationResult.batchNumber}`);
      }
      console.log();
      console.log('The batch has not been minted yet.');
      console.log('Run this command again after the batch is processed,');
      console.log('or use --wait to poll until confirmed.');
      console.log('═'.repeat(60));
      await zip.closeFile();
      process.exit(1);
    }

    console.log('✅ Batch confirmed on blockchain!');
    console.log(`   Transaction: ${verificationResult.transactionHash}`);
    if (verificationResult.blockNumber) {
      console.log(`   Block: ${verificationResult.blockNumber}`);
    }
    console.log();

    // Step 3: Verify we have the merkle proof
    if (!verificationResult.merkleProof || !verificationResult.merkleRoot) {
      console.error('❌ Error: Merkle proof not available');
      console.error('   The server did not return the merkle proof needed for upgrade.');
      await zip.closeFile();
      process.exit(1);
    }

    console.log('Step 3: Creating upgraded timestamp...');

    // Build complete timestamp metadata
    const confirmedMetadata: TimestampMetadata = {
      digest: metadata.digest,
      batchId: verificationResult.batchId || metadata.batchId || null,
      batchNumber: verificationResult.batchNumber || metadata.batchNumber,
      chainId: verificationResult.chainId || metadata.chainId,
      network: verificationResult.network || metadata.network,
      status: 'confirmed',
      serverUrl: metadata.serverUrl,
      submittedAt: metadata.submittedAt,
      // Complete proof data for direct blockchain verification
      merkleProof: verificationResult.merkleProof,
      merkleRoot: verificationResult.merkleRoot,
      transactionHash: verificationResult.transactionHash,
      blockNumber: verificationResult.blockNumber,
      timestamp: verificationResult.timestamp,
      contractAddress: verificationResult.contractAddress,
      tokenId: verificationResult.tokenId,
      confirmedAt: new Date().toISOString(),
    };

    // Step 4: Create new ZIP with upgraded metadata
    console.log('Step 4: Creating upgraded ZIP file...');

    // Create temporary output file (always use temp file, then move to final location)
    const tempOutputPath = path.join(tempDir, `upgraded-${Date.now()}.nzip`);

    // Create output directory if needed
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Close the input ZIP before copying
    await zip.closeFile();

    // Copy all entries directly from source ZIP, excluding old metadata files
    // This uses ZipCopyNode for efficient copying without decompression
    const zipCopy = new ZipCopyNode();
    const { dataEndOffset, copiedEntries } = await zipCopy.copyZipEntriesOnly(inputPath, tempOutputPath, {
      entryFilter: (entry) => entry.filename !== SUBMIT_METADATA && entry.filename !== TIMESTAMP_METADATA
    });

    // Append the new TIMESTAMP.NZIP metadata entry
    const metadataContent = JSON.stringify(confirmedMetadata, null, 2);
    const metadataBuffer = Buffer.from(metadataContent, 'utf8');
    
    // Use blockchain timestamp if available, otherwise use confirmedAt timestamp
    const entryTimestamp = confirmedMetadata.timestamp 
      ? confirmedMetadata.timestamp 
      : confirmedMetadata.confirmedAt 
        ? Math.floor(new Date(confirmedMetadata.confirmedAt).getTime() / 1000)
        : undefined;
    
    // Append entry using neozipkit ZipEntry
    const { entry: newEntry } = appendStoredEntry(
      tempOutputPath, 
      dataEndOffset, 
      TIMESTAMP_METADATA, 
      metadataBuffer, 
      entryTimestamp
    );
    
    // Write central directory and EOCD with all entries
    const allEntries = [...copiedEntries, newEntry];
    zipCopy.writeCentralDirectoryAndEOCD(tempOutputPath, allEntries);
    
    // Verify the output file exists and has content
    if (!fs.existsSync(tempOutputPath)) {
      throw new Error('Failed to create output ZIP file');
    }
    
    const outputFileStats = fs.statSync(tempOutputPath);
    if (outputFileStats.size === 0) {
      throw new Error('Output ZIP file is empty');
    }

    // Move temp file to final output location (original file is preserved)
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    fs.renameSync(tempOutputPath, outputPath);

    const finalStats = fs.statSync(outputPath);

    console.log('✅ ZIP file upgraded successfully!');
    console.log();

    // Display summary
    console.log('═'.repeat(60));
    console.log('✅ UPGRADE COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Output: ${outputPath} (${formatBytes(finalStats.size)})`);
    console.log();
    console.log('Timestamp Details:');
    console.log(`  Digest: ${confirmedMetadata.digest}`);
    console.log(`  Batch ID: ${confirmedMetadata.batchId}`);
    if (confirmedMetadata.batchNumber) {
      console.log(`  Batch Number: ${confirmedMetadata.batchNumber}`);
    }
    console.log(`  Status: Confirmed`);
    console.log();
    console.log('Blockchain Proof:');
    console.log(`  Transaction: ${confirmedMetadata.transactionHash}`);
    if (confirmedMetadata.blockNumber) {
      console.log(`  Block: ${confirmedMetadata.blockNumber}`);
    }
    console.log(`  Merkle Root: ${confirmedMetadata.merkleRoot}`);
    console.log(`  Proof Length: ${confirmedMetadata.merkleProof?.length || 0} hashes`);
    if (confirmedMetadata.contractAddress) {
      console.log(`  Contract: ${confirmedMetadata.contractAddress}`);
    }
    console.log();
    console.log('The upgraded timestamp can now be verified directly against');
    console.log('the blockchain without needing the Zipstamp server.');
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('❌ Error during upgrade:');
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
