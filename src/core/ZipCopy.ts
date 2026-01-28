// ======================================
//	ZipCopy.ts - Efficient ZIP Entry Copying (Buffer-based)
//  Copyright (c) 2025 NeoWare, Inc. All rights reserved.
// ======================================
//
// Efficient ZIP entry copying using ZipEntry instances directly.
// Leverages existing offsets and sizes to copy raw bytes without
// unnecessary parsing and reconstruction.
// Buffer-based implementation for in-memory ZIP operations.

import ZipEntry from './ZipEntry';
import Zipkit from './Zipkit';
import { LOCAL_HDR, CENTRAL_END, GP_FLAG } from './constants/Headers';

/**
 * Options for copying ZIP files
 */
export interface CopyOptions {
  /** Filter function to determine which entries to copy */
  entryFilter?: (entry: ZipEntry) => boolean;
  /** Sort function to reorder entries before copying */
  entrySorter?: (a: ZipEntry, b: ZipEntry) => number;
  /** Whether to preserve the ZIP file comment (default: true) */
  preserveComments?: boolean;
}

/**
 * Result of copying a ZIP file
 */
export interface CopyResult {
  /** Information about copied entries */
  entries: Array<{
    filename: string;
    localHeaderOffset: number;
    compressedSize: number;
  }>;
  /** Offset to the start of the central directory */
  centralDirOffset: number;
  /** Total number of entries copied */
  totalEntries: number;
  /** Buffer containing the complete copied ZIP file */
  zipBuffer: Buffer;
}

/**
 * Efficient ZIP file copying class (Buffer-based)
 * 
 * Uses ZipEntry instances directly to copy entries without decompression/recompression.
 * Supports filtering and reordering entries while maintaining ZIP file validity.
 * Works entirely with buffers for in-memory operations.
 * 
 * @example
 * ```typescript
 * const zipkit = new Zipkit();
 * const zipCopy = new ZipCopy(zipkit);
 * 
 * const result = await zipCopy.copyZipBuffer(
 *   sourceZipBuffer,
 *   {
 *     entryFilter: (entry) => !entry.filename.startsWith('.'),
 *     entrySorter: (a, b) => a.filename.localeCompare(b.filename)
 *   }
 * );
 * 
 * // result.zipBuffer contains the complete copied ZIP file
 * ```
 */
export class ZipCopy {
  private zipkit: Zipkit;

  /**
   * Creates a new ZipCopy instance
   * @param zipkit - Zipkit instance to use for ZIP operations
   */
  constructor(zipkit: Zipkit) {
    this.zipkit = zipkit;
  }

  /**
   * Calculate local header size by reading from buffer
   * 
   * Reads the first 30 bytes of the local header to get the exact
   * filename and extra field lengths, ensuring accuracy even when
   * local header differs from central directory.
   * 
   * @param sourceBuffer - Buffer containing the source ZIP file
   * @param entry - ZipEntry with localHdrOffset
   * @returns Size of the local header in bytes
   */
  private calculateLocalHeaderSize(sourceBuffer: Buffer, entry: ZipEntry): number {
    // Verify offset is within buffer bounds
    if (entry.localHdrOffset + LOCAL_HDR.SIZE > sourceBuffer.length) {
      throw new Error(
        `Local header offset ${entry.localHdrOffset} is beyond buffer size ${sourceBuffer.length} for entry ${entry.filename}`
      );
    }

    // Read the fixed 30-byte local header
    const headerBuffer = sourceBuffer.subarray(entry.localHdrOffset, entry.localHdrOffset + LOCAL_HDR.SIZE);

    // Verify signature
    if (headerBuffer.readUInt32LE(0) !== LOCAL_HDR.SIGNATURE) {
      throw new Error(
        `Invalid local file header signature for entry ${entry.filename} at offset ${entry.localHdrOffset}`
      );
    }

    // Read filename and extra field lengths from the actual header
    const filenameLength = headerBuffer.readUInt16LE(LOCAL_HDR.FNAME_LEN);
    const extraFieldLength = headerBuffer.readUInt16LE(LOCAL_HDR.EXTRA_LEN);

    // Calculate total local header size
    return LOCAL_HDR.SIZE + filenameLength + extraFieldLength;
  }

