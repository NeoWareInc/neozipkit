// ======================================
//	Zipkit.ts - Enhanced Zipkit with Dual Mode Support
//  Copyright (c) 2025 NeoWare, Inc. All rights reserved.
// ======================================

import ZipEntry from './ZipEntry';
import Errors from './constants/Errors';
import { Logger } from './components/Logger';
import { NEOZIPKIT_INFO } from '../types';
import { ZipCompress, CompressOptions } from './ZipCompress';
import ZipDecompress from './ZipDecompress';
import { sha256, crc32 } from './encryption/ZipCrypto';
import HashCalculator from './components/HashCalculator';
import { 
  LOCAL_HDR,
  ENCRYPT_HDR_SIZE,
  CMP_METHOD,
  CENTRAL_END, 
  CENTRAL_DIR, 
  ZIP64_CENTRAL_END, 
  ZIP64_CENTRAL_DIR ,
  GP_FLAG,
  TIMESTAMP_SUBMITTED,
  TIMESTAMP_METADATA,
  TOKENIZED_METADATA,
  LOCAL_FILE_HEADER,
  CENTRAL_FILE_HEADER,
  CENTRAL_DIRECTORY_END,
  HDR_ID
} from './constants/Headers';

/**
 * Streaming file handle interface
 * Used for file-based ZIP operations in server environments
 */
export interface StreamingFileHandle {
  read(buffer: Buffer, offset: number, length: number, position: number): Promise<number>;
  stat(): Promise<{ size: number }>;
  close(): Promise<void>;
}

// Re-export interfaces and constants (keep exports grouped at top)
export { 
  ZipEntry, 
  Errors, 
  CMP_METHOD, 
  TIMESTAMP_METADATA, 
  TIMESTAMP_SUBMITTED,
  TOKENIZED_METADATA,
  LOCAL_HDR,
  ENCRYPT_HDR_SIZE,
  CENTRAL_END, 
  CENTRAL_DIR, 
  ZIP64_CENTRAL_END, 
  ZIP64_CENTRAL_DIR,
  GP_FLAG,
  LOCAL_FILE_HEADER,
  CENTRAL_FILE_HEADER,
  CENTRAL_DIRECTORY_END,
  HDR_ID
};
export { CompressOptions, CreateZipOptions } from './ZipCompress';

/**
 * Configuration options for Zipkit instances
 * 
 * Controls various aspects of ZIP file processing including memory usage,
 * chunk sizes for streaming operations, and debug logging.
 * 
 * @interface ZipkitConfig
 * @property {number} [bufferSize] - Buffer size in bytes for streaming operations.
 *                                  Files larger than this size will be processed
 *                                  in chunks for memory efficiency. Default: 512KB (524288 bytes).
 * @property {boolean} [debug] - Enable debug logging for detailed diagnostic information.
 *                              When enabled, sets Logger level to 'debug'. Default: false.
 * 
 * @example
 * const zip = new Zipkit({
 *   bufferSize: 512 * 1024,    // 512KB buffer
 *   debug: true
 * });
 */
export interface ZipkitConfig {
  bufferSize?: number;         // For streaming mode (default: 512KB)
  debug?: boolean;           // Enable debug logging
}

/**
 * Zipkit - Enhanced ZIP File Processing Library with Dual Mode Support
 * 
 * Core ZIP file processing library supporting both buffer-based (in-memory) and
 * file-based (streaming) modes. See README.md for detailed documentation.
 * 
 * @class Zipkit
 * @static {string} version - Library version string
 * @static {string} releaseDate - Library release date
 */
export default class Zipkit {
  static readonly version = NEOZIPKIT_INFO.version;
  static readonly releaseDate = NEOZIPKIT_INFO.releaseDate;

  // Configuration
  private config: ZipkitConfig;
  
  // In-memory mode data
  private inBuffer: Buffer | null = null;
  protected zipEntries: ZipEntry[] = []; // Protected: single source of truth for ZIP entry order (accessible by subclasses)
  private centralDirSize: number = 0;
  private centralDirOffset: number = 0;
  
  // Common data
  private zipComment: string | null = null;
  
  // Private components (lazy-loaded)
  private _zipkitCmp: ZipCompress | null = null;
  private _zipkitDeCmp: ZipDecompress | null = null;

