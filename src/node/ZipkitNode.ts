// ======================================
//	ZipkitNode.ts - Node.js File-Based ZIP Operations
//  Copyright (c) 2025 NeoWare, Inc. All rights reserved.
// ======================================

import Zipkit, { CompressOptions, StreamingFileHandle } from '../core';
import ZipEntry from '../core/ZipEntry';
import Errors from '../core/constants/Errors';
import { ZipCompressNode } from './ZipCompressNode';
import { ZipDecompressNode } from './ZipDecompressNode';
import { 
  CENTRAL_END, 
  CENTRAL_DIR, 
  ZIP64_CENTRAL_END, 
  ZIP64_CENTRAL_DIR,
  LOCAL_HDR,
  GP_FLAG,
  ENCRYPT_HDR_SIZE
} from '../core/constants/Headers';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';

// Re-export everything from core Zipkit
export * from '../core';
export { ZipEntry, Errors };

// ============================================================================
// ZIP File Writer Interface
// ============================================================================

/**
 * Interface for ZIP file writing operations
 * Tracks file descriptor, stream, current position, and entry positions
 */
export interface ZipFileWriter {
  outputFd: number;
  outputStream: fs.WriteStream;
  currentPosition: number;
  entryPositions: Map<string, number>; // filename -> position
}

// ======================================
//	ZipkitNode
// ======================================

/**
 * ZipkitNode - Node.js file-based ZIP operations
 * 
 * Extends Zipkit to provide file I/O operations for Node.js environments.
 * Similar to ZipkitBrowser which provides Blob operations for browser environments.
 * 
 * @example
 * ```typescript
 * const zip = new ZipkitNode();
 * await zip.loadZipFile('archive.zip');
 * await zip.extractToFile(entry, './output/file.txt');
 * ```
 */
export default class ZipkitNode extends Zipkit {
  // Override _zipkitCmp to use ZipCompressNode instead of ZipCompress (lazy-loaded)
  private _zipkitCmpNode: ZipCompressNode | null = null;
  // Override _zipkitDeCmp to use ZipDecompressNode instead of ZipDecompress (lazy-loaded)
  private _zipkitDeCmpNode: ZipDecompressNode | null = null;
  
  // File-based ZIP loading properties (merged from ZipLoadEntriesServer)
  private fileHandle: StreamingFileHandle | null = null;
  private filePath: string | null = null;
  private fileSize: number = 0;
  // Note: centralDirSize and centralDirOffset are inherited from Zipkit base class

  constructor(config?: { bufferSize?: number; debug?: boolean }) {
    super(config);
    
    // Note: ZipCompressNode and ZipDecompressNode are lazy-loaded when first accessed
    // They will override the base class _zipkitCmp and _zipkitDeCmp on first access
  }

  /**
   * Lazy-load ZipCompressNode instance and override base class _zipkitCmp
   * @returns ZipCompressNode instance (created on first access)
   */
  private getZipCompressNode(): ZipCompressNode {
    if (!this._zipkitCmpNode) {
      this._zipkitCmpNode = new ZipCompressNode(this);
      // Override the base class _zipkitCmp with ZipCompressNode
      const zipkit = this as any;
      zipkit._zipkitCmp = this._zipkitCmpNode;
    }
    return this._zipkitCmpNode;
  }

  /**
   * Lazy-load ZipDecompressNode instance and override base class _zipkitDeCmp
   * @returns ZipDecompressNode instance (created on first access)
   */
  private getZipDecompressNode(): ZipDecompressNode {
    if (!this._zipkitDeCmpNode) {
      this._zipkitDeCmpNode = new ZipDecompressNode(this);
      // Override the base class _zipkitDeCmp with ZipDecompressNode
      const zipkit = this as any;
      zipkit._zipkitDeCmp = this._zipkitDeCmpNode;
    }
    return this._zipkitDeCmpNode;
  }

  // ============================================================================
  // File Loading Methods
  // ============================================================================

