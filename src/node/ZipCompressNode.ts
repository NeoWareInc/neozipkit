// ======================================
//	ZipCompressNode.ts - Node.js File-Based Compression
//  Copyright (c) 2025 NeoWare, Inc. All rights reserved.
// ======================================
//
// LOGGING INSTRUCTIONS:
// ---------------------
// To enable/disable logging, set loggingEnabled to true/false in the class:
//   private static loggingEnabled: boolean = true;  // Enable logging
//   private static loggingEnabled: boolean = false; // Disable logging
//
// Logging respects the global Logger level (debug, info, warn, error, silent).
// Logger level is automatically set to 'debug' when loggingEnabled is true.
//

import { CompressOptions } from '../core/ZipCompress';
import ZipEntry from '../core/ZipEntry';
import ZipkitNode from './ZipkitNode';
import { Logger } from '../core/components/Logger';
import { CMP_METHOD, GP_FLAG, ENCRYPT_HDR_SIZE } from '../core/constants/Headers';
import { HashCalculator } from '../core/components/HashCalculator';
import { ZipCrypto } from '../core/encryption/ZipCrypto';
import { ZstdManager } from '../core/ZstdManager';
import Errors from '../core/constants/Errors';
import * as fs from 'fs';
import * as path from 'path';

const pako = require('pako');

// Re-export types from ZipCompress (from core module)
export type { CompressOptions } from '../core/ZipCompress';

/**
 * ZipCompressNode - Node.js file-based compression operations
 * 
 * Independent compression implementation for Node.js environments.
 * All compression logic is implemented directly without delegating to ZipCompress.
 * 
 * @example
 * ```typescript
 * const zipkitNode = new ZipkitNode();
 * const compressNode = new ZipCompressNode(zipkitNode);
 * const compressed = await compressNode.compressFile('/path/to/file.txt', entry);
 * ```
 */
export class ZipCompressNode {
  private zipkitNode: ZipkitNode;

  // Class-level logging control - set to true to enable logging
  private static loggingEnabled: boolean = false;

  /**
   * Internal logging method - only logs if class logging is enabled
   */
  private log(...args: any[]): void {
    if (ZipCompressNode.loggingEnabled) {
      Logger.debug(`[ZipCompressNode]`, ...args);
    }
  }

  /**
   * Creates a new ZipCompressNode instance
   * @param zipkitNode - ZipkitNode instance to use for ZIP operations
   */
  constructor(zipkitNode: ZipkitNode) {
    this.zipkitNode = zipkitNode;
    // If logging is enabled, ensure Logger level is set to debug
    if (ZipCompressNode.loggingEnabled) {
      Logger.setLevel('debug');
    }
  }

  // ============================================================================
  // Compression Methods
  // ============================================================================

  /**
   * Compress data for a ZIP entry (Buffer-based only)
   * @param entry - ZIP entry to compress
   * @param data - Buffer containing data to compress
   * @param options - Compression options
   * @param onOutputBuffer - Optional callback for streaming output
   * @returns Buffer containing compressed data
   */
  async compressData(entry: ZipEntry, data: Buffer, options?: CompressOptions, onOutputBuffer?: (data: Buffer) => Promise<void>): Promise<Buffer> {
    // Set uncompressed size if not already set
    if (!entry.uncompressedSize || entry.uncompressedSize === 0) {
      entry.uncompressedSize = data.length;
    }
    const totalSize = data.length;
    const bufferSize = options?.bufferSize || this.zipkitNode.getBufferSize();
    
    // Determine compression method
    let compressionMethod: number;
    
    if (options?.level === 0) {
      compressionMethod = CMP_METHOD.STORED;
    } else if (options?.useZstd) {
      // ZSTD fallback to STORED if file too small
      if (totalSize < 100) {
        compressionMethod = CMP_METHOD.STORED;
      } else {
        compressionMethod = CMP_METHOD.ZSTD;
      }
    } else {
      compressionMethod = CMP_METHOD.DEFLATED;
    }
    
    entry.cmpMethod = compressionMethod;
    
    // Initialize hash calculator
    const needsHashCalculation = (!entry.crc || entry.crc === 0) || (options?.useSHA256 && !entry.sha256);
    const hashCalculator = needsHashCalculation ? new HashCalculator({ useSHA256: options?.useSHA256 && !entry.sha256 || false }) : null;
    
    // Calculate hashes if needed
    let buffer: Buffer = Buffer.alloc(0);
    
    if (hashCalculator) {
      hashCalculator.update(data);
      if (!entry.crc || entry.crc === 0) {
        entry.crc = hashCalculator.finalizeCRC32();
      }
      if (options?.useSHA256 && !entry.sha256) {
        entry.sha256 = hashCalculator.finalizeSHA256();
      }
    }
    
    // Compress based on method
    if (compressionMethod === CMP_METHOD.STORED) {
      buffer = data;
      entry.compressedSize = data.length;
    } else if (compressionMethod === CMP_METHOD.ZSTD) {
      buffer = await this.zstdCompress(data, options, bufferSize, entry, onOutputBuffer);
    } else {
      // DEFLATED
      buffer = await this.deflateCompress(data, options, bufferSize, entry, onOutputBuffer);
    }
    
    // Only set compressed size if it hasn't been set already
    if (entry.compressedSize === undefined || entry.compressedSize === 0) {
      entry.compressedSize = buffer.length;
    }

    // Apply encryption if password is provided
    if (options?.password && buffer.length > 0) {
      buffer = this.encryptCompressedData(buffer, entry, options.password);
    }

    return buffer;
  }