  /**
   * Creates a new Zipkit instance with optional configuration
   * 
   * @param config - Optional configuration object (ZipkitConfig)
   *   - bufferSize: Buffer size for streaming operations (default: 512KB)
   *   - debug: Enable debug logging (default: false)
   * 
   * @example
   * const zip = new Zipkit({ bufferSize: 512 * 1024, debug: true });
   */
  constructor(config: ZipkitConfig = {}) {
    this.config = {
      bufferSize: config.bufferSize || 512 * 1024, // 512KB default (optimal for modern systems)
      debug: config.debug || false // Default false
    };

    // Configure Logger based on debug setting
    if (this.config.debug) {
      Logger.setLevel('debug');
    }
    
    // Note: ZipCompress and ZipDecompress are lazy-loaded when first accessed
    // ZSTD codec is also lazily initialized on first use (module-level singleton)
  }

  /**
   * Lazy-load ZipCompress instance
   * @returns ZipCompress instance (created on first access)
   */
  private getZipCompress(): ZipCompress {
    if (!this._zipkitCmp) {
      this._zipkitCmp = new ZipCompress(this);
    }
    return this._zipkitCmp;
  }

  /**
   * Lazy-load ZipDecompress instance
   * @returns ZipDecompress instance (created on first access)
   */
  private getZipDecompress(): ZipDecompress {
    if (!this._zipkitDeCmp) {
      this._zipkitDeCmp = new ZipDecompress(this);
    }
    return this._zipkitDeCmp;
  }

  /**
   * Get the configured buffer size for streaming operations
   * @returns Buffer size in bytes (default: 512KB)
   */
  getBufferSize(): number {
    return this.config.bufferSize || 512 * 1024; // 512KB default (optimal for modern systems)
  }

  /**
   * Check if ZIP is loaded in buffer mode
   * @returns true if buffer-based ZIP is loaded
   */
  hasInBuffer(): boolean {
    return this.inBuffer !== null && this.inBuffer.length > 0;
  }


  // ============================================================================
  // ZipCompress Wrapper Methods
  // ============================================================================

  /**
   * Compress data for a ZIP entry (Buffer-based only)
   * Wrapper for ZipCompress.compressData()
   * 
   * @param entry - ZIP entry to compress
   * @param data - Buffer containing data to compress
   * @param options - Compression options
   * @param onOutputBuffer - Optional callback for streaming output
   * @returns Promise resolving to Buffer containing compressed data
   */
  async compressData(
    entry: ZipEntry,
    data: Buffer,
    options?: CompressOptions,
    onOutputBuffer?: (data: Buffer) => Promise<void>
  ): Promise<Buffer> {
    return this.getZipCompress().compressData(entry, data, options, onOutputBuffer);
  }

  /**
   * Compress data using deflate algorithm with chunked processing
   * Wrapper for ZipCompress.deflateCompress()
   * 
   * @param data - Data to compress (Buffer or chunked reader)
   * @param options - Compression options
   * @param bufferSize - Size of buffer to read (default: 512KB)
   * @param entry - Optional ZIP entry for hash calculation
   * @param onOutputBuffer - Optional callback for streaming output
   * @returns Promise resolving to Buffer containing compressed data
   */
  async deflateCompress(
    data: Buffer | { totalSize: number, onReadChunk: (position: number, size: number) => Buffer, onOutChunk: (chunk: Buffer) => void },
    options?: CompressOptions,
    bufferSize?: number,
    entry?: ZipEntry,
    onOutputBuffer?: (data: Buffer) => Promise<void>
  ): Promise<Buffer> {
    return this.getZipCompress().deflateCompress(data, options, bufferSize, entry, onOutputBuffer);
  }

  /**
   * Compress data using deflate algorithm (synchronous, small buffers only)
   * Wrapper for ZipCompress.deflate()
   * 
   * @param inbuf - Buffer containing data to compress
   * @param options - Compression options
   * @returns Buffer containing compressed data
   */
  deflate(inbuf: Buffer, options?: CompressOptions): Buffer {
    return this.getZipCompress().deflate(inbuf, options);
  }

