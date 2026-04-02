/**
 * ======================================
 * ZipstampServerAPI.ts - Zipstamp Server API Integration
 * ======================================
 * 
 * This module provides timestamping functionality using the Zipstamp server API,
 * similar to OpenTimestamps but using Ethereum blockchain.
 * 
 * Key Features:
 * - Ethereum blockchain timestamping via Zipstamp server
 * - Merkle root calculation and verification
 * - ZIP file integration for timestamp metadata
 * - Support for immediate, batched, and transferable modes
 * 
 * @fileoverview Zipstamp server API utilities for blockchain timestamping
 * @author NeoWare Inc.
 */

import type { ZipkitLike, ZipEntryLike } from '../types';
import { getContractConfig, getChainIdByName } from '../core/contracts';
import { getZipStampServerUrl } from '../constants/servers';
import { TS_SUBMIT_NZIP, TIMESTAMP_NZIP } from '../constants/metadata';
import { crc32 } from '../utils/crc32';
import { ethers } from 'ethers';
import type { TimestampMetadata } from './ZipstampServerHelpers';
import { submitDigest, verifyDigest } from './ZipstampServerHelpers';

export const CMP_METHOD = { STORED: 0, DEFLATED: 8 };

/**
 * Timestamp metadata format stored in ZIP files
 * Re-exported from ZipstampServerHelpers.ts
 */
export type { TimestampMetadata } from './ZipstampServerHelpers';

/**
 * Verification result for timestamped ZIP files.
 * 
 * Returned by `verifyTimestamp` and `verifyTimestampedZip` functions to indicate
 * the verification status and provide blockchain details if confirmed.
 */
export interface EthTimestampVerifyResult {
  status: 'none' | 'error' | 'pending' | 'valid';
  verified?: boolean;
  digest?: string;
  tokenId?: string;
  transactionHash?: string;
  contractAddress?: string;
  network?: string;
  blockNumber?: number;
  timestamp?: number;
  message?: string;
}

/**
 * Options for creating timestamps.
 * 
 * Configuration object passed to `createTimestamp` and `createTimestampedZip`
 * functions to customize timestamp creation behavior.
 */
export interface CreateTimestampOptions {
  mode?: 'immediate' | 'batched' | 'transferable';
  recipientAddress?: string; // Required for transferable mode
  recipientEmail?: string;
  metadata?: {
    filename?: string;
    fileSize?: number;
    fileCount?: number;
  };
  serverUrl?: string;
  debug?: boolean;
}

/**
 * Options for verifying timestamps.
 * 
 * Configuration object passed to `verifyTimestamp` and `verifyTimestampedZip`
 * functions to customize verification behavior.
 */
export interface VerifyTimestampOptions {
  serverUrl?: string;
  debug?: boolean;
}

/**
 * Safely extracts merkle root from a ZIP file.
 */
function getMerkleRootSafe(zip: ZipkitLike): string | null {
  try {
    const mr = zip.getMerkleRoot?.();
    return (typeof mr === 'string' && mr.length > 0) ? mr : null;
  } catch {
    return null;
  }
}

/**
 * Finds the timestamp metadata entry in a ZIP file.
 * 
 * Searches for timestamp metadata entries in the ZIP directory, preferring confirmed
 * timestamps (TIMESTAMP.NZIP) over pending submissions (TS-SUBMIT.NZIP).
 * 
 * @param zip - A ZipkitLike instance representing the ZIP file to search
 * @returns The ZIP entry containing timestamp metadata, or `null` if not found
 * 
 * @example
 * ```typescript
 * const entry = getEthTimestampEntry(zipkit);
 * if (entry) {
 *   const metadata = await extractTimestampData(zipkit, entry);
 *   console.log('Timestamp status:', metadata?.status);
 * }
 * ```
 */
export function getEthTimestampEntry(zip: ZipkitLike): ZipEntryLike | null {
  try {
    const entries = zip.getDirectory?.(true) || [];

    // Prefer confirmed metadata entry first
    let entry = entries.find((e: ZipEntryLike) => e && e.filename === TIMESTAMP_NZIP);
    if (entry) return entry;

    // Fallback to submitted proof entry
    entry = entries.find((e: ZipEntryLike) => e && e.filename === TS_SUBMIT_NZIP);
    if (entry) return entry;
  } catch {
    return null;
  }
  return null;
}