  /**
   * Copy entry bytes directly from source buffer
   * 
   * Copies the local header and compressed data as a single operation.
   * 
   * Handles various entry types:
   * - Normal entries: [local header][filename][extra][compressed data]
   * - Encrypted entries: compressedSize includes 12-byte encryption header
   * - Data descriptor entries: [local header][filename][extra][data][data descriptor (16 bytes)]
   * 
   * For data descriptor entries, the local header has compressed size = 0,
   * but the actual size is in the central directory (entry.compressedSize).
   * 
   * @param sourceBuffer - Buffer containing the source ZIP file
   * @param entry - ZipEntry with source offset information
   * @returns Buffer containing the copied entry (local header + compressed data + data descriptor if present)
   */
  private copyEntryBytes(
    sourceBuffer: Buffer,
    entry: ZipEntry
  ): Buffer {
    // Calculate local header size by reading from buffer
    const localHeaderSize = this.calculateLocalHeaderSize(sourceBuffer, entry);
    
    // Determine total entry size
    // For data descriptor entries, add 16 bytes for the data descriptor
    const hasDataDescriptor = (entry.bitFlags & GP_FLAG.DATA_DESC) !== 0;
    const totalEntrySize = localHeaderSize + entry.compressedSize + (hasDataDescriptor ? 16 : 0);

    // Verify we have enough data in the buffer
    if (entry.localHdrOffset + totalEntrySize > sourceBuffer.length) {
      throw new Error(
        `Entry ${entry.filename} extends beyond buffer size: ` +
        `offset ${entry.localHdrOffset} + size ${totalEntrySize} > buffer length ${sourceBuffer.length}`
      );
    }

    // Extract the entire entry (local header + compressed data + data descriptor if present) from source
    const entryBuffer = sourceBuffer.subarray(entry.localHdrOffset, entry.localHdrOffset + totalEntrySize);

    // Verify data descriptor signature if present
    if (hasDataDescriptor) {
      const dataDescOffset = localHeaderSize + entry.compressedSize;
      const dataDescSig = entryBuffer.readUInt32LE(dataDescOffset);
      if (dataDescSig !== 0x08074b50) { // DATA_DESCRIPTOR signature
        throw new Error(
          `Invalid data descriptor signature for entry ${entry.filename} ` +
          `(expected 0x08074b50, got 0x${dataDescSig.toString(16)})`
        );
      }
    }

    // Return a copy of the buffer slice (so modifications don't affect source)
    return Buffer.from(entryBuffer);
  }

  /**
   * Clone a ZipEntry with a new local header offset
   * 
   * Creates a new ZipEntry instance with all properties copied from the source,
   * but with an updated localHdrOffset for the destination buffer.
   * 
   * @param entry - Source ZipEntry to clone
   * @param newLocalHdrOffset - New local header offset for the destination
   * @returns New ZipEntry instance with updated offset
   */
  private cloneEntryWithOffset(
    entry: ZipEntry,
    newLocalHdrOffset: number
  ): ZipEntry {
    // Create a new ZipEntry with the same filename and comment
    const cloned = new ZipEntry(entry.filename, entry.comment || null, entry.debug);

    // Copy all properties
    cloned.verMadeBy = entry.verMadeBy;
    cloned.verExtract = entry.verExtract;
    cloned.bitFlags = entry.bitFlags;
    cloned.cmpMethod = entry.cmpMethod;
    cloned.timeDateDOS = entry.timeDateDOS;
    cloned.crc = entry.crc;
    cloned.compressedSize = entry.compressedSize;
    cloned.uncompressedSize = entry.uncompressedSize;
    cloned.volNumber = entry.volNumber;
    cloned.intFileAttr = entry.intFileAttr;
    cloned.extFileAttr = entry.extFileAttr;
    cloned.localHdrOffset = newLocalHdrOffset; // Update offset

    // Copy extra field if present
    if (entry.extraField) {
      cloned.extraField = Buffer.from(entry.extraField);
    }

    // Copy metadata
    cloned.isEncrypted = entry.isEncrypted;
    cloned.isStrongEncrypt = entry.isStrongEncrypt;
    cloned.isDirectory = entry.isDirectory;
    cloned.isMetaData = entry.isMetaData;
    cloned.isUpdated = entry.isUpdated;

    // Copy platform-specific data
    cloned.platform = entry.platform;
    cloned.universalTime = entry.universalTime;
    cloned.uid = entry.uid;
    cloned.gid = entry.gid;
    cloned.sha256 = entry.sha256;

    // Copy symlink data
    cloned.isSymlink = entry.isSymlink;
    cloned.linkTarget = entry.linkTarget;

    // Copy hardlink data
    cloned.isHardLink = entry.isHardLink;
    cloned.originalEntry = entry.originalEntry;
    cloned.inode = entry.inode;

    return cloned;
  }