  /**
   * Compress data using Zstandard (zstd) algorithm
   * Wrapper for ZipCompress.zstdCompress()
   * 
   * Note: ZSTD codec is lazily initialized on first use (module-level singleton).
   * Initialization happens automatically when needed.
   * 
   * @param input - Buffer to compress OR chunked reader object
   * @param options - Compression options
   * @param bufferSize - Size of buffer to read if using chunked reader (default: 512KB)
   * @param entry - Optional ZIP entry for hash calculation
   * @param onOutputBuffer - Optional callback for streaming output
   * @returns Promise resolving to Buffer containing compressed data
   */
  async zstdCompress(
    input: Buffer | { totalSize: number, readChunk: (position: number, size: number) => Buffer },
    options?: CompressOptions,
    bufferSize?: number,
    entry?: ZipEntry,
    onOutputBuffer?: (data: Buffer) => Promise<void>
  ): Promise<Buffer> {
    return this.getZipCompress().zstdCompress(input, options, bufferSize, entry, onOutputBuffer);
  }

  /**
   * Compress file data in memory and return ZIP entry information as Buffer
   * Wrapper for ZipCompress.compressFileBuffer()
   * 
   * @param entry - ZIP entry to compress
   * @param fileData - File data buffer to compress
   * @param cmpOptions - Compression options
   * @returns Promise resolving to Buffer containing local header + compressed data
   */
  async compressFileBuffer(
    entry: ZipEntry,
    fileData: Buffer,
    cmpOptions?: CompressOptions
  ): Promise<Buffer> {
    return this.getZipCompress().compressFileBuffer(entry, fileData, cmpOptions);
  }

  // ============================================================================
  // ZipDecompress Wrapper Methods
  // ============================================================================

  /**
   * Extract file data (Buffer-based ZIP only)
   * Wrapper for ZipDecompress.extract()
   * 
   * @param entry - ZIP entry to extract
   * @param skipHashCheck - Skip hash verification (CRC-32 or SHA-256)
   * @returns Promise resolving to Buffer containing extracted data, or null if failed
   * @throws Error if not a Buffer-based ZIP
   */
  async extract(entry: ZipEntry, skipHashCheck?: boolean): Promise<Buffer | null> {
    return this.getZipDecompress().extract(entry, skipHashCheck);
  }


  // ============================================================================
  // Static Logging Wrapper Methods
  // ============================================================================

  /**
   * Note: Logging for ZipCompress and ZipDecompress is controlled by their
   * static loggingEnabled property. Set it directly:
   *   ZipCompress.loggingEnabled = true/false;
   *   ZipDecompress.loggingEnabled = true/false;
   */

  /**
   * Load ZIP file from buffer (in-memory mode)
   * 
   * **Required**: You must call this method (or the appropriate load method for your platform)
   * before calling `getDirectory()` or any other ZIP operations. This method:
   * 1. Resets all ZIP data
   * 2. Stores the buffer in this.inBuffer
   * 3. Loads EOCD and parses central directory
   * 4. Populates this.zipEntries[] array
   * 
   * For browser applications, use `ZipkitBrowser.loadZipBlob()` instead.
   * For server applications with file paths, use `ZipkitServer.loadZipFile()` instead.
   * 
   * @param inBuf - Buffer containing the complete ZIP file data
   * @returns ZipEntry[] Array of all entries in the ZIP file
   */
  loadZip(inBuf: Buffer): ZipEntry[] {
    this.resetZipData();
    // Store buffer for backward compatibility with detection logic
    this.inBuffer = inBuf;
    // Load EOCD and parse central directory
    this.loadEOCDFromBuffer(inBuf);
    const entries = this.getDirectoryFromBuffer();
    this.zipEntries = entries;
    return entries;
  }


  /**
   * Reset all ZIP-related data to initial state
   * 
   * Clears all internal state including zipEntries[], inBuffer, and zipComment.
   * 
   * Note: ZipCompress and ZipDecompress instances are not recreated.
   * ZSTD codec is a module-level singleton and is lazily initialized on first use,
   * so no cleanup is needed. No memory buffers are allocated until compression/decompression
   * operations are performed.
   */
  private resetZipData(): void {
    this.inBuffer = null;
    this.zipEntries = [];
    this.reset();
    this.zipComment = null;
    // Reset lazy-loaded components so they can be recreated on next access
    this._zipkitCmp = null;
    this._zipkitDeCmp = null;
    // Note: ZSTD codec is module-level singleton, so no cleanup needed
  }