/**
 * Extracts timestamp metadata from a ZIP entry.
 * 
 * Reads and parses the JSON metadata from a timestamp entry (either TIMESTAMP.NZIP
 * or TS-SUBMIT.NZIP) in the ZIP file.
 * 
 * @param zip - A ZipkitLike instance representing the ZIP file
 * @param entry - The ZIP entry containing the timestamp metadata (from `getEthTimestampEntry`)
 * @returns Parsed timestamp metadata object, or `null` if extraction fails
 * 
 * @example
 * ```typescript
 * const entry = getEthTimestampEntry(zipkit);
 * if (entry) {
 *   const metadata = await extractTimestampData(zipkit, entry);
 *   if (metadata) {
 *     console.log('Digest:', metadata.digest);
 *     console.log('Batch ID:', metadata.batchId);
 *   }
 * }
 * ```
 */
export async function extractTimestampData(
  zip: ZipkitLike,
  entry: ZipEntryLike
): Promise<TimestampMetadata | null> {
  try {
    const data = await zip.extract?.(entry, true);
    if (!data) return null;

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const jsonString = buffer.toString('utf-8');
    const metadata = JSON.parse(jsonString) as TimestampMetadata;
    
    return metadata;
  } catch (error) {
    return null;
  }
}

/**
 * Creates a timestamp by submitting a merkle root to the Zipstamp server.
 * 
 * Submits a SHA-256 digest (merkle root) to the Zipstamp server API for blockchain
 * timestamping. The digest is typically the merkle root of a ZIP file's contents.
 * 
 * The function uses `submitDigest` internally and converts the response to a
 * `TimestampMetadata` format suitable for storage in ZIP files.
 * 
 * @param merkleRoot - A 64-character hexadecimal string representing the SHA-256 hash
 * @param options - Configuration options for timestamp creation
 * @param options.recipientEmail - Optional email address for notifications
 * @param options.serverUrl - Optional Zipstamp server URL (defaults to `ZIPSTAMP_SERVER_URL` env var or `https://zipstamp-dev.neozip.io`)
 * @param options.debug - Enable debug logging (defaults to `false`)
 * @param options.mode - **Deprecated**: For backward compatibility only, not sent to API
 * @param options.recipientAddress - **Deprecated**: For backward compatibility only, not sent to API
 * @param options.metadata - **Deprecated**: For backward compatibility only, not sent to API
 * @returns Promise resolving to timestamp metadata, or `null` if creation fails
 * @throws {Error} If merkle root format is invalid or API request fails
 * 
 * @example
 * ```typescript
 * const merkleRoot = 'a1b2c3d4e5f6...'; // 64-char hex string
 * const metadata = await createTimestamp(merkleRoot, {
 *   recipientEmail: 'user@example.com',
 *   debug: true
 * });
 * 
 * if (metadata) {
 *   console.log('Timestamp created:', metadata.batchId);
 *   console.log('Status:', metadata.status); // 'pending' or 'confirmed'
 * }
 * ```
 */