  /**
   * Copy ZIP file entries efficiently from buffer to buffer
   * 
   * Main method that copies entries from source ZIP buffer to destination ZIP buffer.
   * Uses ZipEntry instances directly to avoid unnecessary parsing.
   * 
   * @param sourceZipBuffer - Buffer containing the source ZIP file
   * @param options - Optional copy options (filtering, sorting, etc.)
   * @returns Copy result with entry information and the complete ZIP buffer
   */
  async copyZipBuffer(
    sourceZipBuffer: Buffer,
    options?: CopyOptions
  ): Promise<CopyResult> {
    // Load source ZIP entries from buffer
    const sourceEntries = this.zipkit.loadZip(sourceZipBuffer);
    const zipComment = this.zipkit.getZipComment();

    // Apply filter if provided
    let entriesToCopy = options?.entryFilter
      ? sourceEntries.filter(options.entryFilter)
      : sourceEntries;

    // Apply sort if provided
    if (options?.entrySorter) {
      entriesToCopy = [...entriesToCopy].sort(options.entrySorter);
    }

    if (entriesToCopy.length === 0) {
      throw new Error('No entries to copy after filtering');
    }

    // Build the output ZIP buffer
    const outputChunks: Buffer[] = [];
    let destOffset = 0;
    const copiedEntries: ZipEntry[] = [];

    // Copy each entry
    for (const sourceEntry of entriesToCopy) {
      const newLocalHdrOffset = destOffset;

      // Copy entry bytes (local header + compressed data)
      const entryBuffer = this.copyEntryBytes(sourceZipBuffer, sourceEntry);
      outputChunks.push(entryBuffer);
      destOffset += entryBuffer.length;

      // Create cloned entry with new offset
      const clonedEntry = this.cloneEntryWithOffset(sourceEntry, newLocalHdrOffset);
      copiedEntries.push(clonedEntry);
    }

    // Write central directory
    const centralDirStartOffset = destOffset;
    const centralDirChunks: Buffer[] = [];
    for (const entry of copiedEntries) {
      // Generate central directory entry
      const centralDirBuffer = entry.centralDirEntry();
      centralDirChunks.push(centralDirBuffer);
      destOffset += centralDirBuffer.length;
    }

    const centralDirSize = destOffset - centralDirStartOffset;

    // Write End of Central Directory record
    const comment = (options?.preserveComments !== false && zipComment) ? zipComment : '';
    const commentBytes = Buffer.from(comment, 'utf8');
    const commentLength = Math.min(commentBytes.length, 0xFFFF); // Max 65535 bytes

    const eocdBuffer = Buffer.alloc(22 + commentLength);
    let pos = 0;

    // End of central directory signature
    eocdBuffer.writeUInt32LE(CENTRAL_END.SIGNATURE, pos);
    pos += 4;

    // Number of this disk
    eocdBuffer.writeUInt16LE(0, pos);
    pos += 2;

    // Number of the disk with the start of the central directory
    eocdBuffer.writeUInt16LE(0, pos);
    pos += 2;

    // Total number of entries in the central directory on this disk
    eocdBuffer.writeUInt16LE(copiedEntries.length, pos);
    pos += 2;

    // Total number of entries in the central directory
    eocdBuffer.writeUInt16LE(copiedEntries.length, pos);
    pos += 2;

    // Size of the central directory
    eocdBuffer.writeUInt32LE(centralDirSize, pos);
    pos += 4;

    // Offset of start of central directory
    eocdBuffer.writeUInt32LE(centralDirStartOffset, pos);
    pos += 4;

    // ZIP file comment length
    eocdBuffer.writeUInt16LE(commentLength, pos);
    pos += 2;

    // ZIP file comment
    if (commentLength > 0) {
      commentBytes.copy(eocdBuffer, pos, 0, commentLength);
    }

    // Combine all chunks into final buffer
    outputChunks.push(...centralDirChunks);
    outputChunks.push(eocdBuffer);

    const zipBuffer = Buffer.concat(outputChunks);

    // Return result
    return {
      entries: copiedEntries.map(entry => ({
        filename: entry.filename,
        localHeaderOffset: entry.localHdrOffset,
        compressedSize: entry.compressedSize,
      })),
      centralDirOffset: centralDirStartOffset,
      totalEntries: copiedEntries.length,
      zipBuffer,
    };
  }
}
