/**
 * ======================================
 * ZipkitOTS.ts - OpenTimestamps Integration
 * ======================================
 * 
 * This module provides comprehensive OpenTimestamps (OTS) functionality,
 * including timestamp creation, verification, certificate generation, and proof upgrades.
 * 
 * Key Features:
 * - Bitcoin blockchain timestamping via OpenTimestamps
 * - Merkle root calculation and verification
 * - OTS proof upgrade capabilities
 * - Certificate generation for verified timestamps
 * 
 * @fileoverview OpenTimestamps utilities for blockchain timestamping
 * @author NeoWare Inc.
 */

// ===== Imports =====
import moment from 'moment-timezone';
import type { ZipkitLike, ZipEntryLike } from '../types';
import { TS_SUBMIT_OTS, TIMESTAMP_OTS } from '../constants/metadata';

// Re-export OTS metadata filenames (single source: src/constants/metadata.ts)
export const TIMESTAMP_SUBMITTED = TS_SUBMIT_OTS;
export const TIMESTAMP_METADATA = TIMESTAMP_OTS;

export const CMP_METHOD = { STORED: 0, DEFLATED: 8 };

// Platform detection
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

// Node.js specific imports
let fs: any = null;
if (isNode) {
  fs = require('fs');
}

// Type declaration for opentimestamps module
// @ts-ignore

// Some environments inject a global bitcore object which interferes with
// OpenTimestamps. Clearing it avoids runtime errors when importing the module.
declare global {
  var _bitcore: any;
}
if ((globalThis as any)._bitcore) delete (globalThis as any)._bitcore;

let OTSInstance: any = null;

/**
 * Lazily loads the OpenTimestamps module to avoid import conflicts.
 * @returns Promise resolving to OpenTimestamps module instance
 */
async function getOpenTimestamps() {
  if (!OTSInstance) {
    // @ts-ignore
    OTSInstance = (await import('opentimestamps')).default;
  }
  return OTSInstance;
}

/**
 * Executes a function with OpenTimestamps logging control.
 * @param debug - If true, keeps logging enabled; if false, suppresses console output
 * @param fn - Function to execute with controlled logging
 * @returns Promise resolving to function result
 */
async function withOtsLogging<T>(debug: boolean | undefined, fn: () => Promise<T>): Promise<T> {
  if (debug) return fn();
  const originalLog = console.log;
  const originalDebug = console.debug;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.log = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.debug = () => {};
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.debug = originalDebug;
  }
}

/**
 * Simple CRC32 implementation for OTS metadata entries
 */
function crc32(data: Buffer): number {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ===== Types & Interfaces =====
export interface TimestampResult {
  merkleRoot: string | null;
  ots: ArrayBuffer | null;
  verified: boolean;
  results: any | null;
  error: string | null;
  attestations: any | null;
  upgradedOts: ArrayBuffer | null;
}

export interface TimestampInfo {
  message: string;
  results: string[];
  attestDate: Date | null;
  attestHeight: number | null;
  submittedUri: string | null;
  otsUpgraded: boolean;
}

export interface DeserializeOtsResult {
  attestStr: string | null;
  needsUpdateMsg: string | null;
  attestationValues: any[];
}

export interface OtsVerifyResult {
  status: 'none' | 'valid' | 'pending' | 'error';
  message?: string;
  blockHeight?: number;
  attestedAt?: Date;
  upgraded?: boolean;
  upgradedOts?: Buffer;
}

/**
 * Verifies an OpenTimestamps proof against a hash digest.
 * @param hashDigest - SHA256 hash as hex string to verify
 * @param ots - OpenTimestamps proof data
 * @param options - Configuration options
 * @param options.debug - Enable debug logging
 * @returns Promise resolving to verification result, error object, or null if inputs invalid
 */
export async function verifyOts(
  hashDigest: string | null,
  ots: ArrayBuffer | null,
  options?: { debug?: boolean },
): Promise<TimestampResult | { error: string } | null> {
  if (!hashDigest || !ots) return null;

  const tsResult: TimestampResult = {
    merkleRoot: hashDigest,
    ots,
    verified: false,
    results: null,
    error: null,
    attestations: null,
    upgradedOts: null,
  };

  try {
    return await withOtsLogging(options?.debug, async () => {
      const OpenTimestamps = await getOpenTimestamps();
      const _otsBuffer = Buffer.from(ots);
      const detachedOts = OpenTimestamps.DetachedTimestampFile.deserialize(_otsBuffer);

      const digest = Buffer.from(hashDigest!, 'hex');
      const hashOts = OpenTimestamps.DetachedTimestampFile.fromHash(
        new OpenTimestamps.Ops.OpSHA256(),
        digest
      );

      const upgrade = await OpenTimestamps.upgrade(detachedOts);
      if (upgrade) {
        tsResult.upgradedOts = detachedOts.serializeToBytes();
      }

      tsResult.results = await OpenTimestamps.verify(detachedOts, hashOts, {
        ignoreBitcoinNode: true,
        timeout: 5000,
      });

      const _attest: any[] = [];
      detachedOts.timestamp.allAttestations().forEach((attestation: any) => {
        if (!(attestation instanceof OpenTimestamps.Notary.UnknownAttestation)) {
          _attest.push(attestation);
        }
      });
      tsResult.attestations = JSON.stringify(_attest);

      tsResult.verified = !!tsResult.results && Object.keys(tsResult.results).length > 0;
      if (!tsResult.verified) tsResult.results = null;

      return tsResult;
    });
  } catch (error: any) {
    let errMsg = error?.message || 'Timestamp Verification Failed!';
    if (errMsg.includes('ESOCKETTIMEDOUT')) errMsg = 'Server timed out, Try again in a few minutes.';
    else if (errMsg.includes('502')) errMsg = 'Server failed to respond, Try again in a few minutes.';
    else if (errMsg.includes('ECONNRESET')) errMsg = 'Server connection reset, Try again in a few minutes.';
    return { error: errMsg };
  }
}

/**
 * Converts a Node.js Buffer to an ArrayBuffer.
 * @param buf - Buffer to convert
 * @returns ArrayBuffer with same data
 */
export function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(buf.byteLength);
  const view = new Uint8Array(ab);
  view.set(buf);
  return ab;
}

