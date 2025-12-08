// ======================================
//	ZipDecompressNode.ts - Node.js File-Based Decompression
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
import { ZstdInit, ZstdSimple } from '@oneidentity/zstd-js';
import ZipkitNode from './ZipkitNode';
import { Logger } from '../core/components/Logger';
import ZipEntry from '../core/ZipEntry';
import Errors from '../core/constants/Errors';
import { CMP_METHOD } from '../core/constants/Headers';
import { HashCalculator } from '../core/components/HashCalculator';
import { DecryptionStream, ZipCrypto } from '../core/encryption/ZipCrypto';
import { EncryptionMethod } from '../core/encryption/types';
import { StreamingFileHandle } from '../core';
import * as fs from 'fs';

// Module-level singleton for ZSTD (shared across all instances)
let zstdCodec: { ZstdSimple: typeof ZstdSimple } | null = null;

// Async initialization function for zstd
async function initZstd(): Promise<{ ZstdSimple: typeof ZstdSimple }> {
  if (!zstdCodec) {
    zstdCodec = await ZstdInit();
  }
  return zstdCodec;
}

/**
 * ZipDecompressNode - Node.js file-based decompression operations
 * 
 * Independent decompression implementation for Node.js environments.
 * All decompression logic is implemented directly without delegating to ZipDecompress.
 * 
 * @example
 * ```typescript
 * const zipkitNode = new ZipkitNode();
 * const decompressNode = new ZipDecompressNode(zipkitNode);
 * await decompressNode.extractToFile(entry, './output/file.txt');
 * ```
 */
export class ZipDecompressNode {
  private zipkitNode: ZipkitNode;
  private zstdCodec: { ZstdSimple: typeof ZstdSimple } | null = null;

  // Class-level logging control - set to true to enable logging
  private static loggingEnabled: boolean = false;

  /**
   * Creates a new ZipDecompressNode instance
   * @param zipkitNode - ZipkitNode instance to use for ZIP operations
   */
  constructor(zipkitNode: ZipkitNode) {
    this.zipkitNode = zipkitNode;
    // If logging is enabled, ensure Logger level is set to debug
    if (ZipDecompressNode.loggingEnabled) {
      Logger.setLevel('debug');
    }
  }

  /**
   * Internal logging method - only logs if class logging is enabled
   */
  private log(...args: any[]): void {
    if (ZipDecompressNode.loggingEnabled) {
      Logger.debug(`[ZipDecompressNode]`, ...args);
    }
  }

  // ============================================================================
  // File-Based Extraction Methods
  // ============================================================================

  /**
   * Extract file directly to disk with true streaming (no memory buffering)
   * Public method that validates file mode and extracts entry to file
   * 
   * This method processes chunks as they are decompressed and writes them
   * directly to disk, maintaining minimal memory footprint regardless of file size.
   * This is the recommended method for file extraction to avoid memory issues.
   * 
   * @param entry ZIP entry to extract
   * @param outputPath Path where the file should be written
   * @param options Optional extraction options including progress callback
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
    // Lazy ZSTD initialization
    // Note: ZSTD codec is lazily initialized on first use (module-level singleton)
    if (entry.cmpMethod === CMP_METHOD.ZSTD && !this.zstdCodec) {
      this.zstdCodec = await initZstd();
    }
    
    // Get fileHandle from zipkitNode (merged from ZipLoadEntriesServer)
    const fileHandle = (this.zipkitNode as any).getFileHandle();
    
    // Call internal method with fileHandle
    await this.extractToFileInternal(fileHandle, entry, outputPath, options);
  }

  /**
   * Test entry integrity without extracting to disk
   * Validates CRC-32 or SHA-256 hash without writing decompressed data
   * 
   * This method processes chunks as they are decompressed and validates them,
   * but discards the decompressed data instead of writing to disk. This is useful
   * for verifying ZIP file integrity without extracting files.
   * 
   * @param entry ZIP entry to test
   * @param options Optional test options including progress callback
   * @returns Promise that resolves when validation is complete
   * @throws Error if validation fails (INVALID_CRC or INVALID_SHA256) or if not a File-based ZIP
   */
  async testEntry(
    entry: ZipEntry,
    options?: {
      skipHashCheck?: boolean;
      onProgress?: (bytes: number) => void;
    }
  ): Promise<void> {
    // Lazy ZSTD initialization
    if (entry.cmpMethod === CMP_METHOD.ZSTD && !this.zstdCodec) {
      this.zstdCodec = await initZstd();
    }
    
    // Get fileHandle from zipkitNode
    const fileHandle = (this.zipkitNode as any).getFileHandle();
    
    // Call internal test method with fileHandle
    await this.testEntryInternal(fileHandle, entry, options);
  }