  /**
   * Load ZIP file from file path (streaming mode)
   * 
   * **Required**: You must call this method before calling `getDirectory()` or any other ZIP operations.
   * This method:
   * 1. Resets all ZIP data
   * 2. Opens the file handle
   * 3. Loads EOCD and parses central directory
   * 4. Populates this.zipEntries[] array
   * 
   * @param filePath - Path to the ZIP file to load
   * @returns Promise<ZipEntry[]> Array of all entries in the ZIP file
   * @throws Error if Node.js environment not available
   */
  async loadZipFile(filePath: string): Promise<ZipEntry[]> {
    // Access private members via type assertion (ZipkitServer extends Zipkit)
    const zipkit = this as any;
    zipkit.resetZipData();
    
    // Reset file-based data
    this.resetFileData();
    this.filePath = filePath;
    
    // Open file handle
    this.fileHandle = await this.openFileHandle(filePath);
    const stats = await this.fileHandle.stat();
    this.fileSize = stats.size;
    
    // Load EOCD to get central directory info (sets zipComment internally)
    await this.loadEOCD();
    
    // Load central directory in chunks
    const entries: ZipEntry[] = [];
    let offset = zipkit.centralDirOffset;
    let remaining = zipkit.centralDirSize;
    const bufferSize = this.getBufferSize();
    
    while (remaining > 0) {
      const currentBufferSize = Math.min(bufferSize, remaining);
      const chunk = Buffer.alloc(currentBufferSize);
      await this.fileHandle.read(chunk, 0, currentBufferSize, offset);
      
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
    
    // Store entries in zipEntries[] array (single source of truth)
    this.zipEntries = entries;
    return entries;
  }


  /**
   * Alias for loadZipFile() for consistency
   * @param filePath - Path to the ZIP file to load
   * @returns Promise<ZipEntry[]> Array of all entries in the ZIP file
   */
  async loadZipFromFile(filePath: string): Promise<ZipEntry[]> {
    return this.loadZipFile(filePath);
  }

  // ============================================================================
  // File Extraction Methods
  // ============================================================================

  /**
   * Extract file directly to disk with true streaming (no memory buffering)
   * Wrapper for ZipDecompress.extractToFile()
   * 
   * Note: ZSTD codec is lazily initialized on first use (module-level singleton).
   * Initialization happens automatically when needed.
   * 
   * @param entry - ZIP entry to extract
   * @param outputPath - Path where the file should be written
   * @param options - Optional extraction options:
   *   - skipHashCheck: Skip hash verification (default: false)
   *   - onProgress: Callback function receiving bytes extracted as parameter
   * @returns Promise that resolves when extraction is complete
   * @throws Error if not a File-based ZIP
   */
  async extractToFile(
    entry: ZipEntry,
    outputPath: string,
    options?: {
      skipHashCheck?: boolean;
      onProgress?: (bytes: number) => void;
    }
  ): Promise<void> {
    return this.getZipDecompressNode().extractToFile(entry, outputPath, options);
  }

  /**
   * Alias for extractToFile() for consistency
   * @param entry - ZIP entry to extract
   * @param outputPath - Path where the file should be written
   * @param options - Optional extraction options
   * @returns Promise that resolves when extraction is complete
   */
  async extractEntryToFile(
    entry: ZipEntry,
    outputPath: string,
    options?: {
      skipHashCheck?: boolean;
      onProgress?: (bytes: number) => void;
    }
  ): Promise<void> {
    return this.extractToFile(entry, outputPath, options);
  }

  /**
   * Extract file to Buffer (in-memory) for file-based ZIP
   * 
   * This method extracts a ZIP entry directly to a Buffer without writing to disk.
   * This is ideal for reading metadata files (like NZIP.TOKEN) that don't need
   * to be written to temporary files.
   * 
   * @param entry - ZIP entry to extract
   * @param options - Optional extraction options:
   *   - skipHashCheck: Skip hash verification (default: false)
   *   - onProgress: Callback function receiving bytes extracted as parameter
   * @returns Promise that resolves to Buffer containing the extracted file data
   * @throws Error if not a File-based ZIP or if extraction fails
   */
  async extractToBuffer(
    entry: ZipEntry,
    options?: {
      skipHashCheck?: boolean;
      onProgress?: (bytes: number) => void;
    }
  ): Promise<Buffer> {
    return this.getZipDecompressNode().extractToBuffer(entry, options);
  }

  /**
   * Get comprehensive archive statistics
   * 
   * Calculates statistics about the loaded ZIP archive including file counts,
   * sizes, compression ratios, and file system metadata.
   * 
   * @param archivePath - Optional path to archive file (if not already loaded)
   * @returns Promise that resolves to ArchiveStatistics object
   * @throws Error if archive is not loaded and archivePath is not provided
   * 
   * @example
   * ```typescript
   * const zipkit = new ZipkitNode();
   * await zipkit.loadZipFile('archive.zip');
   * const stats = await zipkit.getArchiveStatistics();
   * console.log(`Total files: ${stats.totalFiles}`);
   * console.log(`Compression ratio: ${stats.compressionRatio.toFixed(2)}%`);
   * ```
   */
  async getArchiveStatistics(archivePath?: string): Promise<import('../types').ArchiveStatistics> {
    // Load archive if path provided and not already loaded
    if (archivePath && !this.filePath) {
      await this.loadZipFile(archivePath);
    }
    
    if (!this.filePath) {
      throw new Error('Archive not loaded. Call loadZipFile() first or provide archivePath parameter.');
    }
    
    // Get file system stats
    const stats = await fs.promises.stat(this.filePath);
    
    // Get entries
    const entries = this.getDirectory();
    
    // Calculate statistics
    const totalFiles = entries.filter((e) => !e.isDirectory).length;
    const totalFolders = entries.filter((e) => e.isDirectory).length;
    const uncompressedSize = entries.reduce((sum, e) => sum + e.uncompressedSize, 0);
    const compressedSize = entries.reduce((sum, e) => sum + e.compressedSize, 0);
    
    // Calculate compression ratios
    const compressionRatio = uncompressedSize > 0 
      ? ((1 - compressedSize / uncompressedSize) * 100) 
      : 0;
    
    // Calculate average compression ratio per file
    const averageCompressionRatio = totalFiles > 0
      ? entries
          .filter((e) => !e.isDirectory && e.uncompressedSize > 0)
          .reduce((sum, e) => {
            const fileRatio = (1 - e.compressedSize / e.uncompressedSize) * 100;
            return sum + fileRatio;
          }, 0) / totalFiles
      : 0;
    
    return {
      fileSize: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      totalFiles,
      totalFolders,
      uncompressedSize,
      compressedSize,
      compressionRatio,
      averageCompressionRatio
    };
  }

  /**
   * Test entry integrity without extracting to disk
   * Validates CRC-32 or SHA-256 hash without writing decompressed data
   * 
   * This method processes chunks as they are decompressed and validates them,
   * but discards the decompressed data instead of writing to disk. This is useful
   * for verifying ZIP file integrity without extracting files.
   * 
   * @param entry - ZIP entry to test
   * @param options - Optional test options:
   *   - skipHashCheck: Skip hash verification (default: false)
   *   - onProgress: Callback function receiving bytes processed as parameter
   * @returns Promise that resolves to an object containing the verified hash (if SHA-256) or undefined
   * @throws Error if validation fails (INVALID_CRC or INVALID_SHA256) or if not a File-based ZIP
   */
  async testEntry(
    entry: ZipEntry,
    options?: {
      skipHashCheck?: boolean;
      onProgress?: (bytes: number) => void;
    }
  ): Promise<{ verifiedHash?: string }> {
    return this.getZipDecompressNode().testEntry(entry, options);
  }

  // ============================================================================
  // File-Based Compression Methods (ZipCompressNode wrappers)
  // ============================================================================

  /**
   * Compress data for a ZIP entry (Buffer-based)
   * Override to use ZipCompressNode instead of ZipCompress
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
    return this.getZipCompressNode().compressData(entry, data, options, onOutputBuffer);
  }

  /**
   * Compress a file from disk
   * Wrapper for ZipCompressNode.compressFile()
   * 
   * @param filePath - Path to the file to compress
   * @param entry - ZIP entry to compress (filename should already be set)
   * @param options - Optional compression options
   * @returns Promise resolving to Buffer containing compressed data
   */
  async compressFile(
    filePath: string,
    entry: ZipEntry,
    options?: CompressOptions
  ): Promise<Buffer> {
    return this.getZipCompressNode().compressFile(filePath, entry, options);
  }

  /**
   * Compress a file from disk using streaming for large files
   * Wrapper for ZipCompressNode.compressFileStream()
   * 
   * @param filePath - Path to the file to compress
   * @param entry - ZIP entry to compress (filename should already be set)
   * @param options - Optional compression options
   * @param onOutputBuffer - Optional callback for streaming output
   * @returns Promise resolving to Buffer containing compressed data
   */
  async compressFileStream(
    filePath: string,
    entry: ZipEntry,
    options?: CompressOptions,
    onOutputBuffer?: (data: Buffer) => Promise<void>
  ): Promise<Buffer> {
    return this.getZipCompressNode().compressFileStream(filePath, entry, options, onOutputBuffer);
  }

  /**
   * Extract all entries from ZIP to a directory
   * 
   * @param outputDir - Directory where files should be extracted
   * @param options - Optional extraction options:
   *   - skipHashCheck: Skip hash verification (default: false)
   *   - onProgress: Callback function receiving (entry, bytes) as parameters
   *   - preservePaths: Preserve directory structure (default: true)
   * @returns Promise that resolves when all extractions are complete
   * @throws Error if not a File-based ZIP
   */
  async extractAll(
    outputDir: string,
    options?: {
      skipHashCheck?: boolean;
      onProgress?: (entry: ZipEntry, bytes: number) => void;
      preservePaths?: boolean;
    }
  ): Promise<void> {
    const entries = this.zipEntries;
    const preservePaths = options?.preservePaths !== false;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const entry of entries) {
      if (!entry.filename) continue;

      // Determine output path
      let outputPath: string;
      if (preservePaths) {
        // Preserve directory structure
        outputPath = path.join(outputDir, entry.filename);
        // Create parent directories if needed
        const parentDir = path.dirname(outputPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
      } else {
        // Extract to flat structure (filename only)
        const filename = path.basename(entry.filename);
        outputPath = path.join(outputDir, filename);
      }

      // Extract entry
      await this.extractToFile(entry, outputPath, {
        skipHashCheck: options?.skipHashCheck,
        onProgress: options?.onProgress ? (bytes: number) => options.onProgress!(entry, bytes) : undefined
      });
    }
  }

  // ============================================================================
  // ZIP File Creation Subfunctions
  // ============================================================================

  /**
   * Initialize ZIP file for writing
   * Creates output file with seek capability and returns writer object
   * 
   * @param outputPath - Path where the ZIP file should be created
   * @returns Promise resolving to ZipFileWriter object
   */
  async initializeZipFile(outputPath: string): Promise<ZipFileWriter> {
    // Ensure parent directory exists
    const parentDir = path.dirname(outputPath);
    if (parentDir && parentDir !== '.' && !fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Open file for writing with seek capability
    const outputFd = fs.openSync(outputPath, 'w+');
    const outputStream = fs.createWriteStream(outputPath);

    return {
      outputFd,
      outputStream,
      currentPosition: 0,
      entryPositions: new Map<string, number>()
    };
  }

  /**
   * Prepare ZipEntry from file path
   * Validates file exists and creates entry with metadata from file stats
   * 
   * @param filePath - Path to the file
   * @param entryName - Optional entry name (defaults to basename)
   * @returns Promise resolving to ZipEntry ready for compression
   */
  async prepareEntryFromFile(filePath: string, entryName?: string): Promise<ZipEntry> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    // Use provided entry name or default to basename
    const name = entryName || path.basename(filePath);
    const entry = this.createZipEntry(name);
    
    // Set entry metadata from file stats
    entry.uncompressedSize = stats.size;
    entry.timeDateDOS = entry.setDateTime(stats.mtime);
    entry.lastModTimeDate = entry.timeDateDOS;

    return entry;
  }

  /**
   * Write a ZIP entry to the file
   * Handles sequential write: header (placeholder) → compress → data → update header
   * 
   * @param writer - ZipFileWriter object
   * @param entry - ZipEntry to write
   * @param filePath - Path to source file
   * @param options - Optional compression options
   * @param callbacks - Optional callbacks for progress and hash calculation
   * @returns Promise that resolves when entry is written
   */
  async writeZipEntry(
    writer: ZipFileWriter,
    entry: ZipEntry,
    filePath: string,
    options?: CompressOptions,
    callbacks?: {
      onProgress?: (entry: ZipEntry, bytes: number) => void;
      onHashCalculated?: (entry: ZipEntry, hash: Buffer) => void;
    }
  ): Promise<void> {
    // Set compression method based on options
    const level = options?.level ?? 6;
    if (level === 0) {
      entry.cmpMethod = 0; // STORED
    } else if (options?.useZstd !== false) {
      entry.cmpMethod = 93; // ZSTD
    } else {
      entry.cmpMethod = 8; // DEFLATED
    }

    // Step 1: Create local header with placeholder compressed size (0)
    entry.compressedSize = 0; // Placeholder - will be updated after compression
    entry.localHdrOffset = writer.currentPosition;
    const localHeader = entry.createLocalHdr();

    // Step 2: Write local header to file
    await new Promise<void>((resolve, reject) => {
      writer.outputStream.write(localHeader, (error) => {
        if (error) {
          reject(error);
        } else {
          writer.currentPosition += localHeader.length;
          writer.entryPositions.set(entry.filename || '', entry.localHdrOffset);
          resolve();
        }
      });
    });

    // Step 3: Compress file and write data
    const bufferSize = options?.bufferSize || this.getBufferSize();
    const useZstd = options?.useZstd !== false;
    const shouldUseChunked = !useZstd && entry.uncompressedSize && entry.uncompressedSize > bufferSize;

    if (shouldUseChunked) {
      // Use streaming compression for large files
      // Data is written directly via onOutputBuffer callback
      const onOutputBuffer = async (data: Buffer) => {
        await new Promise<void>((resolve, reject) => {
          writer.outputStream.write(data, (error) => {
            if (error) {
              reject(error);
            } else {
              writer.currentPosition += data.length;
              if (callbacks?.onProgress) {
                callbacks.onProgress(entry, data.length);
              }
              resolve();
            }
          });
        });
      };

      // compressFileStream will set entry.compressedSize and entry.crc
      await this.compressFileStream(filePath, entry, options, onOutputBuffer);
    } else {
      // Use regular buffer compression for small files
      // compressFile will set entry.compressedSize and entry.crc
      const compressedData = await this.compressFile(filePath, entry, options);
      
      // Write compressed data to file
      await new Promise<void>((resolve, reject) => {
        writer.outputStream.write(compressedData, (error) => {
          if (error) {
            reject(error);
          } else {
            writer.currentPosition += compressedData.length;
            if (callbacks?.onProgress) {
              callbacks.onProgress(entry, compressedData.length);
            }
            resolve();
          }
        });
      });
    }

    // Step 4: Update compressed size and CRC in local header
    // entry.compressedSize and entry.crc are set by compression methods
    if (entry.compressedSize === undefined) {
      throw new Error(`Compressed size not set for entry: ${entry.filename}`);
    }

    const compressedSizeOffset = entry.localHdrOffset + 18;
    const sizeBuffer = Buffer.alloc(4);
    sizeBuffer.writeUInt32LE(entry.compressedSize, 0);
    fs.writeSync(writer.outputFd, sizeBuffer, 0, 4, compressedSizeOffset);

    if (entry.crc !== undefined) {
      const crcOffset = entry.localHdrOffset + 14;
      const crcBuffer = Buffer.alloc(4);
      crcBuffer.writeUInt32LE(entry.crc, 0);
      fs.writeSync(writer.outputFd, crcBuffer, 0, 4, crcOffset);
    }

    // Call hash callback if provided
    if (callbacks?.onHashCalculated && entry.sha256) {
      const hashBuffer = Buffer.from(entry.sha256, 'hex');
      callbacks.onHashCalculated(entry, hashBuffer);
    }
  }

  /**
   * Write central directory entries to ZIP file
   * 
   * @param writer - ZipFileWriter object
   * @param entries - Array of ZipEntry objects
   * @param options - Optional options for archive comment and progress
   * @returns Promise resolving to central directory size in bytes
   */
  async writeCentralDirectory(
    writer: ZipFileWriter,
    entries: ZipEntry[],
    options?: {
      archiveComment?: string;
      onProgress?: (entry: ZipEntry) => void;
    }
  ): Promise<number> {
    const centralDirStart = writer.currentPosition;

    // Update entry local header offsets from tracked positions
    for (const entry of entries) {
      const actualPosition = writer.entryPositions.get(entry.filename || '');
      if (actualPosition !== undefined) {
        entry.localHdrOffset = actualPosition;
      }
    }

    // Write central directory entries
    for (const entry of entries) {
      const centralDirEntry = entry.centralDirEntry();
      
      await new Promise<void>((resolve, reject) => {
        writer.outputStream.write(centralDirEntry, (error) => {
          if (error) {
            reject(error);
          } else {
            writer.currentPosition += centralDirEntry.length;
            if (options?.onProgress) {
              options.onProgress(entry);
            }
            resolve();
          }
        });
      });
    }

    return writer.currentPosition - centralDirStart;
  }

  /**
   * Write End of Central Directory record
   * 
   * @param writer - ZipFileWriter object
   * @param totalEntries - Total number of entries in ZIP
   * @param centralDirSize - Size of central directory in bytes
   * @param centralDirOffset - Offset to start of central directory
   * @param archiveComment - Optional archive comment (max 65535 bytes)
   * @returns Promise that resolves when EOCD is written
   */
  async writeEndOfCentralDirectory(
    writer: ZipFileWriter,
    totalEntries: number,
    centralDirSize: number,
    centralDirOffset: number,
    archiveComment?: string
  ): Promise<void> {
    const comment = archiveComment || '';
    const commentBytes = Buffer.from(comment, 'utf8');
    const commentLength = Math.min(commentBytes.length, 0xFFFF); // Max 65535 bytes

    const buffer = Buffer.alloc(22 + commentLength);
    let offset = 0;

    // End of central directory signature (4 bytes)
    buffer.writeUInt32LE(0x06054b50, offset);
    offset += 4;

    // Number of this disk (2 bytes)
    buffer.writeUInt16LE(0, offset);
    offset += 2;

    // Number of the disk with the start of the central directory (2 bytes)
    buffer.writeUInt16LE(0, offset);
    offset += 2;

    // Total number of entries in the central directory on this disk (2 bytes)
    buffer.writeUInt16LE(totalEntries, offset);
    offset += 2;

    // Total number of entries in the central directory (2 bytes)
    buffer.writeUInt16LE(totalEntries, offset);
    offset += 2;

    // Size of the central directory (4 bytes)
    buffer.writeUInt32LE(centralDirSize, offset);
    offset += 4;

    // Offset of start of central directory with respect to the starting disk number (4 bytes)
    buffer.writeUInt32LE(centralDirOffset, offset);
    offset += 4;

    // ZIP file comment length (2 bytes)
    buffer.writeUInt16LE(commentLength, offset);
    offset += 2;

    // ZIP file comment (variable length)
    if (commentLength > 0) {
      commentBytes.copy(buffer, offset, 0, commentLength);
    }

    // Write EOCD to file
    await new Promise<void>((resolve, reject) => {
      writer.outputStream.write(buffer, (error) => {
        if (error) {
          reject(error);
        } else {
          writer.currentPosition += buffer.length;
          resolve();
        }
      });
    });
  }

  /**
   * Finalize ZIP file by closing handles
   * 
   * @param writer - ZipFileWriter object
   * @returns Promise that resolves when file is closed
   */
  async finalizeZipFile(writer: ZipFileWriter): Promise<void> {
    // Close file descriptor
    fs.closeSync(writer.outputFd);

    // Close write stream
    return new Promise<void>((resolve, reject) => {
      writer.outputStream.end((error: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  // ============================================================================
  // File Creation Methods
  // ============================================================================

  /**
   * Create a ZIP file from multiple file paths
   * Simple API that uses the modular subfunctions
   * 
   * @param filePaths - Array of file paths to add to ZIP
   * @param outputPath - Path where the ZIP file should be created
   * @param options - Optional compression options
   * @returns Promise that resolves when ZIP creation is complete
   */
  async createZipFromFiles(
    filePaths: string[],
    outputPath: string,
    options?: CompressOptions
  ): Promise<void> {
    // Initialize ZIP file
    const writer = await this.initializeZipFile(outputPath);

    try {
      // Process each file
      for (const filePath of filePaths) {
        // Validate and create entry
        const entry = await this.prepareEntryFromFile(filePath);
        
        // Write entry to ZIP
        await this.writeZipEntry(writer, entry, filePath, options);
      }

      // Write central directory
      const entries = this.getDirectory();
      const centralDirOffset = writer.currentPosition;
      const centralDirSize = await this.writeCentralDirectory(writer, entries);

      // Write EOCD
      await this.writeEndOfCentralDirectory(
        writer,
        entries.length,
        centralDirSize,
        centralDirOffset
      );
    } finally {
      await this.finalizeZipFile(writer);
    }
  }

  /**
   * Add a file to the current ZIP
   * 
   * @param filePath - Path to the file to add
   * @param entryName - Name to use in ZIP (defaults to filename)
   * @param options - Optional compression options
   * @returns Promise resolving to the created ZipEntry
   */
  async addFileToZip(
    filePath: string,
    entryName?: string,
    options?: CompressOptions
  ): Promise<ZipEntry> {
    // Use provided entry name or derive from file path
    const name = entryName || path.basename(filePath);
    const entry = this.createZipEntry(name);

    // Use ZipCompressNode.compressFile() which handles file I/O and compression
    await this.getZipCompressNode().compressFile(filePath, entry, options);

    // Add to entries
    this.zipEntries.push(entry);

    return entry;
  }

  // ============================================================================
  // File Management Methods
  // ============================================================================

  /**
   * Get underlying file handle for advanced operations
   * 
   * @returns StreamingFileHandle if file is loaded
   * @throws Error if file handle not available
   */
  getFileHandle(): StreamingFileHandle {
    if (!this.fileHandle) {
      throw new Error('File handle not available');
    }
    return this.fileHandle;
  }

  /**
   * Close file handle explicitly
   * 
   * @returns Promise that resolves when file is closed
   */
  async closeFile(): Promise<void> {
    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
    }
  }

  /**
   * Copy entry from another ZIP (compatibility method)
   * Reads the local header and compressed data from the file and returns it as a Buffer
   * This is used when updating an existing ZIP file to copy unchanged entries
   * 
   * @param entry - ZIP entry to copy
   * @returns Promise resolving to Buffer containing local header + compressed data
   * @throws Error if file handle not available
   */
  async copyEntry(entry: ZipEntry): Promise<Buffer> {
    if (!this.fileHandle) {
      throw new Error('File handle not available');
    }
    
    // Read local file header (30 bytes)
    const localHeaderBuffer = Buffer.alloc(LOCAL_HDR.SIZE);
    await this.fileHandle.read(localHeaderBuffer, 0, LOCAL_HDR.SIZE, entry.localHdrOffset);
    
    // Verify signature
    if (localHeaderBuffer.readUInt32LE(0) !== LOCAL_HDR.SIGNATURE) {
      throw new Error(Errors.INVALID_CEN);
    }
    
    // Extract header information
    const filenameLength = localHeaderBuffer.readUInt16LE(LOCAL_HDR.FNAME_LEN);
    const extraFieldLength = localHeaderBuffer.readUInt16LE(LOCAL_HDR.EXTRA_LEN);
    const bitFlags = localHeaderBuffer.readUInt16LE(LOCAL_HDR.FLAGS);
    
    // Check for encryption header
    let encryptionHeaderLength = 0;
    if (bitFlags & GP_FLAG.ENCRYPTED) {
      encryptionHeaderLength = ENCRYPT_HDR_SIZE;
    }
    
    // Calculate sizes
    const localHeaderSize = LOCAL_HDR.SIZE + filenameLength + extraFieldLength;
    const totalLocalEntrySize = localHeaderSize + encryptionHeaderLength + entry.compressedSize;
    
    // Read the entire local entry (header + filename + extra field + encryption header + compressed data)
    const entryBuffer = Buffer.alloc(totalLocalEntrySize);
    await this.fileHandle.read(entryBuffer, 0, totalLocalEntrySize, entry.localHdrOffset);
    
    return entryBuffer;
  }

  // ============================================================================
  // File Update Methods
  // ============================================================================

  /**
   * Update existing ZIP file
   * 
   * This is a placeholder for future implementation.
   * Full implementation would require:
   * - Reading existing ZIP structure
   * - Identifying entries to update/add/remove
   * - Writing updated ZIP file
   * 
   * @param zipPath - Path to the ZIP file to update
   * @param updates - Update operations (add, update, remove entries)
   * @returns Promise that resolves when update is complete
   */
  async updateZipFile(
    zipPath: string,
    updates: {
      add?: Array<{ filePath: string; entryName?: string; options?: CompressOptions }>;
      update?: Array<{ entryName: string; filePath: string; options?: CompressOptions }>;
      remove?: string[]; // Entry names to remove
    }
  ): Promise<void> {
    // Placeholder for future implementation
    // This would require significant ZIP file manipulation logic
    throw new Error('updateZipFile() - Full implementation pending. Use neozip CLI for now.');
  }

  // ============================================================================
  // File-based ZIP Loading Methods (merged from ZipLoadEntriesServer)
  // ============================================================================

  /**
   * Open file handle for streaming mode
   */
  private async openFileHandle(filePath: string): Promise<StreamingFileHandle> {
    const handle = await fs.promises.open(filePath, 'r');
    
    return {
      async read(buffer: Buffer, offset: number, length: number, position: number): Promise<number> {
        const result = await handle.read(buffer, offset, length, position);
        return result.bytesRead;
      },
      async stat(): Promise<{ size: number }> {
        const stats = await handle.stat();
        return { size: stats.size };
      },
      async close(): Promise<void> {
        await handle.close();
      }
    };
  }

  /**
   * Load End of Central Directory (EOCD) in streaming mode
   */
  private async loadEOCD(): Promise<void> {
    if (!this.fileHandle) {
      throw new Error('File handle not available');
    }
    
    // Read potential EOCD area (last 65KB + 22 bytes)
    const searchSize = Math.min(0xFFFF + 22, this.fileSize);
    const searchStart = this.fileSize - searchSize;
    const buffer = Buffer.alloc(searchSize);
    
    try {
      await this.fileHandle.read(buffer, 0, searchSize, searchStart);
      
      // Find EOCD signature
      let eocdOffset = -1;
      for (let i = buffer.length - 22; i >= 0; i--) {
        if (buffer[i] === 0x50) { // Quick 'P' check
          if (buffer.readUInt32LE(i) === CENTRAL_END.SIGNATURE) {
            eocdOffset = searchStart + i;
            break;
          }
        }
      }
      
      if (eocdOffset === -1) {
        throw new Error(Errors.INVALID_FORMAT);
      }
      
      // Parse EOCD
      const eocdBuffer = Buffer.alloc(22);
      await this.fileHandle.read(eocdBuffer, 0, 22, eocdOffset);
      
      if (eocdBuffer.readUInt32LE(0) === CENTRAL_END.SIGNATURE) {
        // Standard ZIP format
        const zipkit = this as any;
        zipkit.centralDirSize = eocdBuffer.readUInt32LE(CENTRAL_END.CENTRAL_DIR_SIZE);
        zipkit.centralDirOffset = eocdBuffer.readUInt32LE(CENTRAL_END.CENTRAL_DIR_OFFSET);
        
        // Handle ZIP64
        if (zipkit.centralDirOffset === 0xFFFFFFFF) {
          await this.loadZIP64EOCD(eocdOffset);
        }
      } else {
        throw new Error(Errors.INVALID_FORMAT);
      }
      
      // Load ZIP comment
      const commentLength = eocdBuffer.readUInt16LE(CENTRAL_END.ZIP_COMMENT_LEN);
      if (commentLength > 0) {
        const commentBuffer = Buffer.alloc(commentLength);
        await this.fileHandle.read(commentBuffer, 0, commentLength, eocdOffset + 22);
        const zipkitAny = this as any;
        zipkitAny.zipComment = commentBuffer.toString();
      }
    } finally {
      // Clean up search buffer to help GC (can be up to 65KB)
      // Note: Buffer will be GC'd when it goes out of scope, but explicit cleanup helps
    }
  }

  /**
   * Load ZIP64 End of Central Directory
   */
  private async loadZIP64EOCD(eocdOffset: number): Promise<void> {
    if (!this.fileHandle) {
      throw new Error('File handle not available');
    }
    
    // Look for ZIP64 locator
    const locatorOffset = eocdOffset - 20;
    const locatorBuffer = Buffer.alloc(20);
    await this.fileHandle.read(locatorBuffer, 0, 20, locatorOffset);
    
    if (locatorBuffer.readUInt32LE(0) === ZIP64_CENTRAL_END.SIGNATURE) {
      // Read ZIP64 EOCD
      const zip64Offset = locatorBuffer.readBigUInt64LE(8);
      const zip64Buffer = Buffer.alloc(56);
      await this.fileHandle.read(zip64Buffer, 0, 56, Number(zip64Offset));
      
      const zipkit = this as any;
      zipkit.centralDirSize = Number(zip64Buffer.readBigUInt64LE(ZIP64_CENTRAL_DIR.CENTRAL_DIR_SIZE));
      zipkit.centralDirOffset = Number(zip64Buffer.readBigUInt64LE(ZIP64_CENTRAL_DIR.CENTRAL_DIR_OFFSET));
    }
  }

  /**
   * Reset file-based ZIP data to initial state
   */
  private resetFileData(): void {
    this.fileHandle = null;
    this.filePath = null;
    this.fileSize = 0;
    // Note: centralDirSize and centralDirOffset are reset in base class resetZipData()
    const zipkit = this as any;
    zipkit.centralDirSize = 0;
    zipkit.centralDirOffset = 0;
  }

  // ============================================================================
  // ZIP File Extraction Subfunctions
  // ============================================================================

  /**
   * Filter ZIP entries based on include/exclude patterns
   * 
   * @param entries - Array of ZipEntry objects to filter
   * @param options - Optional filtering options
   * @returns Filtered array of ZipEntry objects
   */
  filterEntries(
    entries: ZipEntry[],
    options?: {
      include?: string[];
      exclude?: string[];
      skipMetadata?: boolean; // Skip META-INF/* files (default: true)
    }
  ): ZipEntry[] {
    const skipMetadata = options?.skipMetadata !== false;
    
    return entries.filter(entry => {
      const filename = entry.filename || '';
      
      // Skip metadata files if requested
      if (skipMetadata && (filename.startsWith('META-INF/') || filename === 'META-INF')) {
        return false;
      }
      
      // Skip directories
      if (entry.isDirectory) {
        return false;
      }
      
      // If no filtering patterns, include all
      if (!options?.include && !options?.exclude) {
        return true;
      }
      
      const fileName = path.basename(filename);
      const relativePath = path.relative(process.cwd(), filename);
      
      // Check include patterns first (if any)
      if (options.include && options.include.length > 0) {
        const matchesInclude = options.include.some(pattern => 
          minimatch(fileName, pattern) || minimatch(relativePath, pattern) || minimatch(filename, pattern)
        );
        if (!matchesInclude) {
          return false;
        }
      }
      
      // Check exclude patterns
      if (options.exclude && options.exclude.length > 0) {
        const matchesExclude = options.exclude.some(pattern => 
          minimatch(fileName, pattern) || minimatch(relativePath, pattern) || minimatch(filename, pattern)
        );
        if (matchesExclude) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * Prepare extraction path for a ZIP entry
   * 
   * @param entry - ZipEntry to extract
   * @param destination - Destination directory
   * @param options - Optional path options
   * @returns Absolute output path for the entry
   */
  prepareExtractionPath(
    entry: ZipEntry,
    destination: string,
    options?: {
      junkPaths?: boolean; // Extract to flat structure (default: false)
    }
  ): string {
    const filename = entry.filename || '';
    
    // Determine output path
    let outputPath: string;
    if (options?.junkPaths) {
      // Extract to flat structure (filename only)
      outputPath = path.join(destination, path.basename(filename));
    } else {
      // Preserve directory structure
      outputPath = path.join(destination, filename);
    }
    
    // Ensure parent directory exists
    const parentDir = path.dirname(outputPath);
    if (parentDir && parentDir !== '.' && !fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    
    return path.resolve(outputPath);
  }

  /**
   * Extract timestamps from ZIP entry
   * 
   * @param entry - ZipEntry to extract timestamps from
   * @returns Object with mtime, atime, ctime (Date objects or null)
   */
  extractEntryTimestamps(entry: ZipEntry): { mtime: Date | null; atime: Date | null; ctime: Date | null } {
    let mtime: Date | null = null;
    let atime: Date | null = null;
    let ctime: Date | null = null;

    // Try extended timestamps first (most accurate)
    if ((entry as any).ntfsTime) {
      const ntfs = (entry as any).ntfsTime;
      if (ntfs.mtime) mtime = new Date(ntfs.mtime);
      if (ntfs.atime) atime = new Date(ntfs.atime);
      if (ntfs.ctime) ctime = new Date(ntfs.ctime);
    } else if ((entry as any).extendedTime) {
      const ext = (entry as any).extendedTime;
      if (ext.mtime) mtime = new Date(ext.mtime);
      if (ext.atime) atime = new Date(ext.atime);
      if (ext.ctime) ctime = new Date(ext.ctime);
    }

    // Fall back to standard timestamps if extended not available
    if (!mtime) {
      if ((entry as any).parseDateTime && entry.lastModTimeDate) {
        // Use the parseDateTime method if available
        const parsedDate = (entry as any).parseDateTime(entry.lastModTimeDate);
        mtime = parsedDate ? new Date(parsedDate) : null;
      } else if (entry.lastModTimeDate) {
        mtime = new Date(entry.lastModTimeDate);
      } else if (entry.timeDateDOS) {
        // timeDateDOS is in seconds since 1970, convert to milliseconds
        mtime = new Date(entry.timeDateDOS * 1000);
      }
    }

    return { mtime, atime, ctime };
  }

  /**
   * Determine if an entry should be extracted based on overwrite logic
   * 
   * @param entry - ZipEntry to check
   * @param outputPath - Path where file would be extracted
   * @param options - Optional overwrite options
   * @returns Promise resolving to decision object
   */
  async shouldExtractEntry(
    entry: ZipEntry,
    outputPath: string,
    options?: {
      overwrite?: boolean; // Always overwrite (default: false)
      never?: boolean; // Never overwrite (default: false)
      freshenOnly?: boolean; // Only extract if newer (default: false)
      updateOnly?: boolean; // Only extract if newer or doesn't exist (default: false)
      onOverwritePrompt?: (filename: string) => Promise<'y' | 'n' | 'a' | 'q'>; // Interactive prompt callback
    }
  ): Promise<{ shouldExtract: boolean; reason?: string }> {
    const fileExists = fs.existsSync(outputPath);
    
    // If file doesn't exist, always extract (unless freshenOnly mode)
    if (!fileExists) {
      if (options?.freshenOnly) {
        return { shouldExtract: false, reason: 'not in destination' };
      }
      // For updateOnly or normal mode, extract new files
      return { shouldExtract: true };
    }
    
    // File exists - apply overwrite logic
    if (options?.never) {
      return { shouldExtract: false, reason: 'never overwrite' };
    }
    
    if (options?.overwrite) {
      return { shouldExtract: true };
    }
    
    if (options?.freshenOnly || options?.updateOnly) {
      // Compare timestamps to determine if archive file is newer
      const existingStats = fs.statSync(outputPath);
      const timestamps = this.extractEntryTimestamps(entry);
      const archiveDate = timestamps.mtime || new Date(0);
      
      if (archiveDate <= existingStats.mtime) {
        return { shouldExtract: false, reason: 'not newer' };
      }
      
      // File in archive is newer, proceed with extraction
      return { shouldExtract: true };
    }
    
    // Interactive mode - use callback if provided
    if (options?.onOverwritePrompt) {
      const response = await options.onOverwritePrompt(entry.filename || '');
      if (response === 'n') {
        return { shouldExtract: false, reason: 'user declined' };
      } else if (response === 'q') {
        return { shouldExtract: false, reason: 'user aborted' };
      } else if (response === 'y' || response === 'a') {
        return { shouldExtract: true };
      }
    }
    
    // Default: skip if exists and no overwrite option
    return { shouldExtract: false, reason: 'file exists' };
  }

  /**
   * Restore entry metadata (timestamps and permissions) to extracted file
   * 
   * @param filePath - Path to the extracted file
   * @param entry - ZipEntry that was extracted
   * @param options - Optional metadata options
   */
  restoreEntryMetadata(
    filePath: string,
    entry: ZipEntry,
    options?: {
      preserveTimestamps?: boolean; // Restore file timestamps (default: true)
      preservePermissions?: boolean; // Restore file permissions (default: false)
    }
  ): void {
    const preserveTimestamps = options?.preserveTimestamps !== false;
    const preservePermissions = options?.preservePermissions === true;
    
    // Restore timestamps
    if (preserveTimestamps) {
      try {
        const timestamps = this.extractEntryTimestamps(entry);
        
        if (timestamps.mtime && timestamps.atime) {
          fs.utimesSync(filePath, timestamps.atime, timestamps.mtime);
        } else if (timestamps.mtime) {
          // If we only have modification time, use it for both
          fs.utimesSync(filePath, timestamps.mtime, timestamps.mtime);
        }
      } catch (error) {
        // Don't fail extraction if timestamp restoration fails
        // Some filesystems don't support timestamp modification
      }
    }
    
    // Restore permissions (Unix only)
    if (preservePermissions && process.platform !== 'win32') {
      try {
        // Restore UID/GID if available
        if ((entry as any).uid !== null && (entry as any).uid !== undefined &&
            (entry as any).gid !== null && (entry as any).gid !== undefined) {
          // Only root can change ownership to different users
          if (process.getuid && process.getuid() === 0) {
            // Running as root - can change both UID and GID
            fs.chownSync(filePath, (entry as any).uid, (entry as any).gid);
          } else {
            // Not running as root - try to change group only if we're a member
            try {
              fs.chownSync(filePath, -1, (entry as any).gid); // -1 means don't change UID
            } catch (error) {
              // Ignore errors - insufficient privileges
            }
          }
        }
        
        // Restore file mode if available
        if (entry.extFileAttr) {
          // Extract permission bits from external file attributes
          const permissions = (entry.extFileAttr >>> 16) & 0o777;
          if (permissions > 0) {
            fs.chmodSync(filePath, permissions);
          }
        }
      } catch (error) {
        // Don't fail extraction if permission restoration fails
      }
    }
  }

  /**
   * Extract a single entry to a file path
   * Handles symlinks, hardlinks, timestamps, and permissions
   * 
   * @param entry - ZipEntry to extract
   * @param outputPath - Path where file should be extracted
   * @param options - Optional extraction options
   * @returns Promise resolving to extraction result
   */
  async extractEntryToPath(
    entry: ZipEntry,
    outputPath: string,
    options?: {
      skipHashCheck?: boolean; // Skip hash verification (default: false)
      preserveTimestamps?: boolean; // Restore file timestamps (default: true)
      preservePermissions?: boolean; // Restore file permissions (default: false)
      symlinks?: boolean; // Handle symbolic links (default: false)
      hardLinks?: boolean; // Handle hard links (default: false)
      onProgress?: (entry: ZipEntry, bytes: number) => void; // Progress callback
    }
  ): Promise<{ success: boolean; bytesExtracted: number; error?: string }> {
    const filename = entry.filename || '';
    
    try {
      // Check if entry is a symbolic link
      const isSymlink = (entry as any).isSymlink && (entry as any).linkTarget;
      const S_IFLNK = 0o120000;
      const fileType = entry.extFileAttr ? ((entry.extFileAttr >>> 16) & 0o170000) : 0;
      const isSymlinkByAttr = fileType === S_IFLNK;
      
      if ((isSymlink || isSymlinkByAttr) && options?.symlinks) {
        // Handle symbolic link
        let linkTarget = (entry as any).linkTarget;
        
        if (!linkTarget) {
          // Extract target from file content
          const bufferBased = !this.fileHandle;
          if (bufferBased) {
            const data = await this.extract(entry, options?.skipHashCheck);
            if (data) {
              linkTarget = data.toString('utf8');
            }
          } else {
            // For file-based, extract to temp file and read
            const tempPath = path.join(require('os').tmpdir(), `neozip-symlink-${Date.now()}-${process.pid}`);
            try {
              await this.extractToFile(entry, tempPath, {
                skipHashCheck: options?.skipHashCheck
              });
              const data = fs.readFileSync(tempPath, 'utf8');
              linkTarget = data;
              // Clean up temp file
              fs.unlinkSync(tempPath);
            } catch (error) {
              // Clean up temp file if it exists
              if (fs.existsSync(tempPath)) {
                try {
                  fs.unlinkSync(tempPath);
                } catch (cleanupError) {
                  // Ignore cleanup errors
                }
              }
              return { success: false, bytesExtracted: 0, error: `Could not extract symbolic link target: ${error instanceof Error ? error.message : String(error)}` };
            }
          }
        }
        
        if (linkTarget && process.platform !== 'win32') {
          try {
            fs.symlinkSync(linkTarget, outputPath);
            return { success: true, bytesExtracted: Buffer.byteLength(linkTarget, 'utf8') };
          } catch (error) {
            return { success: false, bytesExtracted: 0, error: `Failed to create symbolic link: ${error instanceof Error ? error.message : String(error)}` };
          }
        } else {
          return { success: false, bytesExtracted: 0, error: 'Symbolic links not supported on this platform' };
        }
      }
      
      // Check if entry is a hard link
      const isHardLink = (entry as any).isHardLink && (entry as any).originalEntry;
      
      if (isHardLink && options?.hardLinks) {
        // Handle hard link
        const originalEntry = (entry as any).originalEntry;
        const outDir = path.dirname(outputPath);
        const originalPath = path.resolve(outDir, originalEntry);
        
        if (fs.existsSync(originalPath) && process.platform !== 'win32') {
          try {
            fs.linkSync(originalPath, outputPath);
            return { success: true, bytesExtracted: 0 }; // No actual bytes extracted for hard links
          } catch (error) {
            return { success: false, bytesExtracted: 0, error: `Failed to create hard link: ${error instanceof Error ? error.message : String(error)}` };
          }
        } else {
          return { success: false, bytesExtracted: 0, error: 'Hard links not supported or original file not found' };
        }
      }
      
      // Regular file extraction
      // Check if we're in buffer-based or file-based mode
      const bufferBased = !this.fileHandle;
      const fileBased = !!this.fileHandle;
      
      // Use temp file for overwrite safety
      const fileExists = fs.existsSync(outputPath);
      const needsTempFile = fileExists;
      const tempPath = needsTempFile 
        ? path.join(require('os').tmpdir(), `neozip-extract-${Date.now()}-${process.pid}-${path.basename(outputPath).replace(/[^a-zA-Z0-9]/g, '_')}`)
        : outputPath;
      
      let bytesExtracted = 0;
      let extractionSucceeded = false;
      
      try {
        if (bufferBased) {
          // Buffer-based (in-memory) mode: extract to buffer, then write to file
          const data = await this.extract(entry, options?.skipHashCheck);
          
          if (!data) {
            return { success: false, bytesExtracted: 0, error: 'Extraction returned no data' };
          }
          
          // Write buffer to temp file
          fs.writeFileSync(tempPath, data);
          bytesExtracted = data.length;
          extractionSucceeded = true;
          
          if (options?.onProgress) {
            options.onProgress(entry, bytesExtracted);
          }
        } else if (fileBased) {
          // File-based mode: use direct streaming extraction to temp file
          await this.extractToFile(entry, tempPath, {
            skipHashCheck: options?.skipHashCheck,
            onProgress: (bytes: number) => {
              bytesExtracted = bytes;
              if (options?.onProgress) {
                options.onProgress(entry, bytes);
              }
            }
          });
          
          // If we get here, extraction succeeded
          extractionSucceeded = true;
        } else {
          return { success: false, bytesExtracted: 0, error: 'ZIP file not loaded or unknown backend type' };
        }
        
        // If extraction succeeded and we used a temp file, replace the original
        if (extractionSucceeded && needsTempFile) {
          // Delete the original file
          fs.unlinkSync(outputPath);
          // Move temp file to final location
          fs.renameSync(tempPath, outputPath);
        }
        
        // Restore metadata (timestamps and permissions)
        this.restoreEntryMetadata(outputPath, entry, {
          preserveTimestamps: options?.preserveTimestamps,
          preservePermissions: options?.preservePermissions
        });
        
        return { success: true, bytesExtracted };
      } catch (error) {
        // Clean up temp file if it exists
        if (needsTempFile && fs.existsSync(tempPath)) {
          try {
            fs.unlinkSync(tempPath);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
        }
        
        return { 
          success: false, 
          bytesExtracted: 0, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        bytesExtracted: 0, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Extract all files from a ZIP archive to a destination directory
   * Simple API that uses the modular subfunctions
   * 
   * @param archivePath - Path to the ZIP file
   * @param destination - Directory where files should be extracted (ignored if testOnly is true)
   * @param options - Optional extraction options
   * @returns Promise resolving to extraction statistics
   */
  async extractZipFile(
    archivePath: string,
    destination: string,
    options?: {
      password?: string; // Password for encrypted archives
      overwrite?: boolean; // Always overwrite existing files
      junkPaths?: boolean; // Extract to flat structure
      include?: string[]; // Include patterns
      exclude?: string[]; // Exclude patterns
      preserveTimestamps?: boolean; // Restore file timestamps
      preservePermissions?: boolean; // Restore file permissions
      symlinks?: boolean; // Handle symbolic links
      hardLinks?: boolean; // Handle hard links
      skipHashCheck?: boolean; // Skip hash verification
      testOnly?: boolean; // Test integrity without extracting files
      onProgress?: (entry: ZipEntry, bytes: number) => void; // Progress callback
      onOverwritePrompt?: (filename: string) => Promise<'y' | 'n' | 'a' | 'q'>; // Overwrite prompt callback
    }
  ): Promise<{ filesExtracted: number; bytesExtracted: number }> {
    // Ensure destination directory exists
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }
    
    // Load ZIP file if not already loaded or if path changed
    if (!this.fileHandle || this.filePath !== archivePath) {
      await this.loadZipFile(archivePath);
    }
    
    // Set password if provided (needed for decryption)
    if (options?.password) {
      (this as any).password = options.password;
    }
    
    // Get all entries
    const entries = this.getDirectory();
    
    // Filter entries
    const filteredEntries = this.filterEntries(entries, {
      include: options?.include,
      exclude: options?.exclude,
      skipMetadata: true
    });
    
    // Extract each entry
    let filesExtracted = 0;
    let bytesExtracted = 0;
    let alwaysOverwrite = false; // Track "always" response from user
    
    // If testOnly mode, validate entries without extracting
    if (options?.testOnly) {
      for (const entry of filteredEntries) {
        try {
          await this.testEntry(entry, {
            skipHashCheck: options?.skipHashCheck,
            onProgress: options?.onProgress ? (bytes: number) => options.onProgress!(entry, bytes) : undefined
          });
          // If we get here, validation passed
          filesExtracted++;
          bytesExtracted += (entry.uncompressedSize || 0);
        } catch (error) {
          // Validation failed - rethrow the error
          throw error;
        }
      }
      return { filesExtracted, bytesExtracted };
    }
    
    // Normal extraction mode
    for (const entry of filteredEntries) {
      // Prepare output path
      const outputPath = this.prepareExtractionPath(entry, destination, {
        junkPaths: options?.junkPaths
      });
      
      // Check if should extract
      const decision = await this.shouldExtractEntry(entry, outputPath, {
        overwrite: options?.overwrite || alwaysOverwrite,
        never: false,
        freshenOnly: false,
        updateOnly: false,
        onOverwritePrompt: async (filename: string) => {
          if (options?.onOverwritePrompt) {
            const response = await options.onOverwritePrompt(filename);
            if (response === 'a') {
              alwaysOverwrite = true;
            }
            return response;
          }
          return 'n'; // Default to no if no callback provided
        }
      });
      
      if (!decision.shouldExtract) {
        // Check if user aborted
        if (decision.reason === 'user aborted') {
          break; // Stop extraction
        }
        continue;
      }
      
      // Extract entry
      const result = await this.extractEntryToPath(entry, outputPath, {
        skipHashCheck: options?.skipHashCheck,
        preserveTimestamps: options?.preserveTimestamps !== false,
        preservePermissions: options?.preservePermissions,
        symlinks: options?.symlinks,
        hardLinks: options?.hardLinks,
        onProgress: options?.onProgress
      });
      
      if (result.success) {
        filesExtracted++;
        bytesExtracted += result.bytesExtracted;
      }
    }
    
    return { filesExtracted, bytesExtracted };
  }
}