/**
 * Finds the OpenTimestamps entry in a ZIP file.
 * Searches for TIMESTAMP_METADATA first, then TIMESTAMP_SUBMITTED.
 * @param zip - Zipkit-like instance to search
 * @returns ZIP entry containing OTS proof, or null if not found
 */
export function getOtsEntry(zip: ZipkitLike): ZipEntryLike | null {
  try {
    // Include metadata entries in the directory
    const entries = zip.getDirectory?.(true) || [];

    // Prefer upgraded metadata entry first
    let entry = entries.find((e: ZipEntryLike) => e && e.filename === TIMESTAMP_METADATA);
    if (entry) return entry;

    // Fallback to submitted proof entry
    entry = entries.find((e: ZipEntryLike) => e && e.filename === TIMESTAMP_SUBMITTED);
    if (entry) return entry;
  } catch {
    return null;
  }
  return null;
}

/**
 * Extracts OTS proof data from a ZIP entry.
 * Prefers extractToBuffer when available (required for file-based ZIPs loaded with loadZipFile).
 * @param zip - Zipkit-like instance
 * @param otsEntry - ZIP entry containing OTS data
 * @returns Promise resolving to OTS proof buffer, or null if extraction fails
 */
export async function getOtsBuffer(zip: ZipkitLike, otsEntry: ZipEntryLike): Promise<Buffer | null> {
  try {
    if (zip.extractToBuffer) {
      const data = await zip.extractToBuffer(otsEntry, { skipHashCheck: true });
      return Buffer.isBuffer(data) ? data : Buffer.from(data);
    }
    const data = await zip.extract?.(otsEntry, true);
    return Buffer.isBuffer(data) ? (data as Buffer) : null;
  } catch {
    return null;
  }
}

/**
 * Safely extracts merkle root from a ZIP file.
 * @param zip - Zipkit-like instance
 * @returns Merkle root hash string, or null if not available
 */
export function getMerkleRootSafe(zip: ZipkitLike): string | null {
  try {
    const mr = zip.getMerkleRoot?.();
    return (typeof mr === 'string' && mr.length > 0) ? mr : null;
  } catch {
    return null;
  }
}

/**
 * Converts various date formats to a Date object.
 * @param val - Date value (number timestamp, string, or Date)
 * @returns Date object or undefined if invalid
 */
function coerceDate(val: any): Date | undefined {
  if (!val) return undefined;
  if (typeof val === 'number') return new Date(val * (val > 10_000_000_000 ? 1 : 1000));
  if (typeof val === 'string') return new Date(val);
  return undefined;
}

/**
 * Verifies OpenTimestamps proof within a ZIP file.
 * Extracts merkle root and OTS proof, then verifies against Bitcoin blockchain.
 * @param zip - Zipkit-like instance containing files and OTS proof
 * @returns Promise resolving to verification result with status: 'none', 'error', 'pending', or 'valid'
 */