  // ============================================================================
  // Internal File-Based Methods
  // ============================================================================

  /**
   * Read compressed data from file and yield one block at a time
   * 
   * MEMORY EFFICIENCY: Yields compressed data chunks one at a time without accumulation.
   * Each chunk is read from disk and yielded immediately, allowing downstream processing
   * (decryption, decompression) to handle one block at a time.
   * 
   * @param fileHandle - File handle to read from
   * @param entry - ZIP entry to read compressed data for
   * @param chunkSize - Optional chunk size override (defaults to ZipkitServer's bufferSize)
   * @returns Async generator yielding compressed data chunks one at a time
   */
  private async *readCompressedDataStream(
    fileHandle: StreamingFileHandle,
    entry: ZipEntry, 
    chunkSize?: number
  ): AsyncGenerator<Buffer> {
    // Use provided chunkSize or ZipkitServer's default bufferSize
    const effectiveChunkSize = chunkSize || this.zipkitNode.getBufferSize();
    // Read local file header
    const localHeaderBuffer = Buffer.alloc(30);
    await fileHandle.read(localHeaderBuffer, 0, 30, entry.localHdrOffset);
    
    if (localHeaderBuffer.readUInt32LE(0) !== 0x04034b50) { // LOCAL_HDR.SIGNATURE
      throw new Error(Errors.INVALID_CEN);
    }
    
    // Calculate data start position
    const filenameLength = localHeaderBuffer.readUInt16LE(26);
    const extraFieldLength = localHeaderBuffer.readUInt16LE(28);
    const dataStart = entry.localHdrOffset + 30 + filenameLength + extraFieldLength;
    
    // Yield compressed data in chunks - one block at a time
    let remaining = entry.compressedSize;
    let position = dataStart;
    
    while (remaining > 0) {
      const currentChunkSize = Math.min(effectiveChunkSize, remaining);
      const chunk = Buffer.alloc(currentChunkSize);
      await fileHandle.read(chunk, 0, currentChunkSize, position);
      
      this.log(`readCompressedDataStream: Yielding compressed chunk: ${chunk.length} bytes (${remaining} bytes remaining)`);
      yield chunk;
      
      position += currentChunkSize;
      remaining -= currentChunkSize;
    }
  }

