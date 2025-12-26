// ======================================
//	ZipkitCompress.ts - Compression Module
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

const pako = require('pako');
import { ZstdManager } from './ZstdManager';
import Zipkit from './Zipkit';
import { Logger } from './components/Logger';
import ZipEntry from './ZipEntry';
import Errors from './constants/Errors';
import { CMP_METHOD, GP_FLAG, ENCRYPT_HDR_SIZE } from './constants/Headers';
import { HashCalculator } from './components/HashCalculator';
import { ZipCrypto } from './encryption/ZipCrypto';

/**
 * Options for compressing files in a ZIP archive
 */
export interface CompressOptions {
  level?: number;             // Compression level (1-9, 0=store)
  password?: string | null;   // Password for encryption
  useSHA256?: boolean;        // Whether to calculate SHA256 hash default is false
  useZstd?: boolean;          // Whether to use Zstandard compression default is true
  bufferSize?: number;        // Override default buffer size
}

/**
 * Callbacks for ZIP file creation process
 * Buffer-based only - no file I/O operations
 */
export interface CreateZipOptions {
  onError?: (error: Error) => void;              // Called when an error occurs
  onEntryDone?: (entry: ZipEntry, status: string) => void;  // Called when entry processing completes
  onOutputBuffer?: (data: Buffer) => Promise<void>;       // Called to write output data
}

/**
 * Compression handler for ZIP files
 * Supports Deflate, Zstandard, and Store methods
 */
export class ZipCompress {
  private zipkit: Zipkit;
  private debug: boolean;

  // Class-level logging control - set to true to enable logging
  private static loggingEnabled: boolean = false;

  /**
   * Internal logging method - only logs if class logging is enabled
   */
  private log(...args: any[]): void {
    if (ZipCompress.loggingEnabled) {
      Logger.debug(`[ZipCompress]`, ...args);
    }
  }

  /**
   * Creates a new ZipCompress instance
   * @param zipkit - Zipkit instance to use for ZIP operations
   */
  constructor(zipkit: Zipkit) {
    this.zipkit = zipkit;
    // Debug disabled by default (controlled by class-level logging)
    this.debug = false;
    // If logging is enabled, ensure Logger level is set to debug
    if (ZipCompress.loggingEnabled) {
      Logger.setLevel('debug');
    }
    this.log(`ZipCompress initialized`);
  }

  /**
   * Compresses data for a ZIP entry (Buffer-based only)
   * @param entry - ZIP entry to compress
   * @param data - Buffer containing data to compress
   * @param options - Compression options
   * @param onOutputBuffer - Optional callback for streaming output
   * @returns Buffer containing compressed data
   */
  async compressData(entry: ZipEntry, data: Buffer, options?: CompressOptions, onOutputBuffer?: (data: Buffer) => Promise<void>): Promise<Buffer> {
    this.log(`compressData() called for entry: ${entry.filename}`);
    
    // Set uncompressed size if not already set
    if (!entry.uncompressedSize || entry.uncompressedSize === 0) {
      entry.uncompressedSize = data.length;
    }
    const totalSize = data.length;
    const bufferSize = options?.bufferSize || this.zipkit.getBufferSize(); // Use Zipkit's bufferSize
    
    this.log(`Compressing ${totalSize} bytes for entry: ${entry.filename}`);
    this.log(`Compression options:`, { level: options?.level, useZstd: options?.useZstd, bufferSize });
    
    // Determine compression method
    let compressionMethod: number;
    
    if (options?.level === 0) {
      compressionMethod = CMP_METHOD.STORED;
      this.log(`Using STORED method (no compression)`);
    } else if (options?.useZstd) {
      // ZSTD fallback to STORED if file too small
      if (totalSize < 100) {
        compressionMethod = CMP_METHOD.STORED;
        this.log(`ZSTD fallback to STORED (file too small: ${totalSize} bytes)`);
      } else {
        compressionMethod = CMP_METHOD.ZSTD;
        this.log(`Using ZSTD method (zstd compression)`);
      }
    } else {
      compressionMethod = CMP_METHOD.DEFLATED;
      this.log(`Using DEFLATED method (default compression)`);
    }
    
    entry.cmpMethod = compressionMethod;
    
    // Initialize hash calculator
    const needsHashCalculation = (!entry.crc || entry.crc === 0) || (options?.useSHA256 && !entry.sha256);
    const hashCalculator = needsHashCalculation ? new HashCalculator({ useSHA256: options?.useSHA256 && !entry.sha256 || false }) : null;
    
    // Calculate hashes if needed
    if (hashCalculator) {
      hashCalculator.update(data);
      if (!entry.crc || entry.crc === 0) {
        entry.crc = hashCalculator.finalizeCRC32();
      }
      if (options?.useSHA256 && !entry.sha256) {
        entry.sha256 = hashCalculator.finalizeSHA256();
      }
      this.log(`Final hashes: CRC32=0x${entry.crc.toString(16).padStart(8, '0')}, SHA256=${entry.sha256 || 'N/A'}`);
    }
    
    // Encrypt if password provided
    if (options?.password) {
      this.log(`Encrypting compressed data for entry: ${entry.filename}`);
      (entry as any).gpFlag = ((entry as any).gpFlag || 0) | GP_FLAG.ENCRYPTED;
      (entry as any).isEncrypted = true;
    }
    
    // Compress data based on method
    let compressedData: Buffer;
    const methodName = compressionMethod === CMP_METHOD.ZSTD ? 'ZSTD' : compressionMethod === CMP_METHOD.DEFLATED ? 'DEFLATED' : 'STORED';
    
    if (compressionMethod === CMP_METHOD.STORED) {
      compressedData = data;
    } else {
      this.log(`Processing sequence for ${methodName}: [HASH] -> [COMPRESS] -> [OUTPUT]`);
      this.log(`Compressing: method=${methodName}, input=${totalSize} bytes, buffer size=${bufferSize} bytes`);
      this.log(`Calculating hashes: CRC32=${!entry.crc || entry.crc === 0}, SHA256=${options?.useSHA256}`);
      
      if (compressionMethod === CMP_METHOD.ZSTD) {
        compressedData = await this.zstdCompress(data, options, bufferSize, entry, onOutputBuffer);
      } else {
        compressedData = await this.deflateCompress(data, options, bufferSize, entry, onOutputBuffer);
      }
    }
    
    // Encrypt compressed data if password provided
    if (options?.password) {
      compressedData = this.encryptCompressedData(entry, compressedData, options.password);
    }
    
    entry.compressedSize = compressedData.length;
    
    return compressedData;
  }