export async function verifyOtsZip(zip: ZipkitLike): Promise<OtsVerifyResult> {
  const mr = getMerkleRootSafe(zip);
  const entry = getOtsEntry(zip);
  if (!entry) return { status: 'none' };
  const otsBuf = await getOtsBuffer(zip, entry);
  if (!otsBuf) {
    return { status: 'error', message: 'Could not read OTS proof from archive (META-INF/TS-SUBMIT.OTS or META-INF/TIMESTAMP.OTS).' };
  }
  if (!mr) {
    return {
      status: 'error',
      message: 'Could not compute merkle root. Archive may not have been created with useSHA256: true, or content entries lack SHA-256 in the ZIP.',
    };
  }
  try {
    const result: any = await (verifyOts as any)(mr, bufferToArrayBuffer(otsBuf));
    if (result?.error) {
      return { status: 'pending', message: result.error };
    }
    if (result?.verified === true) {
      const bitcoin = result?.results?.bitcoin || {};
      const blockHeight: number | undefined = result.blockHeight ?? result.block ?? result.height ?? bitcoin.height;
      const attestedAt: Date | undefined = coerceDate(result.attestedAt ?? result.attested ?? result.time ?? bitcoin.timestamp);
      const upgraded: boolean | undefined = Boolean(result.upgraded || result.upgradedOts);
      const upgradedOts: Buffer | undefined = result.upgradedOts ? Buffer.from(result.upgradedOts) : undefined;
      return { status: 'valid', blockHeight, attestedAt, upgraded, upgradedOts };
    }
    return { status: 'pending', message: 'Timestamp not yet attested on Bitcoin. Try again later.' };
  } catch (e: any) {
    return { status: 'pending', message: e?.message };
  }
}

/**
 * Creates an OpenTimestamps proof for a hash digest.
 * Submits hash to OpenTimestamps servers for Bitcoin blockchain anchoring.
 * @param hashDigest - SHA256 hash as hex string to timestamp
 * @param options - Configuration options
 * @param options.debug - Enable debug logging
 * @returns Promise resolving to OTS proof buffer, or null if creation failed
 */
export async function createTimestamp(hashDigest: string | null, options?: { debug?: boolean }): Promise<Buffer | null> {
  if (!hashDigest) return null;
  try {
    return await withOtsLogging(options?.debug, async () => {
      const OpenTimestamps = await getOpenTimestamps();
      const hashBuffer = Buffer.from(hashDigest, 'hex');
      const detached = OpenTimestamps.DetachedTimestampFile.fromHash(
        new OpenTimestamps.Ops.OpSHA256(),
        hashBuffer
      );
      await OpenTimestamps.stamp(detached);
      return Buffer.from(detached.serializeToBytes());
    });
  } catch (error) {
    console.error('Error creating timestamp:', error);
    throw new Error('Error creating timestamp');
  }
}

/**
 * Deserializes OpenTimestamps verification result into JSON format.
 * Extracts blockchain attestation data and transaction details.
 * @param tsResult - Timestamp verification result to deserialize
 * @param options - Configuration options
 * @param options.debug - Enable debug logging
 * @returns Promise resolving to JSON string with attestation data, or null if failed
 */
export async function deserializeOts(
  tsResult: TimestampResult,
  options?: { debug?: boolean },
): Promise<string | null> {
  let result: DeserializeOtsResult = {
    attestStr: null,
    needsUpdateMsg: null,
    attestationValues: [],
  };

  for (const chain in tsResult.results) {
    const _results = tsResult.results[chain];
    const _attestDate = moment(_results.timestamp * 1000).tz(moment.tz.guess()).format('MM-DD-YYYY hh:mma z');
    const blockchain = chain.charAt(0).toUpperCase() + chain.slice(1);
    result.attestStr = `<b>${blockchain} block ${_results.height}</b> attests existence as of <b>${_attestDate}</b>`;
  }

  let timestamp = tsResult.ots;
  if (tsResult.upgradedOts != null) {
    result.needsUpdateMsg = 'This Zip file requires updated Timestamp Metadata!';
    timestamp = tsResult.upgradedOts;
  }

  if (!timestamp) return null;
  const infoResult = await withOtsLogging(options?.debug, async () => {
    const OpenTimestamps = await getOpenTimestamps();
    const detached = OpenTimestamps.DetachedTimestampFile.deserialize(Buffer.from(timestamp!));
    return OpenTimestamps.info(detached);
  });

  const transactionIdMatches = [...infoResult.matchAll(/transaction id ([a-f0-9]+)/gi)];
  const transactionIds = transactionIdMatches.map((m: RegExpMatchArray) => m[1]);

  const blockHeightMatches = [...infoResult.matchAll(/verify BitcoinBlockHeaderAttestation\((\d+)\)/g)];
  const blockHeights = blockHeightMatches.map((m: RegExpMatchArray) => m[1]);

  const merkleRootMatches = [...infoResult.matchAll(/block merkle root ([a-f0-9]+)/gi)];
  const merkleRoots = merkleRootMatches.map((m: RegExpMatchArray) => m[1]);

  result.attestationValues = [];
  if (transactionIds.length === blockHeights.length && transactionIds.length === merkleRoots.length) {
    for (let i = 0; i < transactionIds.length; i++) {
      result.attestationValues.push({
        blockHeight: blockHeights[i],
        transactionId: transactionIds[i],
        merkleRoot: merkleRoots[i],
      });
    }
    result.attestationValues.sort((a: any, b: any) => a.blockHeight - b.blockHeight);
  }

  return JSON.stringify(result);
}