export async function createTimestamp(
  merkleRoot: string,
  options: CreateTimestampOptions = {}
): Promise<TimestampMetadata | null> {
  if (!merkleRoot || !/^[a-f0-9]{64}$/i.test(merkleRoot)) {
    throw new Error('Invalid merkle root format. Must be a 64-character hex string (SHA-256)');
  }

  try {
    const serverUrl = getZipStampServerUrl(options);
    
    if (options.debug) {
      console.log('[Zipstamp Server API] ========================================');
      console.log('[Zipstamp Server API] Creating Timestamp');
      console.log('[Zipstamp Server API] ========================================');
      console.log('[Zipstamp Server API] Server URL:', serverUrl);
      console.log('[Zipstamp Server API] Merkle Root:', merkleRoot);
      console.log('[Zipstamp Server API] ----------------------------------------');
    }

    // Use submitDigest helper (only digest, email, and chainId are sent to API)
    // Note: mode, recipientAddress, and metadata options are for backward compatibility
    // but are not actually sent to the Zipstamp server API
    const response = await submitDigest(
      merkleRoot,
      options.recipientEmail,
      undefined, // chainId - let server determine
      { serverUrl, debug: options.debug }
    );

    if (!response.success) {
      const errorMsg = response.error || 'Failed to create timestamp';
      if (options.debug) {
        console.error('[Zipstamp Server API] Error in response:', errorMsg);
      }
      throw new Error(errorMsg);
    }

    // Get network chain ID from network name
    const networkChainId = response.network 
      ? (getChainIdByName(response.network) || 0)
      : 0;

    // Get contract address from network config if available
    let contractAddress = '';
    if (networkChainId) {
      const config = getContractConfig(networkChainId);
      contractAddress = config?.address || '';
    }

    const timestampMetadata: TimestampMetadata = {
      digest: response.digest,
      status: response.status === 'confirmed' ? 'confirmed' : 'pending',
      tokenId: undefined, // Not in SubmitDigestResponse
      transactionHash: undefined, // Not in SubmitDigestResponse
      contractAddress,
      network: response.network || 'unknown',
      chainId: networkChainId,
      batchId: response.batchId,
      batchNumber: response.batchNumber,
      serverUrl,
      submittedAt: new Date().toISOString(),
    };

    if (options.debug) {
      console.log('[Zipstamp Server API] Processed Timestamp Metadata:');
      console.log(JSON.stringify(timestampMetadata, null, 2));
      console.log('[Zipstamp Server API] ========================================\n');
    }

    return timestampMetadata;
  } catch (error) {
    if (options.debug) {
      console.error('[Zipstamp Server API] ========================================');
      console.error('[Zipstamp Server API] Error creating timestamp:');
      console.error('[Zipstamp Server API]', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error('[Zipstamp Server API] Stack trace:');
        console.error(error.stack);
      }
      console.error('[Zipstamp Server API] ========================================\n');
    }
    throw error;
  }
}

/**
 * Verifies a timestamp against the Zipstamp server.
 * 
 * Verifies that a timestamp has been confirmed on the blockchain by checking
 * with the Zipstamp server API. Uses `verifyDigest` internally and converts the
 * response to an `EthTimestampVerifyResult` format.
 * 
 * @param merkleRoot - The SHA-256 digest (merkle root) to verify
 * @param timestampData - The timestamp metadata from the ZIP file (contains batchId, chainId, etc.)
 * @param options - Configuration options for verification
 * @param options.serverUrl - Optional Zipstamp server URL (defaults to `ZIPSTAMP_SERVER_URL` env var or `https://zipstamp-dev.neozip.io`)
 * @param options.debug - Enable debug logging (defaults to `false`)
 * @returns Promise resolving to verification result with status and blockchain details
 * 
 * @example
 * ```typescript
 * const result = await verifyTimestamp(merkleRoot, timestampMetadata, {
 *   debug: true
 * });
 * 
 * if (result.status === 'valid') {
 *   console.log('Verified on blockchain!');
 *   console.log('Transaction:', result.transactionHash);
 *   console.log('Block:', result.blockNumber);
 * } else if (result.status === 'pending') {
 *   console.log('Timestamp is pending confirmation');
 * }
 * ```
 */
