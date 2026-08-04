#!/usr/bin/env node

/**
 * Stamp ZIP - Simple ZIP File Compressor with Timestamping
 * 
 * Creates a timestamped ZIP file from input files (supports wildcards).
 * 
 * Usage:
 *   pnpm example:timestamp <output.zip> <input-file-pattern> [input-file-pattern2] ...
 *   ts-node examples/stamp-zip.ts <output.zip> <input-file-pattern> [input-file-pattern2] ...
 * 
 * Examples:
 *   pnpm example:timestamp examples/output/stamp.nzip examples/test-files/*
 *   ts-node examples/stamp-zip.ts examples/output/stamp.nzip examples/test-files/*
 *   ts-node examples/stamp-zip.ts examples/output/stamp.nzip *.txt
 *   ts-node examples/stamp-zip.ts examples/output/stamp.nzip file1.txt file2.txt file3.txt
 * 
 * PREREQUISITES:
 * - NeoZip Token Service (default: https://testnet.token-service.neozip.io)
 * - Set TOKEN_SERVICE_URL if different from the default
 */

// ZIP operations from neozipkit (peer dependency)
import { ZipkitNode, CompressOptions } from 'neozipkit/node';

// NeoZip Token Service API client
import {
  submitDigest,
  getTokenServiceUrl,
  resolveNetworkProfile,
  type TimestampMetadata,
  SUBMIT_METADATA,
} from '../src/token-service';

import * as fs from 'fs';
import * as path from 'path';

/**
 * Returns true if the error indicates the email must be verified (NeoZip Token Service).
 */
function isEmailVerifyError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('email') &&
    (lower.includes('verified') || lower.includes('verify') || lower.includes('verification'))
  );
}

/**
 * Simple wildcard pattern matcher
 * Supports * for any characters and ? for single character
 */
function matchesPattern(filename: string, pattern: string): boolean {
  // Convert pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')  // Escape dots
    .replace(/\*/g, '.*')   // * matches any characters
    .replace(/\?/g, '.');   // ? matches single character
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}

/**
 * Expand file patterns to actual file paths
 * @param patterns Array of file patterns (can include wildcards)
 * @returns Array of resolved file paths
 */
function expandFilePatterns(patterns: string[]): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    // Check if pattern contains wildcards
    if (pattern.includes('*') || pattern.includes('?')) {
      // Split pattern into directory and filename parts
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
      
      // Read directory and match files
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
      // Regular file path
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

  return files.sort(); // Sort for consistent ordering
}

/**
 * Create a timestamped ZIP file from input files
 * @param outputZipPath Path to the output ZIP file
 * @param inputFiles Array of input file paths or patterns (supports wildcards)
 * @param email Optional email for digest submission
 * @param chainId Optional chain ID for digest submission
 * @param network Optional network profile (base-sepolia | base)
 */
