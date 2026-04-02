// ======================================
//	ZipCopyNode.ts - Efficient ZIP Entry Copying
//  Copyright (c) 2025 NeoWare, Inc. All rights reserved.
// ======================================
//
// Efficient ZIP entry copying using ZipEntry instances directly.
// Leverages existing offsets and sizes to copy raw bytes without
// unnecessary parsing and reconstruction.

import * as fs from 'fs';
import ZipEntry from '../core/ZipEntry';
import ZipkitNode from './ZipkitNode';
import { LOCAL_HDR, CENTRAL_END, GP_FLAG } from '../core/constants/Headers';

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
}

/**
 * Result of copying only ZIP entry data (no central directory or EOCD).
 * Use with writeCentralDirectoryAndEOCD after optionally adding more entries
 * to allow building a ZIP that includes both copied and new entries.
 */
export interface CopyEntriesOnlyResult {
  /** Path to the destination file (entry data only; not yet a valid ZIP) */
  destPath: string;
  /** Offset at which entry data ends; central directory should start here after any new entries are appended */
  dataEndOffset: number;
  /** Copied entries with localHdrOffset set for the destination file */
  copiedEntries: ZipEntry[];
}

/**
 * Options for finalizing a ZIP file (writing central directory and EOCD)
 */
export interface FinalizeZipOptions {
  /** ZIP file comment (default: empty) */
  zipComment?: string;
}

/**
 * Efficient ZIP file copying class
 *
 * Uses ZipEntry instances directly to copy entries without decompression/recompression.
 * Supports filtering and reordering entries while maintaining ZIP file validity.
 *
 * Entry data and the central directory / EOCD are separated so you can add files
 * to the copy before finalizing: use copyZipEntriesOnly, append new entries at
 * dataEndOffset, then call writeCentralDirectoryAndEOCD with all entries.
 *
 * @example Full copy (one shot)
 * ```typescript
 * const zipCopy = new ZipCopyNode(new ZipkitNode());
 * const result = await zipCopy.copyZipFile('source.zip', 'dest.zip', {
 *   entryFilter: (entry) => !entry.filename.startsWith('.'),
 *   entrySorter: (a, b) => a.filename.localeCompare(b.filename)
 * });
 * ```
 *
 * @example Copy then add files before finalizing
 * ```typescript
 * const zipCopy = new ZipCopyNode(new ZipkitNode());
 * const { destPath, dataEndOffset, copiedEntries } = await zipCopy.copyZipEntriesOnly('source.zip', 'dest.zip');
 * // ... append new entries to destPath at dataEndOffset, collect new ZipEntry[] with localHdrOffset set ...
 * const allEntries = [...copiedEntries, ...newEntries];
 * zipCopy.writeCentralDirectoryAndEOCD(destPath, allEntries, { zipComment: '' });
 * ```
 */
export class ZipCopyNode {
  private zipkitNode: ZipkitNode;

  /**
   * Creates a new ZipCopyNode instance
   * @param zipkitNode - Optional ZipkitNode instance. If not provided, creates a new one.
   */
  constructor(zipkitNode?: ZipkitNode) {
    this.zipkitNode = zipkitNode || new ZipkitNode();
  }