/**
 * Parses timestamp verification result into readable information.
 * Formats blockchain attestation data with human-readable messages and dates.
 * @param verifyResult - Timestamp verification result to parse
 * @returns Promise resolving to formatted timestamp information
 */
export async function parseVerifyResult(verifyResult: TimestampResult): Promise<TimestampInfo> {
  let tsInfo: TimestampInfo = {
    message: '',
    results: [],
    attestDate: null,
    attestHeight: null,
    submittedUri: null,
    otsUpgraded: false,
  };

  for (const chain in verifyResult?.results) {
    const _results = verifyResult.results[chain];
    const _date = moment(_results.timestamp * 1000).tz('UTC').format('MM-DD-YYYY hh:mma z');
    const _blockchain = chain.charAt(0).toUpperCase() + chain.slice(1);
    tsInfo.message = `Validated - ${_blockchain} block ${_results.height} attests existence as of ${_date}`;
    if (tsInfo.attestHeight == null) {
      tsInfo.attestDate = new Date(_results.timestamp * 1000);
      tsInfo.attestHeight = _results.height;
    }
    tsInfo.results.push(tsInfo.message);
  }

  if (verifyResult?.upgradedOts) {
    tsInfo.otsUpgraded = true;
    tsInfo.results.push('Notice: Please select "Upgrade Timestamp" to save the upgraded timestamp.');
  }
  return tsInfo;
}

/**
 * Upgrades OpenTimestamps proof in an existing ZIP file.
 * Note: This function requires neozipkit for ZIP operations.
 * @param zipFilePath - Path to ZIP file to upgrade
 * @param upgradedOts - Buffer containing upgraded OTS proof
 * @param zipkitInstance - Optional Zipkit instance for ZIP operations
 * @returns Promise that resolves when upgrade is complete
 * @throws Error if upgrade fails
 */