export async function createTimestampedZip(
  outputZipPath: string,
  inputFiles: string[],
  email?: string,
  chainId?: number,
  network?: string
): Promise<void> {
  // Expand file patterns to actual file paths
  const resolvedFiles = expandFilePatterns(inputFiles);

  if (resolvedFiles.length === 0) {
    throw new Error('No input files found matching the provided patterns');
  }

  console.log(`Input files (${resolvedFiles.length}):`);
  resolvedFiles.forEach(file => {
    const stats = fs.statSync(file);
    console.log(`  - ${path.basename(file)} (${stats.size} bytes)`);
  });
  console.log();

  // Resolve network profile (TOKEN_SERVICE_NETWORK / TOKEN_SERVICE_CHAIN_ID / defaults)
  let profile;
  try {
    profile = resolveNetworkProfile({
      network: network || process.env.TOKEN_SERVICE_NETWORK,
      chainId:
        chainId ??
        (process.env.TOKEN_SERVICE_CHAIN_ID
          ? parseInt(process.env.TOKEN_SERVICE_CHAIN_ID, 10)
          : process.env.NEOZIP_CHAIN_ID
            ? parseInt(process.env.NEOZIP_CHAIN_ID, 10)
            : undefined),
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const tokenServiceUrl = getTokenServiceUrl({
    network: profile.key,
    chainId: profile.chainId,
  });
  
  // Email is required for NeoZip Token Service (verified email)
  const submitEmail = email || process.env.TOKEN_SERVICE_EMAIL;
  if (!submitEmail) {
    console.error('No email set. NeoZip Token Service requires a verified email.');
    console.error('Run: pnpm verify-email');
    console.error('Then run this example again, or set TOKEN_SERVICE_EMAIL in .env.local');
    process.exit(1);
  }
  
  const submitChainId = chainId ?? profile.chainId;

  console.log(`Network: ${profile.label} (${profile.key})`);
  console.log(`NeoZip Token Service: ${tokenServiceUrl}`);
  if (submitEmail) {
    console.log(`Email: ${submitEmail}`);
  }
  console.log(`Chain ID: ${submitChainId}`);
  console.log();

  // Create ZipkitNode instance
  const zip = new ZipkitNode();

  // Ensure output directory exists
  const outputDir = path.dirname(outputZipPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Compression options with SHA-256 enabled (required for merkle root calculation)
  const options: CompressOptions = {
    level: 6,
    useZstd: true,
    useSHA256: true  // IMPORTANT: Enable SHA-256 for timestamping features
  };

  try {
    console.log('Step 1: Creating ZIP archive with SHA-256 hashes...');
    
    // Initialize ZIP file writer
    const writer = await zip.initializeZipFile(outputZipPath);

    // Add all input files to ZIP
    for (const filePath of resolvedFiles) {
      const entry = await zip.prepareEntryFromFile(filePath);
      await zip.writeZipEntry(writer, entry, filePath, options);
    }

    // Get merkle root (entries already have SHA-256 values from compression)
    console.log('Step 2: Calculating merkle root...');
    const merkleRoot = (zip as any).getMerkleRoot?.();
    
    if (!merkleRoot) {
      console.error('❌ Error: Could not calculate merkle root');
      console.error('   Make sure useSHA256: true is set in compression options');
      await zip.finalizeZipFile(writer);
      await zip.closeFile();
      throw new Error('Could not calculate merkle root');
    }

    console.log(`✅ Merkle root calculated: ${merkleRoot}\n`);

    // Step 3: Submit digest to NeoZip Token Service
    console.log('Step 3: Submitting digest to NeoZip Token Service...');
    console.log(`   Digest: ${merkleRoot}\n`);
    
    let submitResult;
    let submissionFailed = false;
    try {
      submitResult = await submitDigest(merkleRoot, submitEmail, submitChainId, {
        network: profile.key,
        chainId: profile.chainId,
        serverUrl: tokenServiceUrl,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn('⚠️  Warning: Failed to submit digest to NeoZip Token Service');
      console.warn(`   ${errMsg}`);
      if (isEmailVerifyError(errMsg)) {
        console.warn(`\n💡 Register and verify your email first: pnpm verify-email`);
      } else {
        console.warn(`\n💡 Make sure the NeoZip Token Service is running at ${tokenServiceUrl}`);
      }
      console.warn('   ZIP file will be created without timestamp metadata.\n');
      submissionFailed = true;
      submitResult = null;
    }

    if (!submissionFailed && submitResult && !submitResult.success) {
      const errMsg = submitResult.error || 'Failed to submit digest';
      console.warn(`⚠️  Warning: ${errMsg}`);
      if (isEmailVerifyError(errMsg)) {
        console.warn(`\n💡 Register and verify your email first: pnpm verify-email`);
      }
      console.warn('   ZIP file will be created without timestamp metadata.\n');
      submissionFailed = true;
      submitResult = null;
    }

    // Step 4: Add submission metadata to ZIP (if submission succeeded)
    if (!submissionFailed && submitResult) {
      console.log('✅ Digest submitted successfully');
      console.log(`   Status: ${submitResult.status}`);
      if (submitResult.batchId) {
        console.log(`   Batch ID: ${submitResult.batchId}`);
      }
      if (submitResult.network) {
        console.log(`   Network: ${submitResult.network}`);
      }
      console.log();

      console.log('Step 4: Adding submission metadata to ZIP file...');
      
      // Batch number should always be provided by the API response
      const batchNumber: number | undefined = submitResult.batchNumber;
      
      const submitMetadata: TimestampMetadata = {
        digest: merkleRoot,
        batchId: submitResult.batchId || null,
        batchNumber: batchNumber, // Batch number is ALWAYS known
        // chainId is needed for verification API calls (can't be derived from batchId alone)
        // network can be derived from batchId prefix "base-sep" -> Base Sepolia
        chainId: submitResult.chainId,
        // status is not included in TS-SUBMIT metadata as it becomes stale
        // Status is determined by querying the server/blockchain
        serverUrl: tokenServiceUrl,
        submittedAt: new Date().toISOString(),
      };
    
      // Create metadata content
      const metadataContent = JSON.stringify(submitMetadata, null, 2);
      const metadataBuffer = Buffer.from(metadataContent, 'utf8');

      // Write metadata to a temporary file, then add it to ZIP
      const tempMetadataFile = path.join(outputDir, `.temp-${Date.now()}-metadata.json`);
      try {
        fs.writeFileSync(tempMetadataFile, metadataBuffer);
        
        // Add metadata entry (STORED, uncompressed)
        const metadataEntry = await zip.prepareEntryFromFile(tempMetadataFile);
        metadataEntry.filename = SUBMIT_METADATA; // Override filename
        metadataEntry.cmpMethod = 0; // STORED (no compression)
        metadataEntry.compressedSize = metadataBuffer.length;
        
        // Write the metadata entry to the ZIP file with STORED compression
        await zip.writeZipEntry(writer, metadataEntry, tempMetadataFile, { 
          level: 0, 
          useZstd: false, 
          useSHA256: false 
        });
        
        // Clean up temporary file
        fs.unlinkSync(tempMetadataFile);
      } catch (error) {
        // Clean up temporary file on error
        if (fs.existsSync(tempMetadataFile)) {
          fs.unlinkSync(tempMetadataFile);
        }
        throw error;
      }
      
      console.log(`✅ Submission metadata added: ${SUBMIT_METADATA}\n`);
    } else {
      console.log('Step 4: Skipping metadata (server submission failed)\n');
    }

    // Step 5: Finalize ZIP file
    console.log('Step 5: Finalizing ZIP file...');
    
    // Get all entries including the metadata
    const allEntries = zip.getDirectory();

    // Write central directory
    const centralDirOffset = writer.currentPosition;
    const centralDirSize = await zip.writeCentralDirectory(writer, allEntries);

    // Write End of Central Directory
    await zip.writeEndOfCentralDirectory(
      writer,
      allEntries.length,
      centralDirSize,
      centralDirOffset
    );

    // Finalize and close the ZIP file
    await zip.finalizeZipFile(writer);
    await zip.closeFile();

    console.log(`✅ ZIP file written to disk: ${outputZipPath}\n`);

    console.log('✅ Timestamped ZIP file created successfully!');
    console.log(`   File: ${outputZipPath}`);
    console.log(`\n📄 To verify this file, run:`);
    console.log(`   tsx stamp-zip/verify-zip.ts ${outputZipPath}`);
    console.log();

  } catch (error) {
    console.error('❌ Error during timestamping:');
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
    throw error;
  }
}

async function main() {
  console.log('Stamp ZIP - Simple ZIP File Compressor with Timestamping\n');

  const args = process.argv.slice(2);

  let network: string | undefined;
  let chainId: number | undefined;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--network' || args[i] === '-n') {
      network = args[++i];
    } else if (args[i] === '--chain-id' || args[i] === '-c') {
      chainId = parseInt(args[++i] || '', 10);
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage:');
      console.log(
        '  tsx examples/stamp-zip.ts <output.zip> <input...> [--network base-sepolia|base] [--chain-id <id>]'
      );
      console.log('\nEnv:');
      console.log('  TOKEN_SERVICE_NETWORK   base-sepolia (default) or base');
      console.log('  TOKEN_SERVICE_CHAIN_ID  numeric override (e.g. 84532, 8453)');
      console.log('  TOKEN_SERVICE_URL       explicit server URL override');
      console.log('  TOKEN_SERVICE_EMAIL     verified email for stamp submissions');
      process.exit(0);
    } else if (!args[i].startsWith('-')) {
      positional.push(args[i]);
    }
  }

  if (positional.length < 2) {
    console.error('❌ Error: Missing required arguments');
    console.error('\nUsage:');
    console.error(
      '  tsx examples/stamp-zip.ts <output.zip> <input...> [--network base-sepolia|base]'
    );
    process.exit(1);
  }

  const outputZip = positional[0];
  const inputPatterns = positional.slice(1);

  if (!outputZip.endsWith('.zip') && !outputZip.endsWith('.nzip')) {
    console.error('❌ Error: Output file must have .zip or .nzip extension');
    process.exit(1);
  }

  const outputZipPath = path.isAbsolute(outputZip)
    ? outputZip
    : path.resolve(process.cwd(), outputZip);

  try {
    await createTimestampedZip(
      outputZipPath,
      inputPatterns,
      undefined,
      chainId,
      network
    );
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the example if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