  /**
   * Compresses data using deflate algorithm with chunked processing
   * @param data - Data to compress (Buffer or chunked reader)
   * @param options - Compression options
   * @param bufferSize - Size of buffer to read (default: 512KB)
   * @param entry - Optional ZIP entry for hash calculation
   * @param onOutputBuffer - Optional callback for streaming output
   * @returns Compressed data buffer
   */
  async deflateCompress(
    data: Buffer | { totalSize: number, onReadChunk: (position: number, size: number) => Buffer, onOutChunk: (chunk: Buffer) => void },
    options?: CompressOptions,
    bufferSize?: number,
    entry?: ZipEntry,
    onOutputBuffer?: (data: Buffer) => Promise<void>
  ): Promise<Buffer> {
    const effectiveBufferSize = bufferSize || options?.bufferSize || this.zipkitNode.getBufferSize();
    
    // Initialize hash calculator for incremental hash calculation during chunk reads
    const needsHashCalculation = entry && ((!entry.crc || entry.crc === 0) || (options?.useSHA256 && !entry.sha256));
    const hashCalculator = needsHashCalculation ? new HashCalculator({ useSHA256: options?.useSHA256 && !entry.sha256 || false }) : null;
    
    if (options?.level === 0) {
      // Store without compression
      if (Buffer.isBuffer(data)) {
        // For buffer, calculate hashes if needed
        if (hashCalculator && entry) {
          hashCalculator.update(data);
          if (!entry.crc || entry.crc === 0) {
            entry.crc = hashCalculator.finalizeCRC32();
          }
          if (options?.useSHA256 && !entry.sha256) {
            entry.sha256 = hashCalculator.finalizeSHA256();
          }
        }
        return data;
      } else {
        // For chunked reader, process in chunks and call onOutputBuffer
        let position = 0;
        let totalProcessed = 0;
        
        while (position < data.totalSize) {
          const readSize = Math.min(effectiveBufferSize, data.totalSize - position);
          const chunk = data.onReadChunk(position, readSize);
          
          // [READ] -> [HASH] -> [OUTPUT] sequence
          if (hashCalculator) {
            hashCalculator.update(chunk);
          }
          
          if (onOutputBuffer) {
            await onOutputBuffer(chunk);
          }
          
          totalProcessed += chunk.length;
          position += chunk.length;
        }
        
        // Finalize hashes
        if (hashCalculator && entry) {
          if (!entry.crc || entry.crc === 0) {
            entry.crc = hashCalculator.finalizeCRC32();
          }
          if (options?.useSHA256 && !entry.sha256) {
            entry.sha256 = hashCalculator.finalizeSHA256();
          }
        }
        
        return Buffer.alloc(0);
      }
    }
    
    try {
      const level = options?.level as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | undefined;
      const isBuffer = Buffer.isBuffer(data);
      const totalSize = isBuffer ? data.length : data.totalSize;
      const compressedChunks: Buffer[] = [];
      let totalProcessed = 0;
      let totalCompressedSize = 0;
      let position = 0;
      
      if (isBuffer) {
        // Buffer-based processing
        if (hashCalculator && entry) {
          hashCalculator.update(data);
          // Always set CRC if hash calculator was used (it calculated the correct CRC)
          entry.crc = hashCalculator.finalizeCRC32();
          if (options?.useSHA256 && !entry.sha256) {
            entry.sha256 = hashCalculator.finalizeSHA256();
          }
        }
        
        const result = pako.deflateRaw(data, { level: level ?? 6 });
        const compressed = Buffer.from(result.buffer, result.byteOffset, result.byteLength);
        
        if (onOutputBuffer) {
          await onOutputBuffer(compressed);
        }
        
        return compressed;
      } else {
        // Chunked reader processing - use streaming deflator to maintain state across chunks
        const deflator = new pako.Deflate({ level: level ?? 6, raw: true });
        const compressedChunks: Buffer[] = [];
        let resultOffset = 0; // Track how much of deflator.result we've already processed
        
        while (position < totalSize) {
          const readSize = Math.min(effectiveBufferSize, totalSize - position);
          const chunk = data.onReadChunk(position, readSize);
          const isLast = position + readSize >= totalSize;
          
          // [READ] -> [HASH] sequence
          if (hashCalculator) {
            hashCalculator.update(chunk);
          }
          
          // Push chunk to streaming deflator (maintains state across chunks)
          deflator.push(chunk, isLast);
          
          // Collect compressed chunks from deflator
          // deflator.result accumulates compressed data, so we need to process only new data
          if (deflator.result && deflator.result.length > resultOffset) {
            const newCompressed = Buffer.from(deflator.result.subarray(resultOffset));
            compressedChunks.push(newCompressed);
            totalCompressedSize += newCompressed.length;
            resultOffset = deflator.result.length;
            
            if (onOutputBuffer) {
              await onOutputBuffer(newCompressed);
            }
          }
          
          totalProcessed += chunk.length;
          position += chunk.length;
        }
        
        // Finalize hashes after all chunks processed and compressed
        if (hashCalculator && entry) {
          // Always set CRC if hash calculator was used (it calculated the correct CRC)
          entry.crc = hashCalculator.finalizeCRC32();
          if (options?.useSHA256 && !entry.sha256) {
            entry.sha256 = hashCalculator.finalizeSHA256();
          }
        }
        
        // For chunked processing, return empty buffer (data already written via onOutputBuffer)
        if (entry) {
          entry.compressedSize = totalCompressedSize;
        }
        return Buffer.alloc(0);
      }
    } catch (e) {
      Logger.error('Error during chunked deflate compression:', e);
      throw new Error(Errors.COMPRESSION_ERROR);
    }
  }