  /**
   * Calculate local header size by reading the actual local header
   * 
   * Reads the first 30 bytes of the local header to get the exact
   * filename and extra field lengths, ensuring accuracy even when
   * local header differs from central directory.
   * 
   * @param sourceFd - File descriptor for source ZIP file
   * @param entry - ZipEntry with localHdrOffset
   * @returns Size of the local header in bytes
   */
  private calculateLocalHeaderSize(sourceFd: number, entry: ZipEntry): number {
    // Read the fixed 30-byte local header
    const headerBuffer = Buffer.alloc(LOCAL_HDR.SIZE);
    fs.readSync(sourceFd, headerBuffer, 0, LOCAL_HDR.SIZE, entry.localHdrOffset);

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
   * Copy entry bytes directly from source to destination
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
   * @param sourceFd - File descriptor for source ZIP file
   * @param destFd - File descriptor for destination ZIP file
   * @param entry - ZipEntry with source offset information
   * @returns Number of bytes written
   */
  private copyEntryBytes(
    sourceFd: number,
    destFd: number,
    entry: ZipEntry
  ): number {
    // Calculate local header size by reading the actual header
    const localHeaderSize = this.calculateLocalHeaderSize(sourceFd, entry);
    
    // Determine total entry size
    // For data descriptor entries, add 16 bytes for the data descriptor
    const hasDataDescriptor = (entry.bitFlags & GP_FLAG.DATA_DESC) !== 0;
    const totalEntrySize = localHeaderSize + entry.compressedSize + (hasDataDescriptor ? 16 : 0);

    // Read the entire entry (local header + compressed data + data descriptor if present) from source
    const entryBuffer = Buffer.alloc(totalEntrySize);
    const bytesRead = fs.readSync(sourceFd, entryBuffer, 0, totalEntrySize, entry.localHdrOffset);
    
    if (bytesRead !== totalEntrySize) {
      throw new Error(
        `Failed to read complete entry for ${entry.filename}: ` +
        `expected ${totalEntrySize} bytes, got ${bytesRead}`
      );
    }

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

    // Write to destination
    const bytesWritten = fs.writeSync(destFd, entryBuffer, 0, totalEntrySize);
    
    if (bytesWritten !== totalEntrySize) {
      throw new Error(
        `Failed to write complete entry for ${entry.filename}: ` +
        `expected ${totalEntrySize} bytes, wrote ${bytesWritten}`
      );
    }

    return bytesWritten;
  }

  /**
   * Clone a ZipEntry with a new local header offset
   * 
   * Creates a new ZipEntry instance with all properties copied from the source,
   * but with an updated localHdrOffset for the destination file.
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
   * Write central directory and End of Central Directory record to an open file descriptor.
   * Used internally by copyZipFile and by writeCentralDirectoryAndEOCD.
   */
  private writeCentralDirectoryAndEOCDToFd(
    destFd: number,
    entries: ZipEntry[],
    zipComment: string
  ): { centralDirOffset: number; centralDirSize: number } {
    const centralDirStartOffset = fs.fstatSync(destFd).size;

    for (const entry of entries) {
      const centralDirBuffer = entry.centralDirEntry();
      fs.writeSync(destFd, centralDirBuffer, 0, centralDirBuffer.length);
    }

    const centralDirEndOffset = fs.fstatSync(destFd).size;
    const centralDirSize = centralDirEndOffset - centralDirStartOffset;

    const commentBytes = Buffer.from(zipComment, 'utf8');
    const commentLength = Math.min(commentBytes.length, 0xFFFF);

    const eocdBuffer = Buffer.alloc(22 + commentLength);
    let pos = 0;

    eocdBuffer.writeUInt32LE(CENTRAL_END.SIGNATURE, pos);
    pos += 4;
    eocdBuffer.writeUInt16LE(0, pos);
    pos += 2;
    eocdBuffer.writeUInt16LE(0, pos);
    pos += 2;
    eocdBuffer.writeUInt16LE(entries.length, pos);
    pos += 2;
    eocdBuffer.writeUInt16LE(entries.length, pos);
    pos += 2;
    eocdBuffer.writeUInt32LE(centralDirSize, pos);
    pos += 4;
    eocdBuffer.writeUInt32LE(centralDirStartOffset, pos);
    pos += 4;
    eocdBuffer.writeUInt16LE(commentLength, pos);
    pos += 2;
    if (commentLength > 0) {
      commentBytes.copy(eocdBuffer, pos, 0, commentLength);
    }

    fs.writeSync(destFd, eocdBuffer, 0, eocdBuffer.length);

    return { centralDirOffset: centralDirStartOffset, centralDirSize };
  }

  /**
   * Copy only ZIP entry data to the destination file (no central directory or EOCD).
   * Use this when you want to add more entries before finalizing. Then call
   * writeCentralDirectoryAndEOCD with all entries (copied + new) to produce a valid ZIP.
   *
   * @param sourceZipPath - Path to source ZIP file
   * @param destZipPath - Path to destination file (will contain only entry data until finalized)
   * @param options - Optional copy options (filtering, sorting)
   * @returns Result with dataEndOffset and copiedEntries for use when adding files and finalizing
   */
  async copyZipEntriesOnly(
    sourceZipPath: string,
    destZipPath: string,
    options?: CopyOptions
  ): Promise<CopyEntriesOnlyResult> {
    const sourceEntries = await this.zipkitNode.loadZipFile(sourceZipPath);

    let entriesToCopy = options?.entryFilter
      ? sourceEntries.filter(options.entryFilter)
      : sourceEntries;

    if (options?.entrySorter) {
      entriesToCopy = [...entriesToCopy].sort(options.entrySorter);
    }

    if (entriesToCopy.length === 0) {
      throw new Error('No entries to copy after filtering');
    }

    const sourceFd = fs.openSync(sourceZipPath, 'r');
    const destFd = fs.openSync(destZipPath, 'w');

    try {
      let destOffset = 0;
      const copiedEntries: ZipEntry[] = [];

      for (const sourceEntry of entriesToCopy) {
        const newLocalHdrOffset = destOffset;
        const bytesWritten = this.copyEntryBytes(sourceFd, destFd, sourceEntry);
        destOffset += bytesWritten;
        const clonedEntry = this.cloneEntryWithOffset(sourceEntry, newLocalHdrOffset);
        copiedEntries.push(clonedEntry);
      }

      return {
        destPath: destZipPath,
        dataEndOffset: destOffset,
        copiedEntries,
      };
    } finally {
      fs.closeSync(sourceFd);
      fs.closeSync(destFd);
    }
  }

  /**
   * Append central directory and End of Central Directory to a file that already
   * contains ZIP entry data (e.g. from copyZipEntriesOnly plus any newly added entries).
   * Call this after adding files to produce a valid ZIP.
   *
   * @param destZipPath - Path to the partial ZIP file (entry data only)
   * @param entries - All entries in order (copied + any new), each with localHdrOffset set
   * @param options - Optional finalize options (e.g. zipComment)
   */
  writeCentralDirectoryAndEOCD(
    destZipPath: string,
    entries: ZipEntry[],
    options?: FinalizeZipOptions
  ): void {
    if (entries.length === 0) {
      throw new Error('At least one entry is required to finalize');
    }

    const zipComment = options?.zipComment ?? '';
    const destFd = fs.openSync(destZipPath, 'a');

    try {
      this.writeCentralDirectoryAndEOCDToFd(destFd, entries, zipComment);
    } finally {
      fs.closeSync(destFd);
    }
  }

  /**
   * Copy ZIP file entries efficiently
   * 
   * Main method that copies entries from source ZIP to destination ZIP.
   * Uses ZipEntry instances directly to avoid unnecessary parsing.
   * 
   * @param sourceZipPath - Path to source ZIP file
   * @param destZipPath - Path to destination ZIP file
   * @param options - Optional copy options (filtering, sorting, etc.)
   * @returns Copy result with entry information
   */
  async copyZipFile(
    sourceZipPath: string,
    destZipPath: string,
    options?: CopyOptions
  ): Promise<CopyResult> {
    // Copy only entry data, then write central directory and EOCD (no added entries)
    const { dataEndOffset, copiedEntries } = await this.copyZipEntriesOnly(
      sourceZipPath,
      destZipPath,
      options
    );

    const zipComment =
      options?.preserveComments !== false && this.zipkitNode.getZipComment()
        ? this.zipkitNode.getZipComment()!
        : '';

    this.writeCentralDirectoryAndEOCD(destZipPath, copiedEntries, { zipComment });

    return {
      entries: copiedEntries.map(entry => ({
        filename: entry.filename,
        localHeaderOffset: entry.localHdrOffset,
        compressedSize: entry.compressedSize,
      })),
      centralDirOffset: dataEndOffset,
      totalEntries: copiedEntries.length,
    };
  }
}