export async function verifyTimestamp(
  merkleRoot: string,
  timestampData: TimestampMetadata,
  options: VerifyTimestampOptions = {}
): Promise<EthTimestampVerifyResult> {
  try {
    const serverUrl = getZipStampServerUrl(options);
    
    if (options.debug) {
      console.log('[Zipstamp Server API] ========================================');
      console.log('[Zipstamp Server API] Verifying Timestamp');
      console.log('[Zipstamp Server API] ========================================');
      console.log('[Zipstamp Server API] Server URL:', serverUrl);
      console.log('[Zipstamp Server API] Merkle Root:', merkleRoot);
      console.log('[Zipstamp Server API] Timestamp Data:');
      console.log(JSON.stringify(timestampData, null, 2));
      console.log('[Zipstamp Server API] ----------------------------------------');
    }

    // Use verifyDigest helper
    const response = await verifyDigest(
      merkleRoot,
      timestampData.chainId,
      timestampData.batchId || undefined,
      undefined, // client - use default
      { serverUrl, debug: options.debug }
    );

    if (!response.success) {
      const errorMsg = response.error || 'Verification failed';
      if (options.debug) {
        console.error('[Zipstamp Server API] Error in response:', errorMsg);
        console.log('[Zipstamp Server API] ========================================\n');
      }
      return {
        status: 'error',
        message: errorMsg,
      };
    }

    if (response.verified) {
      const result = {
        status: 'valid' as const,
        verified: true,
        digest: response.digest,
        tokenId: response.tokenId,
        transactionHash: response.transactionHash,
        contractAddress: response.contractAddress,
        network: response.network,
        blockNumber: response.blockNumber,
        timestamp: response.timestamp,
      };
      
      if (options.debug) {
        console.log('[Zipstamp Server API] Verification Result (VALID):');
        console.log(JSON.stringify(result, null, 2));
        console.log('[Zipstamp Server API] ========================================\n');
      }
      
      return result;
    }

    const pendingResult = {
      status: 'pending' as const,
      verified: false,
      digest: response.digest,
      message: 'Timestamp is pending confirmation',
    };
    
    if (options.debug) {
      console.log('[Zipstamp Server API] Verification Result (PENDING):');
      console.log(JSON.stringify(pendingResult, null, 2));
      console.log('[Zipstamp Server API] ========================================\n');
    }
    
    return pendingResult;
  } catch (error) {
    const errorResult = {
      status: 'error' as const,
      message: error instanceof Error ? error.message : 'Verification error',
    };
    
    if (options.debug) {
      console.error('[Zipstamp Server API] ========================================');
      console.error('[Zipstamp Server API] Error during verification:');
      console.error('[Zipstamp Server API]', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error('[Zipstamp Server API] Stack trace:');
        console.error(error.stack);
      }
      console.error('[Zipstamp Server API] ========================================\n');
    }
    
    return errorResult;
  }
}

/**
 * Verifies a timestamp within a ZIP file.
 * 
 * Extracts the merkle root and timestamp metadata from a ZIP file, then verifies
 * the timestamp against the Zipstamp server API. This is a convenience function that
 * combines `getEthTimestampEntry`, `extractTimestampData`, and `verifyTimestamp`.
 * 
 * @param zip - A ZipkitLike instance representing the timestamped ZIP file
 * @param options - Configuration options for verification
 * @param options.serverUrl - Optional Zipstamp server URL (defaults to `ZIPSTAMP_SERVER_URL` env var or `https://zipstamp-dev.neozip.io`)
 * @param options.debug - Enable debug logging (defaults to `false`)
 * @returns Promise resolving to verification result
 * 
 * @example
 * ```typescript
 * const result = await verifyTimestampedZip(zipkit, { debug: true });
 * 
 * switch (result.status) {
 *   case 'valid':
 *     console.log('✅ Timestamp verified on blockchain');
 *     break;
 *   case 'pending':
 *     console.log('⏳ Timestamp pending confirmation');
 *     break;
 *   case 'none':
 *     console.log('❌ No timestamp found in ZIP file');
 *     break;
 *   case 'error':
 *     console.log('❌ Verification error:', result.message);
 *     break;
 * }
 * ```
 */
export async function verifyTimestampedZip(
  zip: ZipkitLike,
  options: VerifyTimestampOptions = {}
): Promise<EthTimestampVerifyResult> {
  const merkleRoot = getMerkleRootSafe(zip);
  if (!merkleRoot) {
    return { status: 'error', message: 'Merkle root not found in ZIP file' };
  }

  const entry = getEthTimestampEntry(zip);
  if (!entry) {
    return { status: 'none', message: 'No timestamp entry found in ZIP file' };
  }

  const timestampData = await extractTimestampData(zip, entry);
  if (!timestampData) {
    return { status: 'error', message: 'Failed to extract timestamp metadata' };
  }

  // Verify that the digest matches the merkle root
  if (timestampData.digest.toLowerCase() !== merkleRoot.toLowerCase()) {
    return {
      status: 'error',
      message: 'Timestamp digest does not match ZIP merkle root',
    };
  }

  return await verifyTimestamp(merkleRoot, timestampData, options);
}