  /**
   * Compresses data using deflate algorithm (legacy method for small buffers)
   * @param inbuf - Data to compress
   * @param options - Compression options
   * @returns Compressed data buffer
   */
  deflate(inbuf: Buffer, options?: CompressOptions): Buffer {
    if (options?.level == 0) {
      return inbuf; // Store without compression
    }
    try {
      const level = options?.level as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | undefined;
      const result = pako.deflateRaw(inbuf, {
        level: level ?? 6
      });
      return Buffer.from(result.buffer, result.byteOffset, result.byteLength);
    } catch (e) {
      Logger.error('Error during compression:', e);
      throw new Error(Errors.COMPRESSION_ERROR);
    }
  }

  /**
   * Compresses data using Zstandard (zstd) algorithm
   * @param input - Buffer to compress OR chunked reader object with totalSize and readChunk callback
   * @param options - Compression options
   * @param bufferSize - Size of buffer to read if using chunked reader (default: 512KB)
   * @param entry - Optional ZIP entry for hash calculation
   * @param onOutputBuffer - Optional callback for streaming output
   * @returns Compressed data buffer
   */
  async zstdCompress(
    input: Buffer | { totalSize: number, readChunk: (position: number, size: number) => Buffer },
    options?: CompressOptions,
    bufferSize?: number,
    entry?: ZipEntry,
    onOutputBuffer?: (data: Buffer) => Promise<void>
  ): Promise<Buffer> {
    const effectiveBufferSize = bufferSize || options?.bufferSize || this.zipkitNode.getBufferSize();
    const isBuffer = Buffer.isBuffer(input);
    const totalSize = isBuffer ? input.length : input.totalSize;
    
    if (options?.level == 0) {
      // For store mode, return as-is
      if (isBuffer) {
        return input;
      } else {
        // Read all chunks
        const chunks: Buffer[] = [];
        let position = 0;
        while (position < totalSize) {
          const size = Math.min(effectiveBufferSize, totalSize - position);
          const chunk = input.readChunk(position, size);
          chunks.push(chunk);
          position += size;
        }
        return Buffer.concat(chunks);
      }
    }
    
    try {
      // Zstd compression levels range from 1 (fastest) to 22 (highest compression)
      // Map our 1-9 level to a reasonable zstd range (1-19)
      const level = options?.level ?? 6;
      const zstdLevel = Math.min(Math.max(1, Math.floor(level * 2.1)), 19);

      // Get the full buffer (zstd doesn't support true streaming compression)
      const inbuf = isBuffer ? input : (() => {
        const chunks: Buffer[] = [];
        let position = 0;
        while (position < totalSize) {
          const size = Math.min(effectiveBufferSize, totalSize - position);
          const chunk = input.readChunk(position, size);
          chunks.push(chunk);
          position += size;
        }
        return Buffer.concat(chunks);
      })();
      
      // Validate input
      if (!inbuf || inbuf.length === 0) {
        throw new Error('ZSTD compression: empty input buffer');
      }
      
      // Convert Buffer to Uint8Array for WASM module
      const inputArray = new Uint8Array(inbuf.buffer, inbuf.byteOffset, inbuf.byteLength);
      
      // Compress the data with zstd using global ZstdManager
      const compressedData = await ZstdManager.compress(inputArray, zstdLevel);
      const compressedBuffer = Buffer.from(compressedData);
      
      // Set the compressed size in the entry for ZIP file structure
      if (entry) {
        entry.compressedSize = compressedBuffer.length;
      }
      
      if (onOutputBuffer) {
        await onOutputBuffer(compressedBuffer);
      }
      
      return compressedBuffer;
    } catch (e) {
      Logger.error('Error during zstd compression:', e);
      throw new Error(Errors.COMPRESSION_ERROR);
    }
  }