  /**
   * Handles: reading compressed data, optional decryption, decompression, hashing, and writing
   * Internal method that takes fileHandle as parameter
   */
  private async extractToFileInternal(
    fileHandle: any,
    entry: ZipEntry,
    outputPath: string,
    options?: {
      skipHashCheck?: boolean;
      onProgress?: (bytes: number) => void;
    }
  ): Promise<void> {
    this.log(`extractToFileInternal called for entry: ${entry.filename}`);
    this.log(`Entry isEncrypted: ${(entry as any).isEncrypted}, has password: ${!!(this.zipkitNode as any)?.password}`);
    
    try {
      // Create output stream with overwrite flag to truncate existing files
      const writeStream = fs.createWriteStream(outputPath, { flags: 'w' });

      // Build compressed data stream - yields one block at a time
      let dataStream = this.readCompressedDataStream(fileHandle, entry);

      // Decrypt if needed using password on zipkitNode instance
      // Decryption maintains state across blocks via updateKeys()
      const isEncrypted = (entry as any).isEncrypted && (this.zipkitNode as any)?.password;
    
      if (isEncrypted) {
        this.log(`Starting decryption for entry: ${entry.filename}`);
        
        // Prepare entry for decryption by parsing local header
        await DecryptionStream.prepareEntryForDecryption(fileHandle, entry);
        
        const encryptionMethod = (entry as any).encryptionMethod || EncryptionMethod.ZIP_CRYPTO;
        
        this.log(`Creating DecryptionStream with method: ${encryptionMethod}`);
        
        const decryptor = new DecryptionStream({
          password: (this.zipkitNode as any).password,
          method: encryptionMethod,
          entry: entry
        });
        
        this.log(`DecryptionStream created, calling decrypt()...`);
        // Decryption processes one block at a time, maintaining state across blocks
        dataStream = decryptor.decrypt(dataStream);
        this.log(`decrypt() returned, dataStream is now a generator that yields one decrypted block at a time`);
      }

      // Pipeline: readCompressedDataStream() → DecryptionStream.decrypt() → decompressStream() → writeStream
      // Each stage processes one block at a time without accumulation
      await this.unCompressToFile(dataStream, entry, writeStream, {
        skipHashCheck: options?.skipHashCheck,
        onProgress: options?.onProgress,
        outputPath
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Test entry integrity without writing to disk
   * Internal method that takes fileHandle as parameter
   */
  private async testEntryInternal(
    fileHandle: any,
    entry: ZipEntry,
    options?: {
      skipHashCheck?: boolean;
      onProgress?: (bytes: number) => void;
    }
  ): Promise<void> {
    this.log(`testEntryInternal called for entry: ${entry.filename}`);
    this.log(`Entry isEncrypted: ${(entry as any).isEncrypted}, has password: ${!!(this.zipkitNode as any)?.password}`);
    
    try {
      // Build compressed data stream - yields one block at a time
      let dataStream = this.readCompressedDataStream(fileHandle, entry);

      // Decrypt if needed using password on zipkitNode instance
      const isEncrypted = (entry as any).isEncrypted && (this.zipkitNode as any)?.password;
    
      if (isEncrypted) {
        this.log(`Starting decryption for entry: ${entry.filename}`);
        
        // Prepare entry for decryption by parsing local header
        await DecryptionStream.prepareEntryForDecryption(fileHandle, entry);
        
        const encryptionMethod = (entry as any).encryptionMethod || EncryptionMethod.ZIP_CRYPTO;
        
        this.log(`Creating DecryptionStream with method: ${encryptionMethod}`);
        
        const decryptor = new DecryptionStream({
          password: (this.zipkitNode as any).password,
          method: encryptionMethod,
          entry: entry
        });
        
        this.log(`DecryptionStream created, calling decrypt()...`);
        dataStream = decryptor.decrypt(dataStream);
        this.log(`decrypt() returned, dataStream is now a generator that yields one decrypted block at a time`);
      }

      // Pipeline: readCompressedDataStream() → DecryptionStream.decrypt() → decompressStream() → hash validation
      // Data is discarded after validation, no file writing
      await this.unCompressToTest(dataStream, entry, {
        skipHashCheck: options?.skipHashCheck,
        onProgress: options?.onProgress
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Decompress data stream and write to file
   * 
   * MEMORY EFFICIENCY: Processes decompressed chunks one at a time.
   * Pipeline: compressedStream → decompressStream() → hashCalc → writeStream
   * - Each decompressed chunk is written immediately without accumulation
   * - Hash calculation is incremental (HashCalculator)
   * - Progress callbacks are invoked per chunk
   * 
   * Handles decompression, hash calculation, file writing, and verification.
   * Internal method only
   */
  private async unCompressToFile(
    compressedStream: AsyncGenerator<Buffer>,
    entry: ZipEntry,
    writeStream: any, // Node.js WriteStream
    options?: {
      skipHashCheck?: boolean;
      onProgress?: (bytes: number) => void;
      outputPath?: string; // For cleanup on error
    }
  ): Promise<void> {
    this.log(`unCompressToFile() called for entry: ${entry.filename}, method: ${entry.cmpMethod}`);
    
    // Decompress stream - processes one block at a time
    const decompressedStream = this.decompressStream(compressedStream, entry.cmpMethod);
    
    // Process and write chunks - one block at a time
    const hashCalc = new HashCalculator({ useSHA256: !!entry.sha256 });
    let totalBytes = 0;
    
    try {
      for await (const chunk of decompressedStream) {
        this.log(`unCompressToFile: Processing decompressed chunk: ${chunk.length} bytes`);
        hashCalc.update(chunk);
        writeStream.write(chunk);
        totalBytes += chunk.length;
        
        if (options?.onProgress) {
          options.onProgress(totalBytes);
        }
      }
      
      // Close stream
      await new Promise((resolve, reject) => {
        writeStream.end(() => resolve(undefined));
        writeStream.on('error', reject);
      });
      
      // Verify hash
      if (!options?.skipHashCheck) {
        if (entry.sha256) {
          const calculatedHash = hashCalc.finalizeSHA256();
          this.log(`SHA-256 comparison: calculated=${calculatedHash}, stored=${entry.sha256}`);
          if (calculatedHash !== entry.sha256) {
            if (options?.outputPath && fs) {
              fs.unlinkSync(options.outputPath);
            }
            throw new Error(Errors.INVALID_SHA256);
          }
          this.log(`SHA-256 comparison: calculated=${calculatedHash}, stored=${entry.sha256}`);
        } else {
          const calculatedCRC = hashCalc.finalizeCRC32();
          this.log(`CRC-32 comparison: calculated=${calculatedCRC}, stored=${entry.crc}`);
          if (calculatedCRC !== entry.crc) {
            if (options?.outputPath && fs) {
              fs.unlinkSync(options.outputPath);
            }
            throw new Error(Errors.INVALID_CRC);
          }
          this.log(`CRC-32 comparison: calculated=${calculatedCRC}, stored=${entry.crc}`);
        }
      }
    } catch (error) {
      // Cleanup file on error
      if (options?.outputPath && fs) {
        try {
          fs.unlinkSync(options.outputPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  }

  // ============================================================================
  // Decompression Methods
  // ============================================================================

  /**
   * Decompress data stream and validate hash without writing to disk
   * 
   * MEMORY EFFICIENCY: Processes decompressed chunks one at a time.
   * Pipeline: compressedStream → decompressStream() → hashCalc → validation
   * - Each decompressed chunk is validated immediately without accumulation
   * - Hash calculation is incremental (HashCalculator)
   * - Progress callbacks are invoked per chunk
   * - No file writing - data is discarded after validation
   * 
   * Handles decompression, hash calculation, and verification.
   * Internal method only
   */
  private async unCompressToTest(
    compressedStream: AsyncGenerator<Buffer>,
    entry: ZipEntry,
    options?: {
      skipHashCheck?: boolean;
      onProgress?: (bytes: number) => void;
    }
  ): Promise<void> {
    this.log(`unCompressToTest() called for entry: ${entry.filename}, method: ${entry.cmpMethod}`);
    
    // Decompress stream - processes one block at a time
    const decompressedStream = this.decompressStream(compressedStream, entry.cmpMethod);
    
    // Process and validate chunks - one block at a time
    const hashCalc = new HashCalculator({ useSHA256: !!entry.sha256 });
    let totalBytes = 0;
    
    try {
      for await (const chunk of decompressedStream) {
        this.log(`unCompressToTest: Processing decompressed chunk: ${chunk.length} bytes`);
        hashCalc.update(chunk);
        // Discard chunk - don't write to disk
        totalBytes += chunk.length;
        
        if (options?.onProgress) {
          options.onProgress(totalBytes);
        }
      }
      
      // Verify hash
      if (!options?.skipHashCheck) {
        if (entry.sha256) {
          const calculatedHash = hashCalc.finalizeSHA256();
          this.log(`SHA-256 comparison: calculated=${calculatedHash}, stored=${entry.sha256}`);
          if (calculatedHash !== entry.sha256) {
            throw new Error(Errors.INVALID_SHA256);
          }
          this.log(`SHA-256 comparison: calculated=${calculatedHash}, stored=${entry.sha256}`);
        } else {
          const calculatedCRC = hashCalc.finalizeCRC32();
          this.log(`CRC-32 comparison: calculated=${calculatedCRC}, stored=${entry.crc}`);
          if (calculatedCRC !== entry.crc) {
            throw new Error(Errors.INVALID_CRC);
          }
          this.log(`CRC-32 comparison: calculated=${calculatedCRC}, stored=${entry.crc}`);
        }
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Decompress data stream chunk by chunk
   * 
   * MEMORY EFFICIENCY: Processes compressed data one block at a time.
   * - For STORED: Passes through chunks unchanged (no accumulation)
   * - For DEFLATED: Uses pako streaming inflate (maintains state across chunks)
   * - For ZSTD: Collects all chunks (ZSTD limitation - requires full buffer)
   * 
   * Pipeline: readCompressedDataStream() → DecryptionStream.decrypt() → decompressStream() → writeStream
   * 
   * Internal method only
   */
  private async *decompressStream(
    compressedStream: AsyncGenerator<Buffer>,
    method: number,
    chunkSize?: number
  ): AsyncGenerator<Buffer> {
    // chunkSize parameter is currently unused but kept for API consistency
    if (method === CMP_METHOD.STORED) {
      // Pass through unchanged - one block at a time
      for await (const chunk of compressedStream) {
        yield chunk;
      }
    } else if (method === CMP_METHOD.DEFLATED) {
      // Use pako streaming inflate - maintains state across chunks
      yield* this.inflateStream(compressedStream);
    } else if (method === CMP_METHOD.ZSTD) {
      // Use ZSTD streaming decompression - note: ZSTD requires full buffer
      yield* this.zstdDecompressStream(compressedStream);
    } else {
      throw new Error(`Unsupported compression method: ${method}`);
    }
  }

  /**
   * Streaming deflate decompression using pako
   * 
   * MEMORY EFFICIENCY: Processes compressed chunks one at a time.
   * - Inflator maintains decompression state across chunks
   * - Decompressed chunks are yielded immediately after processing each compressed chunk
   * - No accumulation of compressed data (except in pako's internal buffers)
   */
  private async *inflateStream(
    compressedStream: AsyncGenerator<Buffer>
  ): AsyncGenerator<Buffer> {
    const inflator = new pako.Inflate({ raw: true });
    const decompressedChunks: Buffer[] = [];
    
    inflator.onData = (chunk: Uint8Array) => {
      decompressedChunks.push(Buffer.from(chunk));
    };
    
    // Process each compressed chunk one at a time
    for await (const compressedChunk of compressedStream) {
      this.log(`inflateStream: Processing compressed chunk: ${compressedChunk.length} bytes`);
      inflator.push(compressedChunk, false);
      
      // Yield accumulated decompressed chunks immediately (no accumulation)
      for (const chunk of decompressedChunks) {
        yield chunk;
      }
      decompressedChunks.length = 0;
    }
    
    // Finalize decompression
    inflator.push(new Uint8Array(0), true);
    for (const chunk of decompressedChunks) {
      yield chunk;
    }
  }

  /**
   * Streaming ZSTD decompression
   */
  private async *zstdDecompressStream(
    compressedStream: AsyncGenerator<Buffer>
  ): AsyncGenerator<Buffer> {
    // ZSTD is guaranteed to be initialized via factory method
    
    // Collect all compressed chunks first (ZSTD needs complete data)
    const compressedChunks: Buffer[] = [];
    for await (const chunk of compressedStream) {
      compressedChunks.push(chunk);
    }
    
    const compressedData = Buffer.concat(compressedChunks);
    
    try {
      if (!this.zstdCodec) {
        throw new Error('ZSTD codec not initialized.');
      }
      const decompressed = this.zstdCodec.ZstdSimple.decompress(compressedData);
      const decompressedBuffer = Buffer.from(decompressed);
      
      // Yield decompressed data in chunks using ZipkitServer's bufferSize
      const chunkSize = this.zipkitNode.getBufferSize();
      let offset = 0;
      while (offset < decompressedBuffer.length) {
        const end = Math.min(offset + chunkSize, decompressedBuffer.length);
        yield decompressedBuffer.slice(offset, end);
        offset = end;
      }
    } catch (error) {
      throw new Error(`ZSTD streaming decompression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Inflate data using pako (internal use only)
   */
  private inflate(data: Buffer): Buffer {
    this.log(`inflate() called with ${data.length} bytes`);
    const result = pako.inflateRaw(data);
    return Buffer.from(result.buffer, result.byteOffset, result.byteLength);
  }

  /**
   * Synchronous zstd decompress method for in-memory mode
   * ZSTD codec is guaranteed to be initialized via factory method
   * Internal method only
   */
  private zstdDecompressSync(data: Buffer): Buffer {
    this.log(`zstdDecompressSync() called with ${data.length} bytes`);
    
    try {
      // Ensure ZSTD is initialized
      if (!this.zstdCodec) {
        throw new Error('ZSTD codec not initialized.');
      }
      const decompressed = this.zstdCodec.ZstdSimple.decompress(data);
      this.log(`ZSTD synchronous decompression successful: ${data.length} bytes -> ${decompressed.length} bytes`);
      return Buffer.from(decompressed);
    } catch (error) {
      this.log(`ZSTD synchronous decompression failed: ${error}`);
      throw new Error(`ZSTD synchronous decompression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Uncompress compressed data buffer (synchronous for in-memory mode)
   * Handles decompression and hash verification
   * Internal method only
   */
  private unCompress(
    compressedData: Buffer,
    entry: ZipEntry,
    skipHashCheck?: boolean
  ): Buffer {
    this.log(`unCompress() called for entry: ${entry.filename}, method: ${entry.cmpMethod}, data length: ${compressedData.length}`);
    
    if (compressedData.length === 0) {
      return Buffer.alloc(0);
    }

    let outBuf: Buffer;
    if (entry.cmpMethod === CMP_METHOD.STORED) {
      outBuf = compressedData;
    } else if (entry.cmpMethod === CMP_METHOD.DEFLATED) {
      // Use synchronous inflate for deflate
      outBuf = this.inflate(compressedData);
    } else if (entry.cmpMethod === CMP_METHOD.ZSTD) {
      // Use synchronous ZSTD decompression for in-memory mode
      outBuf = this.zstdDecompressSync(compressedData);
    } else {
      throw new Error(`Unsupported compression method: ${entry.cmpMethod}`);
    }

    // Verify hash
    if (!skipHashCheck) {
      if (entry.sha256) {
        const isValid = this.zipkitNode.testSHA256(entry, outBuf);
        if (!isValid) {
          throw new Error(Errors.INVALID_SHA256);
        }
      } else {
        const isValid = this.zipkitNode.testCRC32(entry, outBuf);
        if (!isValid) {
          throw new Error(Errors.INVALID_CRC);
        }
      }
    }

    return outBuf;
  }
}