/**
 * Creates a ZIP entry containing timestamp metadata.
 * 
 * Creates a ZIP entry object that can be added to a ZIP file. The entry contains
 * the timestamp metadata as JSON. The filename is automatically chosen based on
 * the timestamp status:
 * - `TIMESTAMP.NZIP` for confirmed timestamps
 * - `TS-SUBMIT.NZIP` for pending timestamps
 * 
 * @param zipkit - A ZipkitLike instance for creating ZIP entries
 * @param timestampMetadata - The timestamp metadata to embed in the ZIP entry
 * @returns A ZIP entry object ready to be added to a ZIP file, or `null` if creation fails
 * 
 * @example
 * ```typescript
 * // Create timestamp
 * const metadata = await createTimestamp(merkleRoot);
 * 
 * // Create ZIP entry
 * const entry = createTimestampMetadataEntry(zipkit, metadata);
 * if (entry) {
 *   // Add entry to ZIP file using zipkit methods
 *   zipkit.addEntry(entry);
 * }
 * ```
 */
export function createTimestampMetadataEntry(
  zipkit: ZipkitLike,
  timestampMetadata: TimestampMetadata
): any | null {
  if (!zipkit) return null;

  try {
    const jsonString = JSON.stringify(timestampMetadata, null, 2);
    const buffer = Buffer.from(jsonString, 'utf-8');

    // Determine which filename to use based on status
    const filename = timestampMetadata.status === 'confirmed'
      ? TIMESTAMP_NZIP
      : TS_SUBMIT_NZIP;

    const entry = (zipkit as any).createZipEntry?.(filename);
    if (!entry) return null;

    entry.crc = crc32(buffer);
    entry.uncompressedSize = buffer.length;
    entry.compressedSize = buffer.length;
    entry.cmpMethod = CMP_METHOD.STORED;
    entry.fileBuffer = buffer;
    entry.isMetaData = true;

    return entry;
  } catch (error) {
    return null;
  }
}

/**
 * Creates timestamp metadata for a ZIP file.
 * 
 * Extracts the merkle root from a ZIP file and submits it to the Zipstamp server
 * for timestamping. Returns the timestamp metadata that can then be added to
 * the ZIP file using `createTimestampMetadataEntry`.
 * 
 * **Note**: This function does NOT modify the ZIP file. It only creates the
 * timestamp metadata. You must use `createTimestampMetadataEntry` to create
 * a ZIP entry and add it to your ZIP file.
 * 
 * @param zipkit - A ZipkitLike instance representing the ZIP file to timestamp
 * @param options - Configuration options for timestamp creation
 * @param options.recipientEmail - Optional email address for notifications
 * @param options.serverUrl - Optional Zipstamp server URL (defaults to `ZIPSTAMP_SERVER_URL` env var or `https://zipstamp-dev.neozip.io`)
 * @param options.debug - Enable debug logging (defaults to `false`)
 * @returns Promise resolving to timestamp metadata, or `null` if creation fails
 * @throws {Error} If merkle root is not found in ZIP or timestamp creation fails
 * 
 * @example
 * ```typescript
 * // Create timestamp metadata
 * const metadata = await createTimestampedZip(zipkit, {
 *   recipientEmail: 'user@example.com'
 * });
 * 
 * if (metadata) {
 *   // Create ZIP entry from metadata
 *   const entry = createTimestampMetadataEntry(zipkit, metadata);
 *   if (entry) {
 *     // Add entry to ZIP file
 *     zipkit.addEntry(entry);
 *     await zipkit.save('timestamped-file.nzip');
 *   }
 * }
 * ```
 */
export async function createTimestampedZip(
  zipkit: ZipkitLike,
  options: CreateTimestampOptions = {}
): Promise<TimestampMetadata | null> {
  const merkleRoot = getMerkleRootSafe(zipkit);
  if (!merkleRoot) {
    throw new Error('Merkle root not found in ZIP file');
  }

  // Create timestamp
  const timestampMetadata = await createTimestamp(merkleRoot, options);
  if (!timestampMetadata) {
    throw new Error('Failed to create timestamp');
  }

  // Return metadata - caller should use createTimestampMetadataEntry to add to ZIP
  return timestampMetadata;
}


// ============================================================================
// Metadata Utilities
// ============================================================================

/**
 * ZIP entry type (from neozipkit).
 * 
 * Type alias for neozipkit's internal ZipEntry type. Uses `any` to maintain
 * compatibility with neozipkit's concrete ZipEntry shape while allowing these
 * functions to work with entries from different sources.
 */
export type ZipEntry = any;