  /**
   * Encrypt compressed data using PKZIP encryption
   * Creates encryption header, encrypts compressed data, and updates entry flags
   * @param compressedData - Compressed data to encrypt
   * @param entry - ZIP entry to encrypt
   * @param password - Password for encryption
   * @returns Encrypted buffer (encrypted header + encrypted compressed data)
   */
  private encryptCompressedData(compressedData: Buffer, entry: ZipEntry, password: string): Buffer {
    // Create ZipCrypto instance
    const zipCrypto = new ZipCrypto();
    
    // Encrypt the compressed data (includes header creation and encryption)
    const encryptedData = zipCrypto.encryptBuffer(entry, compressedData, password);
    
    // Set encryption flags on entry
    entry.isEncrypted = true;
    entry.bitFlags |= GP_FLAG.ENCRYPTED;
    
    // Update compressed size to include encryption header (12 bytes)
    entry.compressedSize = encryptedData.length;
    
    return encryptedData;
  }

  // ============================================================================
  // File-Based Compression Methods
  // ============================================================================

  /**
   * Compress a file from disk
   * 
   * Reads file from disk, sets entry metadata from file stats, and compresses the data.
   * 
   * @param filePath - Path to the file to compress
   * @param entry - ZIP entry to compress (filename should already be set)
   * @param options - Optional compression options
   * @returns Promise resolving to Buffer containing compressed data
   * @throws Error if file not found or not a file
   */
  async compressFile(
    filePath: string,
    entry: ZipEntry,
    options?: CompressOptions
  ): Promise<Buffer> {
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    // Set entry metadata from file stats
    entry.uncompressedSize = stats.size;
    entry.timeDateDOS = entry.setDateTime(stats.mtime);

    // Read file data
    const fileData = fs.readFileSync(filePath);

    // Compress the buffer using compressData (buffer-based compression)
    return await this.compressData(entry, fileData, options);
  }