  /**
   * Get central directory entries (synchronous, buffer-based only)
   * 
   * Returns entries from zipEntries[] array which serves as unified storage.
   * 
   * **Important**: This method does NOT load the ZIP file. You must call `loadZip()` first
   * to populate zipEntries[]. If the ZIP is not loaded, this method returns an empty array.
   * 
   * @param debug - Optional debug flag for logging
   * @returns Array of ZipEntry objects, or empty array if ZIP not loaded
   */
  getDirectory(debug?: boolean): ZipEntry[] {
    return this.zipEntries;
  }


  /**
   * Get specific ZIP entry by filename from zipEntries[] array
   * 
   * @param filename - The name/path of the file/directory to find
   * @returns ZipEntry object if found, null if not found
   */
  getZipEntry(filename: string): ZipEntry | null {
    try {
      const centralDir = this.getDirectory();
      return centralDir.find((entry: ZipEntry) => entry.filename === filename) || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Ensure buffer is available (in-memory mode)
   */
  public ensureBuffer(): Buffer {
    if (!this.inBuffer) {
      this.inBuffer = Buffer.alloc(0);
    }
    return this.inBuffer;
  }

  /**
   * Parse local header (in-memory mode)
   */
  public parseLocalHeader(entry: ZipEntry, buffer: Buffer): Buffer {
    const localData = buffer.subarray(entry.localHdrOffset);
    
    if (localData.readUInt32LE(0) !== LOCAL_HDR.SIGNATURE) {
      throw new Error(Errors.INVALID_CEN);
    }
    
    let _encryptLen = 0;
    const _bitFlags = localData.readUInt16LE(LOCAL_HDR.FLAGS);
    if (_bitFlags & GP_FLAG.ENCRYPTED) {
      _encryptLen = ENCRYPT_HDR_SIZE;
    }
    
    let _fnameLen = localData.readUInt16LE(LOCAL_HDR.FNAME_LEN);
    let _extraLen = localData.readUInt16LE(LOCAL_HDR.EXTRA_LEN);
    let _localSize = LOCAL_HDR.SIZE + _fnameLen + _extraLen;
    
    // For encrypted files: entry.compressedSize from central directory includes the 12-byte encryption header
    // parseLocalHeader should return encrypted data WITHOUT the header (decryptBuffer will extract and prepend it)
    // Structure: [local header][filename][extra][12-byte encryption header][encrypted compressed data]
    // We need to read: encrypted compressed data (without the 12-byte header)
    // Start: _localSize + _encryptLen (after the header)
    // End: _localSize + entry.compressedSize (total includes header, so this gives us data without header)
    const dataStart = _localSize + _encryptLen;
    const dataEnd = _localSize + entry.compressedSize;
    
    // Return encrypted data WITHOUT the encryption header
    // decryptBuffer will extract the header from localSize to localSize+12 and prepend it
    return localData.subarray(dataStart, dataEnd);
  }

  /**
   * Test CRC32 checksum
   * Always checks CRC against entry.crc from central directory
   * For DATA_DESC files, CRC is stored in central directory, not local header
   */
  public testCRC32(entry: ZipEntry, data: Buffer): boolean {
    // Always check CRC against entry.crc from central directory
    // For DATA_DESC files, CRC is stored in central directory, not local header
      const _crc = crc32(data);
    const isValid = _crc === entry.crc;
    Logger.debug(`[DEBUG] testCRC32() comparison: calculated=${_crc}, stored=${entry.crc}, isValid=${isValid ? '✓' : '✗'}, DATA_DESC=${(entry.bitFlags & 0x8) !== 0 ? 'YES' : 'NO'}`);
    return isValid;
  }

  /**
   * Test SHA256 hash
   */
  public testSHA256(entry: ZipEntry, data: Buffer): boolean {
    if (!entry.sha256) {
      throw new Error(Errors.UNKNOWN_SHA256);
    }
    const _sha256 = sha256(data);
    const isValid = _sha256 === entry.sha256;
    Logger.debug(`[DEBUG] testSHA256() comparison: calculated=${_sha256}, stored=${entry.sha256}, isValid=${isValid ? '✓' : '✗'}`);
    return isValid;
  }

  /**
   * Get memory usage statistics
   * 
   * @returns Object containing backend type, total memory usage in bytes, and entry count
   */
  getMemoryUsage(): { backend: 'buffer' | 'file' | 'none'; memoryUsage: number; entries: number } {
    const baseMemory = this.inBuffer?.length || 0;
    const entriesMemory = this.zipEntries.length * 1024; // Approximate memory per entry
    
    let backend: 'buffer' | 'file' | 'none';
    if (this.inBuffer) {
      backend = 'buffer';
    } else {
      // Zipkit is buffer-based only, so if no buffer, backend is 'none'
      // For file-based operations, use ZipkitServer
      backend = 'none';
    }
    
    return {
      backend,
      memoryUsage: baseMemory + entriesMemory,
      entries: this.zipEntries.length
    };
  }

  /**
   * Create a new ZIP entry and automatically add it to zipEntries[]
   * 
   * @param filename - Entry filename
   * @param data - Optional entry data (for CRC calculation)
   * @param options - Optional entry options
   * @returns Created ZipEntry instance
   */
  createZipEntry(filename: string, data?: Buffer, options?: any): ZipEntry {
    const entry = new ZipEntry(filename, null, false);
    // Set basic properties
    if (data) {
      entry.crc = crc32(data);
      entry.uncompressedSize = data.length;
      entry.compressedSize = data.length;
    } else {
      entry.crc = 0;
      entry.uncompressedSize = 0;
      entry.compressedSize = 0;
    }
    entry.cmpMethod = CMP_METHOD.STORED;
    entry.bitFlags = 0;
    // Note: lastModTime and lastModDate properties may not exist in ZipEntry
    // entry.lastModTime = Math.floor(Date.now() / 1000);
    // entry.lastModDate = Math.floor(Date.now() / 1000);
    
    // Automatically add entry to zipEntries[] (maintains order as single source of truth)
    this.zipEntries.push(entry);
    
    return entry;
  }

  /**
   * Copy entry from another ZIP (buffer-based only)
   * For file-based ZIP operations, use ZipkitServer.copyEntry()
   */
  async copyEntry(sourceEntry: ZipEntry): Promise<Buffer> {
    // For Buffer-based ZIP, we need to reconstruct the entry data
    // This is a simplified version - in practice, you'd need to read from the original ZIP
    if (sourceEntry.cmpData) {
      const localHdr = sourceEntry.createLocalHdr();
      return Buffer.concat([localHdr, sourceEntry.cmpData]);
    }
    
    throw new Error('Cannot copy entry: no compressed data available');
  }

  /**
   * Central end header getter (for compatibility)
   * 
   * Returns a function that creates the central end header using totalEntries from zipEntries[].
   * 
   * @returns Function that creates central end header buffer
   */
  get centralEndHdr(): (centralDirSize: number, centralDirOffset: number) => Buffer {
    // Return a function that calls centralEndHdr with totalEntries from zipEntries[]
    return (centralDirSize: number, centralDirOffset: number) => {
      const totalEntries = this.zipEntries.length;
      return this.centralEndHdrMethod(centralDirSize, centralDirOffset, totalEntries);
    };
  }

  /**
   * Get ZIP comment
   * 
   * @returns ZIP file comment string or null
   */
  getZipComment(): string | null {
    return this.zipComment;
  }

  // ============================================================================
  // Buffer-based ZIP Loading Methods (merged from ZipLoadEntries)
  // ============================================================================

  /**
   * Load EOCD from in-memory buffer (buffer mode)
   */
  private loadEOCDFromBuffer(buffer: Buffer): void {
    const fileSize = buffer.length;
    const searchSize = Math.min(0xFFFF + 22, fileSize);
    const searchStart = fileSize - searchSize;
    const scan = buffer.subarray(searchStart, searchStart + searchSize);

    // Find EOCD signature
    let eocdOffset = -1;
    for (let i = scan.length - 22; i >= 0; i--) {
      if (scan[i] === 0x50) {
        if (scan.readUInt32LE(i) === CENTRAL_END.SIGNATURE) {
          eocdOffset = searchStart + i;
          break;
        }
      }
    }
    if (eocdOffset === -1) {
      throw new Error(Errors.INVALID_FORMAT);
    }

    const eocdBuffer = buffer.subarray(eocdOffset, eocdOffset + 22);
    if (eocdBuffer.readUInt32LE(0) === CENTRAL_END.SIGNATURE) {
      this.centralDirSize = eocdBuffer.readUInt32LE(CENTRAL_END.CENTRAL_DIR_SIZE);
      this.centralDirOffset = eocdBuffer.readUInt32LE(CENTRAL_END.CENTRAL_DIR_OFFSET);

      if (this.centralDirOffset === 0xFFFFFFFF) {
        // ZIP64: locate locator (20 bytes before EOCD) and then ZIP64 EOCD (56 bytes)
        const locatorOffset = eocdOffset - 20;
        const locatorBuffer = buffer.subarray(locatorOffset, locatorOffset + 20);
        if (locatorBuffer.readUInt32LE(0) === ZIP64_CENTRAL_END.SIGNATURE) {
          const zip64Offset = Number(locatorBuffer.readBigUInt64LE(8));
          const zip64Buffer = buffer.subarray(zip64Offset, zip64Offset + 56);
          this.centralDirSize = Number(zip64Buffer.readBigUInt64LE(ZIP64_CENTRAL_DIR.CENTRAL_DIR_SIZE));
          this.centralDirOffset = Number(zip64Buffer.readBigUInt64LE(ZIP64_CENTRAL_DIR.CENTRAL_DIR_OFFSET));
        }
      }
    } else {
      throw new Error(Errors.INVALID_FORMAT);
    }

    // ZIP comment
    const commentLength = eocdBuffer.readUInt16LE(CENTRAL_END.ZIP_COMMENT_LEN);
    if (commentLength > 0) {
      const commentStart = eocdOffset + 22;
      this.zipComment = buffer.subarray(commentStart, commentStart + commentLength).toString();
    }
  }

  /**
   * Get directory from buffer (buffer mode only)
   * Note: zipEntries[] in Zipkit is the single source of truth for caching.
   * This method always parses fresh from the buffer.
   */
  private getDirectoryFromBuffer(): ZipEntry[] {
    if (!this.inBuffer) {
      return [];
    }

    const buffer = this.inBuffer;
    const entries: ZipEntry[] = [];
    let offset = this.centralDirOffset;
    let remaining = this.centralDirSize;
    const bufferSize = this.config.bufferSize || 512 * 1024;

    while (remaining > 0) {
      const currentBufferSize = Math.min(bufferSize, remaining);
      const chunk = buffer.subarray(offset, offset + currentBufferSize);

      // Parse entries from chunk
      let chunkOffset = 0;
      while (chunkOffset < chunk.length) {
        if (chunk.readUInt32LE(chunkOffset) !== CENTRAL_DIR.SIGNATURE) {
          break; // End of central directory
        }

        // Parse central directory entry
        const entry = new ZipEntry(null, null, false);
        const entryData = chunk.subarray(chunkOffset);
        const remainingData = entry.readZipEntry(entryData);

        entries.push(entry);

        // Move to next entry
        chunkOffset += (entryData.length - remainingData.length);
      }

      offset += currentBufferSize;
      remaining -= currentBufferSize;
    }

    // Return entries in original order (do NOT sort by default)
    // Central directory order should match data section order
    // Note: zipEntries[] in Zipkit is the single source of truth for caching
    return entries;
  }

  /**
   * Reset internal state (private method for Zipkit to call)
   * Clears all ZIP-related data while keeping the instance alive
   */
  private reset(): void {
    this.centralDirSize = 0;
    this.centralDirOffset = 0;
  }

  /**
   * Create central end header
   * Note: totalEntries must be passed as parameter since zipEntries[] in Zipkit is the cache
   */
  private centralEndHdrMethod(centralDirSize: number, centralDirOffset: number, totalEntries: number): Buffer {
    const ceBuf = Buffer.alloc(CENTRAL_END.SIZE);
    ceBuf.writeUInt32LE(CENTRAL_END.SIGNATURE, 0);
    ceBuf.writeUInt16LE(0, 4); // Number of this disk
    ceBuf.writeUInt16LE(0, 6); // Number of the disk with the start of the central directory
    ceBuf.writeUInt16LE(totalEntries, 8); // Total number of entries
    ceBuf.writeUInt16LE(totalEntries, 10); // Total number of entries on this disk
    ceBuf.writeUInt32LE(centralDirSize, 12); // Size of central directory
    ceBuf.writeUInt32LE(centralDirOffset, 16); // Offset of start of central directory
    ceBuf.writeUInt16LE(0, 20); // ZIP file comment length
    
    return ceBuf;
  }

  /**
   * Calculate Merkle Root of the ZIP file
   * 
   * Excludes blockchain metadata files to ensure consistent calculation.
   * Simply calls getDirectory() and returns null if empty.
   * 
   * @returns Merkle root string or null if calculation fails
   */
  getMerkleRoot(): string | null {
    // Simply get directory - no loading logic
    let zipEntries: ZipEntry[];
    try {
      zipEntries = this.getDirectory();
    } catch (error) {
      // Catch any errors from getDirectory() - this should never happen
      // but if it does, log it and return null
      Logger.error(`getMerkleRoot(): Error calling getDirectory(): ${error instanceof Error ? error.message : String(error)}`);
      Logger.error(`getMerkleRoot(): Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      return null;
    }
    
    if (!zipEntries || zipEntries.length === 0) {
      return null;
    }
  
    const hashAccumulator = new HashCalculator({ enableAccumulation: true });
    
    // Filter out blockchain metadata files to ensure consistent Merkle Root calculation
    // Inline check to avoid conflict with ZipkitBrowser's isMetadataFile() method
    const contentEntries = zipEntries.filter(entry => {
      const filename = entry.filename || '';
      return filename !== TIMESTAMP_SUBMITTED &&
             filename !== TIMESTAMP_METADATA &&
             filename !== TOKENIZED_METADATA;
    });
    
    for (const entry of contentEntries) {
      if (entry.sha256) {
        // Convert hex string to Buffer
        const hashBuffer = Buffer.from(entry.sha256, 'hex');
        hashAccumulator.addHash(hashBuffer);
      }
    }
    
    const merkleRoot = hashAccumulator.merkleRoot();
    if (!merkleRoot) {
      return null;
    }

    return merkleRoot;
  }

  /**
   * Calculate Merkle Root of the ZIP file asynchronously
   * 
   * Excludes blockchain metadata files to ensure consistent calculation.
   * Works with both buffer-based and file-based ZIPs.
   * 
   * @returns Promise resolving to Merkle root string or null if calculation fails
   */
  async getMerkleRootAsync(): Promise<string | null> {
    let zipEntries: ZipEntry[] = [];
    
    try {
      // Get entries based on ZIP type
      if (this.inBuffer) {
        zipEntries = this.getDirectory();
      } else {
        // File-based: cannot get entries synchronously - return null
        // Caller should use ZipkitServer.getMerkleRootAsync() for file-based ZIPs
        Logger.error('getMerkleRootAsync() called on file-based ZIP. Use ZipkitServer.getMerkleRootAsync() instead.');
        return null;
      }
    } catch (error) {
      Logger.error(`Failed to get directory for merkle root calculation: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    
    if (!zipEntries || zipEntries.length === 0) {
      return null;
    }
  
    const hashAccumulator = new HashCalculator({ enableAccumulation: true });
    
    // Filter out blockchain metadata files to ensure consistent Merkle Root calculation
    // Inline check to avoid conflict with ZipkitBrowser's isMetadataFile() method
    const contentEntries = zipEntries.filter(entry => {
      const filename = entry.filename || '';
      return filename !== TIMESTAMP_SUBMITTED &&
             filename !== TIMESTAMP_METADATA &&
             filename !== TOKENIZED_METADATA;
    });
    
    for (const entry of contentEntries) {
      if (entry.sha256) {
        // Convert hex string to Buffer
        const hashBuffer = Buffer.from(entry.sha256, 'hex');
        hashAccumulator.addHash(hashBuffer);
      }
    }
    
    const merkleRoot = hashAccumulator.merkleRoot();
    if (!merkleRoot) {
      return null;
    }

    return merkleRoot;
  }

}