/**
 * Metadata file type indicator.
 * 
 * Indicates whether a timestamp metadata file represents a pending submission
 * or a confirmed timestamp on the blockchain.
 */
export type MetadataType = 'pending' | 'confirmed' | null;

/**
 * Result of finding a metadata entry in a ZIP file.
 * 
 * Returned by `findMetadataEntry` to provide both the entry and its type
 * for easier handling.
 */
export interface MetadataEntryResult {
  entry: ZipEntry;
  type: MetadataType;
}

/**
 * Finds timestamp metadata entry in an array of ZIP directory entries.
 * 
 * Searches through ZIP directory entries to find timestamp metadata files.
 * Prefers confirmed timestamps (TIMESTAMP.NZIP) over pending submissions (TS-SUBMIT.NZIP).
 * Returns both the entry and its type for easier handling.
 * 
 * @param entries - Array of ZIP directory entries to search
 * @returns Object containing the metadata entry and its type ('pending' | 'confirmed'), or `null` if not found
 * 
 * @example
 * ```typescript
 * const entries = zipkit.getDirectory(true);
 * const result = findMetadataEntry(entries);
 * 
 * if (result) {
 *   console.log('Found', result.type, 'timestamp');
 *   const metadata = await extractTimestampData(zipkit, result.entry);
 * }
 * ```
 */
export function findMetadataEntry(entries: ZipEntry[]): MetadataEntryResult | null {
  // Check for confirmed timestamp first
  const timestampEntry = entries.find((e: any) => e.filename === TIMESTAMP_NZIP);
  if (timestampEntry) {
    return {
      entry: timestampEntry,
      type: 'confirmed'
    };
  }

  // Fall back to submission metadata
  const submitEntry = entries.find((e: any) => e.filename === TS_SUBMIT_NZIP);
  if (submitEntry) {
    return {
      entry: submitEntry,
      type: 'pending'
    };
  }

  return null;
}

/**
 * Determines the metadata type from a ZIP entry's filename.
 * 
 * Examines the filename of a ZIP entry to determine if it's a timestamp metadata
 * file and whether it represents a pending or confirmed timestamp.
 * 
 * @param entry - The ZIP entry to examine (must have a `filename` property)
 * @returns The metadata type: `'pending'` for TS-SUBMIT.NZIP, `'confirmed'` for TIMESTAMP.NZIP, or `null` if not a timestamp metadata file
 * 
 * @example
 * ```typescript
 * const entry = getEthTimestampEntry(zipkit);
 * const type = getMetadataType(entry);
 * 
 * if (type === 'pending') {
 *   console.log('Timestamp is pending confirmation');
 * } else if (type === 'confirmed') {
 *   console.log('Timestamp is confirmed on blockchain');
 * }
 * ```
 */
export function getMetadataType(entry: ZipEntry | null): MetadataType {
  if (!entry) return null;
  
if (entry.filename === TIMESTAMP_NZIP) {
    return 'confirmed';
  }

  if (entry.filename === TS_SUBMIT_NZIP) {
    return 'pending';
  }
  
  return null;
}

/**
 * Determines if a timestamp metadata needs to be upgraded.
 * 
 * Checks whether a timestamp should be upgraded from pending (TS-SUBMIT.NZIP) to
 * confirmed (TIMESTAMP.NZIP) status. An upgrade is needed if:
 * - The metadata file type is 'pending' (TS-SUBMIT.NZIP)
 * - OR the metadata status is 'pending' (for backward compatibility)
 * - OR the metadata lacks a transactionHash (not yet confirmed on blockchain)
 * 
 * @param metadata - The timestamp metadata object to check
 * @param metadataType - The type of metadata file ('pending' | 'confirmed' | null)
 * @returns `true` if the timestamp should be upgraded, `false` otherwise
 * 
 * @example
 * ```typescript
 * const result = findMetadataEntry(entries);
 * if (result && shouldUpgrade(metadata, result.type)) {
 *   console.log('Timestamp needs upgrade - batch may be confirmed now');
 *   // Call upgrade-zip script or pollForConfirmation
 * }
 * ```
 */