  /**
   * Compress a file from disk using streaming for large files
   * 
   * Streams file in chunks for memory-efficient compression of large files.
   * All chunk reading logic is handled in this server class.
   * 
   * @param filePath - Path to the file to compress
   * @param entry - ZIP entry to compress (filename should already be set)
   * @param options - Optional compression options
   * @param onOutputBuffer - Optional callback for streaming output
   * @returns Promise resolving to Buffer containing compressed data
   * @throws Error if file not found or not a file
   */
  async compressFileStream(
    filePath: string,
    entry: ZipEntry,
    options?: CompressOptions,
    onOutputBuffer?: (data: Buffer) => Promise<void>
  ): Promise<Buffer> {
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    // Set entry metadata from file stats
    entry.uncompressedSize = stats.size;
    entry.timeDateDOS = entry.setDateTime(stats.mtime);

    // Determine buffer size for chunked reading
    const bufferSize = options?.bufferSize || this.zipkitNode.getBufferSize();

    // Create chunked reader for streaming compression
    // All chunk reading logic is in this server class
    const chunkedReader = {
      totalSize: stats.size,
      onReadChunk: (position: number, size: number): Buffer => {
        const fd = fs.openSync(filePath, 'r');
        try {
          const buffer = Buffer.alloc(size);
          const bytesRead = fs.readSync(fd, buffer, 0, size, position);
          return buffer.subarray(0, bytesRead);
        } finally {
          fs.closeSync(fd);
        }
      },
      onOutChunk: (chunk: Buffer): void => {
        // Output chunks are accumulated in compression methods
      }
    };

    // Determine compression method and call appropriate method
    const compressionMethod = options?.level === 0 ? 'STORED' :
                              options?.useZstd ? 'ZSTD' : 'DEFLATED';
    
    // Set entry compression method before compression
    if (compressionMethod === 'STORED') {
      entry.cmpMethod = CMP_METHOD.STORED;
    } else if (compressionMethod === 'ZSTD') {
      entry.cmpMethod = CMP_METHOD.ZSTD;
    } else {
      entry.cmpMethod = CMP_METHOD.DEFLATED;
    }
    
    if (compressionMethod === 'STORED') {
      // For STORED, read file and pass as buffer
      const fileData = fs.readFileSync(filePath);
      return await this.compressData(entry, fileData, options, onOutputBuffer);
    } else if (compressionMethod === 'ZSTD') {
      // ZSTD requires full buffer, so read file first
      const fileData = fs.readFileSync(filePath);
      return await this.compressData(entry, fileData, options, onOutputBuffer);
    } else {
      // DEFLATED: Use deflateCompress with chunked reader
      return await this.deflateCompress(chunkedReader, options, bufferSize, entry, onOutputBuffer);
    }
  }

  /**
   * Compress multiple files from disk to a ZIP file
   * 
   * Batch compression from file paths. Creates entries for each file and writes
   * to output ZIP file. This is a simplified implementation - full implementation
   * would need to write ZIP structure incrementally.
   * 
   * @param filePaths - Array of file paths to compress
   * @param outputPath - Path where the ZIP file should be created
   * @param options - Optional compression options
   * @returns Promise that resolves when ZIP creation is complete
   * @throws Error if any file not found
   */
  async compressFiles(
    filePaths: string[],
    outputPath: string,
    options?: CompressOptions
  ): Promise<void> {
    // This is a placeholder for future implementation
    // Full implementation would need to:
    // 1. Create ZIP file structure
    // 2. Write local headers and compressed data for each file
    // 3. Write central directory
    // 4. Write end of central directory record
    // For now, this is a simplified version that compresses files but doesn't write ZIP structure
    
    const entries: ZipEntry[] = [];
    const compressedData: Buffer[] = [];

    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        continue; // Skip directories
      }

      // Create entry
      const entryName = path.relative(process.cwd(), filePath) || path.basename(filePath);
      const entry = this.zipkitNode.createZipEntry(entryName);
      
      // Compress file
      const compressed = await this.compressFile(filePath, entry, options);
      entries.push(entry);
      compressedData.push(compressed);
    }

    // For now, this is a placeholder
    // Full implementation would write ZIP structure to outputPath
    throw new Error('compressFiles() - Full implementation pending. Use neozip CLI for now.');
  }
}