  /**
   * Compress data using deflate algorithm with chunked processing
   * @param data - Data to compress (Buffer or chunked reader)
   * @param options - Compression options
   * @param bufferSize - Buffer size for chunked processing
   * @param entry - ZIP entry being compressed
   * @param onOutputBuffer - Optional callback for streaming output
   * @returns Buffer containing compressed data
   */
  async deflateCompress(
    data: Buffer | { totalSize: number, onReadChunk: (position: number, size: number) => Buffer, onOutChunk: (chunk: Buffer) => void },
    options?: CompressOptions,
    bufferSize?: number,
    entry?: ZipEntry,
    onOutputBuffer?: (data: Buffer) => Promise<void>
  ): Promise<Buffer> {
    this.log(`deflateCompress() called - entry: ${entry?.filename ?? 'unknown'}, bufferSize: ${bufferSize}, level: ${options?.level ?? 6}`);
    
    const effectiveBufferSize = bufferSize || this.zipkit.getBufferSize();
    const level = options?.level ?? 6;
    
    // Handle chunked reader
    if (typeof data === 'object' && 'totalSize' in data && 'onReadChunk' in data) {
      // Chunked reader mode - not implemented in simplified version
      throw new Error('Chunked reader mode not supported in ZipCompress');
    }
    
    // For small data, use synchronous deflate
    if (data.length <= effectiveBufferSize) {
      return this.deflate(data, options);
    }
    
    // For large data, use chunked deflate
    const deflator = new pako.Deflate({ level, raw: true });
    const compressedChunks: Buffer[] = [];
    let totalProcessed = 0;
    let totalCompressedSize = 0;
    
    try {
      // Process data in chunks
      for (let offset = 0; offset < data.length; offset += effectiveBufferSize) {
        const chunk = data.slice(offset, offset + effectiveBufferSize);
        const isLast = offset + effectiveBufferSize >= data.length;
        
        deflator.push(chunk, isLast);
        
        // Collect compressed chunks
        if (deflator.result && deflator.result.length > 0) {
          const compressedChunk = Buffer.from(deflator.result);
          compressedChunks.push(compressedChunk);
          totalCompressedSize += compressedChunk.length;
          
          // Stream output if callback provided
          if (onOutputBuffer) {
            await onOutputBuffer(compressedChunk);
          }
        }
        
        totalProcessed += chunk.length;
      }
      
      // Calculate compression ratio
      const ratio = totalProcessed > 0 ? Math.round((totalCompressedSize / totalProcessed) * 100) : 0;
      this.log(`Final hashes: CRC32=0x${entry?.crc?.toString(16).padStart(8, '0')}, SHA256=${entry?.sha256 || 'N/A'}`);
      this.log(`Deflate compression complete: ${totalCompressedSize} bytes from ${totalProcessed} bytes (ratio=${ratio}%)`);
      
      return Buffer.concat(compressedChunks);
    } catch (e) {
      throw new Error(`Deflate compression failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Compress data using deflate algorithm (synchronous, small buffers only)
   * @param inbuf - Buffer containing data to compress
   * @param options - Compression options
   * @returns Buffer containing compressed data
   */
  deflate(inbuf: Buffer, options?: CompressOptions): Buffer {
    this.log(`deflate() called with buffer size: ${inbuf.length}, level: ${options?.level ?? 6}`);
    const level = options?.level ?? 6;
    const result = pako.deflateRaw(inbuf, { level });
    const ratio = inbuf.length > 0 ? Math.round((result.length / inbuf.length) * 100) : 0;
    this.log(`Deflate compression complete: ${result.length} bytes from ${inbuf.length} bytes (ratio=${ratio}%)`);
    return Buffer.from(result.buffer, result.byteOffset, result.byteLength);
  }

  /**
   * Compress data using Zstandard (zstd) algorithm
   * @param input - Input data to compress (Buffer or chunked reader)
   * @param options - Compression options
   * @param bufferSize - Buffer size for chunked processing
   * @param entry - ZIP entry being compressed
   * @param onOutputBuffer - Optional callback for streaming output
   * @returns Buffer containing compressed data
   */
  async zstdCompress(
    input: Buffer | { totalSize: number, readChunk: (position: number, size: number) => Buffer },
    options?: CompressOptions,
    bufferSize?: number,
    entry?: ZipEntry,
    onOutputBuffer?: (data: Buffer) => Promise<void>
  ): Promise<Buffer> {
    this.log(`zstdCompress() called - entry: ${entry?.filename ?? 'unknown'}, bufferSize: ${bufferSize}, level: ${options?.level ?? 6}`);
    
    const effectiveBufferSize = bufferSize || this.zipkit.getBufferSize();
    const level = options?.level ?? 6;
    
    // Handle chunked reader
    if (typeof input === 'object' && 'totalSize' in input && 'readChunk' in input) {
      // Chunked reader mode - not implemented in simplified version
      throw new Error('Chunked reader mode not supported in ZipCompress');
    }
    
    // Validate input
    if (!input || input.length === 0) {
      throw new Error('ZSTD compression: empty input buffer');
    }
    
    // Convert Buffer to Uint8Array for WASM module
    const inputArray = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    
    // Use global ZstdManager for compression (handles queuing and initialization)
    const compressed = await ZstdManager.compress(inputArray, level);
    const compressedBuffer = Buffer.from(compressed);
    
    if (onOutputBuffer) {
      await onOutputBuffer(compressedBuffer);
    }
    
    return compressedBuffer;
  }

  /**
   * Encrypt compressed data using PKZIP encryption
   * @param entry - ZIP entry to encrypt
   * @param compressedData - Compressed data to encrypt
   * @param password - Password for encryption
   * @returns Buffer containing encrypted data (includes 12-byte header)
   */
  encryptCompressedData(entry: ZipEntry, compressedData: Buffer, password: string): Buffer {
    this.log(`encryptCompressedData() called for entry: ${entry.filename}, compressed size: ${compressedData.length}`);
    
    const zipCrypto = new ZipCrypto();
    const encryptedData = zipCrypto.encryptBuffer(entry, compressedData, password);
    
    this.log(`Encryption complete: ${compressedData.length} bytes compressed -> ${encryptedData.length} bytes encrypted (includes ${ENCRYPT_HDR_SIZE}-byte header)`);
    
    return encryptedData;
  }

  /**
   * Compress file data in memory and return ZIP entry information as Buffer
   * @param entry - ZIP entry to compress
   * @param fileData - File data buffer to compress
   * @param cmpOptions - Compression options
   * @returns Buffer containing local header + compressed data
   */
  async compressFileBuffer(
    entry: ZipEntry,
    fileData: Buffer,
    cmpOptions?: CompressOptions
  ): Promise<Buffer> {
    this.log(`compressFileBuffer() called for entry: ${entry.filename}, size: ${fileData.length}`);
    
    // Set uncompressed size
    entry.uncompressedSize = fileData.length;
    
    // Initialize hash calculator
    const hashCalculator = new HashCalculator({ useSHA256: cmpOptions?.useSHA256 || false });
    hashCalculator.update(fileData);
    
    // Set hashes
    entry.crc = hashCalculator.finalizeCRC32();
    if (cmpOptions?.useSHA256) {
      entry.sha256 = hashCalculator.finalizeSHA256();
      this.log(`SHA-256 calculated: ${entry.sha256}`);
    }
    
    // Compress data
    const compressedData = await this.compressData(entry, fileData, cmpOptions);
    
    // Encrypt if password provided
    if (cmpOptions?.password) {
      this.log(`Encrypting compressed data for entry: ${entry.filename}`);
      (entry as any).gpFlag = ((entry as any).gpFlag || 0) | GP_FLAG.ENCRYPTED;
      (entry as any).isEncrypted = true;
      const zipCrypto = new ZipCrypto();
      const encryptedData = zipCrypto.encryptBuffer(entry, compressedData, cmpOptions.password);
      return encryptedData;
    }
    
    return compressedData;
  }
}