export function shouldUpgrade(metadata: TimestampMetadata, metadataType: MetadataType): boolean {
  // If we have confirmed metadata file, no upgrade needed
  if (metadataType === 'confirmed') {
    return false;
  }

  // If we have pending metadata file, upgrade is needed
  if (metadataType === 'pending') {
    return true;
  }

  // Fallback: check metadata content
  // If no transactionHash, it's not confirmed
  if (!metadata.transactionHash) {
    return true;
  }

  // If status is explicitly pending, upgrade needed
  if (metadata.status === 'pending') {
    return true;
  }

  return false;
}

/**
 * Returns all timestamp metadata file names.
 * 
 * Returns an array of all possible timestamp metadata filenames. Useful for
 * error messages, validation, or filtering operations.
 * 
 * @returns Array containing `['META-INF/TIMESTAMP.NZIP', 'META-INF/TS-SUBMIT.NZIP']`
 * 
 * @example
 * ```typescript
 * const metadataFiles = getMetadataFileNames();
 * console.log('Looking for:', metadataFiles.join(', '));
 * 
 * // Filter entries to exclude metadata files
 * const dataEntries = entries.filter(
 *   entry => !metadataFiles.includes(entry.filename)
 * );
 * ```
 */
export function getMetadataFileNames(): string[] {
  return [TIMESTAMP_NZIP, TS_SUBMIT_NZIP];
}

// ============================================================================
// Proof Verification Utilities
// ============================================================================

/**
 * Proof verification utilities for Zipstamp server timestamps.
 * 
 * The Zipstamp server provides merkle proofs as an array of bytes32 hex strings.
 * This module provides local proof verification in the same style as
 * OpenZeppelin's MerkleProof (sorted pair hashing).
 */

function normalizeBytes32(hex: string): string {
  const with0x = hex.startsWith('0x') ? hex : `0x${hex}`;
  const bytes = ethers.getBytes(with0x);
  if (bytes.length !== 32) {
    throw new Error(`Expected bytes32, got ${bytes.length} bytes`);
  }
  return ethers.hexlify(bytes);
}

function hashPair(a: string, b: string): string {
  // OpenZeppelin MerkleProof uses a sorted pair hash
  const aBytes = ethers.getBytes(a);
  const bBytes = ethers.getBytes(b);
  const [left, right] =
    Buffer.compare(Buffer.from(aBytes), Buffer.from(bBytes)) <= 0 ? [aBytes, bBytes] : [bBytes, aBytes];
  return ethers.keccak256(ethers.concat([left, right]));
}

/**
 * Verifies a Merkle proof locally using sorted pair hashing (keccak256).
 * 
 * Performs local verification of a Merkle proof without requiring access to
 * the Zipstamp server or blockchain. Uses the same sorted pair hashing algorithm
 * as OpenZeppelin's MerkleProof library, ensuring compatibility with on-chain
 * verification.
 * 
 * This is useful for:
 * - Verifying timestamps offline
 * - Validating proofs before submitting to blockchain
 * - Confirming proof integrity without API calls
 * 
 * @param digest - The leaf digest (64-character hex string, bytes32) - typically the ZIP file's merkle root
 * @param batchMerkleRoot - The root of the batch Merkle tree (64-character hex string, bytes32) stored on-chain
 * @param merkleProof - Array of sibling hashes (each 64-character hex string, bytes32) forming the proof path from leaf to root
 * @returns `true` if the proof is valid (digest is proven to be in the batch tree), `false` otherwise
 * 
 * @example
 * ```typescript
 * const isValid = verifyMerkleProofLocal(
 *   zipMerkleRoot,           // Your ZIP file's merkle root
 *   batchMerkleRoot,         // From TIMESTAMP.NZIP metadata
 *   merkleProof              // From TIMESTAMP.NZIP metadata
 * );
 * 
 * if (isValid) {
 *   console.log('✅ Proof is valid - ZIP is in the confirmed batch');
 * } else {
 *   console.log('❌ Proof is invalid');
 * }
 * ```
 */
export function verifyMerkleProofLocal(
  digest: string,
  batchMerkleRoot: string,
  merkleProof: string[]
): boolean {
  try {
    let computed = normalizeBytes32(digest);
    for (const p of merkleProof || []) {
      computed = hashPair(computed, normalizeBytes32(p));
    }
    const root = normalizeBytes32(batchMerkleRoot);
    return computed.toLowerCase() === root.toLowerCase();
  } catch {
    return false;
  }
}