export async function upgradeOTS(
  zipFilePath: string, 
  upgradedOts: Buffer,
  zipkitInstance?: any
): Promise<void> {
  if (!fs) {
    throw new Error('upgradeOTS() is only available in Node.js environment');
  }
  
  if (!fs.existsSync(zipFilePath)) {
    throw new Error(`Zip file not found: ${zipFilePath}`);
  }

  if (!upgradedOts || upgradedOts.length === 0) {
    throw new Error('Invalid upgraded OTS data provided');
  }

  // This function requires neozipkit for ZIP manipulation
  // If no zipkit instance provided, throw an error
  if (!zipkitInstance) {
    throw new Error('upgradeOTS requires a Zipkit instance from neozipkit package for ZIP file manipulation');
  }

  // Create a temporary file for the upgrade process
  const tempPath = `${zipFilePath}.upgrading.${Date.now()}.${process.pid}`;
  
  try {
    // Load the existing zip file
    const zipData = fs.readFileSync(zipFilePath);
    zipkitInstance.loadZip(zipData);
    const zipEntries = zipkitInstance.getDirectory(false) || [];

    if (!zipEntries || zipEntries.length === 0) {
      throw new Error('No entries found in zip file or file is corrupted');
    }

    // Prepare buffers for the new zip file
    const buffers: Buffer[] = [];
    let offset = 0;
    const keptEntries: any[] = [];

    // Process existing entries, excluding old timestamp entries
    for (const entry of zipEntries) {
      if (entry.filename === TIMESTAMP_METADATA || 
          entry.filename === TIMESTAMP_SUBMITTED) {
        // Skip old timestamp entries - they will be replaced
        continue;
      }

      // Copy the entry data
      const entryData = await zipkitInstance.copyEntry(entry);
      if (!entryData) {
        throw new Error(`Failed to copy entry data for: ${entry.filename}`);
      }

      // Update the entry's local header offset
      entry.localHdrOffset = offset;
      offset += entryData.length;
      
      buffers.push(entryData);
      keptEntries.push(entry);
    }

    // Create the new upgraded timestamp entry with standard filename
    const tsEntry = zipkitInstance.createZipEntry(TIMESTAMP_METADATA);
    if (!tsEntry) {
      throw new Error('Failed to create timestamp metadata entry');
    }

    // Configure the timestamp entry
    tsEntry.timeDateDOS = tsEntry.setDateTime(new Date());
    tsEntry.compressedSize = upgradedOts.length;
    tsEntry.uncompressedSize = upgradedOts.length;
    tsEntry.cmpMethod = CMP_METHOD.STORED; // Store without compression
    tsEntry.crc = crc32(upgradedOts);
    (tsEntry as any).fileData = upgradedOts; // Cast to any to avoid type issues

    // Create and add the local header for the timestamp entry
    const localHdr = tsEntry.createLocalHdr();
    if (!localHdr) {
      throw new Error('Failed to create local header for timestamp entry');
    }

    tsEntry.localHdrOffset = offset;
    offset += localHdr.length + tsEntry.compressedSize;
    
    buffers.push(localHdr);
    buffers.push(upgradedOts);

    // Add the timestamp entry to our list of entries
    keptEntries.push(tsEntry);

    // Create central directory
    const centralDirOffset = offset;
    let centralDirSize = 0;

    for (const entry of keptEntries) {
      const centralDirEntry = entry.centralDirEntry();
      if (!centralDirEntry) {
        throw new Error(`Failed to create central directory entry for: ${entry.filename}`);
      }
      
      centralDirSize += centralDirEntry.length;
      buffers.push(centralDirEntry);
    }

    // Create end of central directory record
    const endOfCentralDir = Buffer.alloc(22);
    endOfCentralDir.writeUInt32LE(0x06054b50, 0); // End of central dir signature
    endOfCentralDir.writeUInt16LE(0, 4); // Number of this disk
    endOfCentralDir.writeUInt16LE(0, 6); // Disk where central directory starts
    endOfCentralDir.writeUInt16LE(keptEntries.length, 8); // Number of central directory records on this disk
    endOfCentralDir.writeUInt16LE(keptEntries.length, 10); // Total number of central directory records
    endOfCentralDir.writeUInt32LE(centralDirSize, 12); // Size of central directory
    endOfCentralDir.writeUInt32LE(centralDirOffset, 16); // Offset of start of central directory
    endOfCentralDir.writeUInt16LE(0, 20); // ZIP file comment length

    buffers.push(endOfCentralDir);

    // Write the complete new zip file to temporary location
    const finalBuffer = Buffer.concat(buffers);
    fs.writeFileSync(tempPath, finalBuffer);

    // Validate the temporary file was created successfully
    if (!fs.existsSync(tempPath)) {
      throw new Error('Failed to create temporary upgraded file');
    }

    const tempStats = fs.statSync(tempPath);
    if (tempStats.size === 0) {
      throw new Error('Temporary upgraded file is empty');
    }

    // Replace the original file with the upgraded version
    fs.unlinkSync(zipFilePath);
    fs.renameSync(tempPath, zipFilePath);

  } catch (error) {
    // Clean up temporary file if it exists
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        // Log cleanup error but don't throw - main error is more important
        console.warn(`Warning: Could not clean up temporary file ${tempPath}: ${cleanupError}`);
      }
    }
    
    // Re-throw the original error
    throw error;
  }
}

/**
 * Creates a ZIP metadata entry containing OpenTimestamps proof.
 * Note: This function requires a Zipkit instance for ZIP operations.
 * @param zipKit - Zipkit-like instance to add metadata entry to
 * @param ots - Buffer containing OpenTimestamps proof data
 * @returns ZIP entry containing OTS metadata, or null if creation failed
 */
export function createOtsMetadataEntry(zipKit: any, ots: Buffer | null): any | null {
  if (!ots || !zipKit) return null;
  
  const tsEntry = zipKit.createZipEntry(TIMESTAMP_SUBMITTED);
  tsEntry.crc = crc32(ots);
  tsEntry.uncompressedSize = ots.length;
  tsEntry.compressedSize = ots.length;
  tsEntry.cmpMethod = CMP_METHOD.STORED;
  tsEntry.fileBuffer = ots;
  tsEntry.isMetaData = true;

  return tsEntry;
}

