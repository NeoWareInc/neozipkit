// ======================================
//	ZipDecompress.ts - Decompression Module
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
import { CMP_METHOD } from './constants/Headers';
import { ZipCrypto } from './encryption/ZipCrypto';

export interface DecompressionResult {
  success: boolean;
  data?: Buffer;
  error?: string;
}

export interface DecompressionOptions {
  method: number; // Compression method code (0=stored, 8=deflate, 93=zstd)
  debug?: boolean; // Enable debug logging
}

/**
 * ZipDecompress - Unified Decompression Module (Internal to Zipkit)
 * Consolidates decompression functionality from ZipCompress
 * Supports deflate, zstd, and stored compression methods with chunked processing
 * 
 * This class is internal to Zipkit and should not be used directly.
 * Use Zipkit methods instead.
 */
class ZipDecompress {
  private zipkit: Zipkit;
  private debug: boolean;

  // Class-level logging control - set to true to enable logging
  private static loggingEnabled: boolean = false;

  /**
   * Internal logging method - only logs if class logging is enabled
   */
  private log(...args: any[]): void {
    if (ZipDecompress.loggingEnabled) {
      Logger.debug(`[ZipDecompress]`, ...args);
    }
  }

  constructor(zipkit: Zipkit) {
    this.zipkit = zipkit;
    // Debug disabled by default
    this.debug = false;
    // If logging is enabled, ensure Logger level is set to debug
    if (ZipDecompress.loggingEnabled) {
      Logger.setLevel('debug');
    }
  }

  /**
   * Extract file data (Buffer-based ZIP only)
   * Public method that validates buffer mode and extracts entry
   * 
   * @param entry ZIP entry to extract
   * @param skipHashCheck Skip hash verification (CRC-32 or SHA-256)
   * @returns Promise resolving to extracted data as Buffer, or null if failed
   * @throws Error if not a Buffer-based ZIP
   */
  async extract(entry: ZipEntry, skipHashCheck?: boolean): Promise<Buffer | null> {
    if (!this.zipkit.hasInBuffer()) {
      throw new Error('extract() requires Buffer-based ZIP. Use ZipkitNode.extractToFile() for file-based ZIP or call loadZip() first.');
    }
    
    this.log(`extract() called for entry: ${entry.filename}, method: ${entry.cmpMethod}, skipHashCheck: ${skipHashCheck}`);
    
    const buffer = this.zipkit.ensureBuffer();
    
    // Decrypt if needed using password on zipkit instance
    let fdata = this.zipkit.parseLocalHeader(entry, buffer);
    
    if ((entry as any).isEncrypted && (this.zipkit as any)?.password) {
      this.log(`Starting in-memory decryption for entry: ${entry.filename}`);
      
      // Use ZipCrypto's decryptBuffer method which handles all the header parsing and decryption
      const zipCrypto = new ZipCrypto();
      
      fdata = zipCrypto.decryptBuffer(entry, buffer, fdata, (this.zipkit as any).password);
      
      this.log(`Decryption successful, decrypted compressed data length: ${fdata.length}`);
    }

    if (fdata.length === 0) {
      return null;
    }

    // Use the unCompress method
    return this.unCompress(fdata, entry, skipHashCheck);
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
  private async zstdDecompressSync(data: Buffer): Promise<Buffer> {
    this.log(`zstdDecompressSync() called with ${data.length} bytes`);
    
    try {
      // Use global ZstdManager for decompression (handles queuing and initialization)
      const decompressed = await ZstdManager.decompress(data);
      this.log(`ZSTD decompression successful: ${data.length} bytes -> ${decompressed.length} bytes`);
      return Buffer.from(decompressed);
    } catch (error) {
      this.log(`ZSTD decompression failed: ${error}`);
      throw new Error(`ZSTD decompression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Uncompress compressed data buffer (synchronous for in-memory mode)
   * Handles decompression and hash verification
   * Internal method only
   */
  private async unCompress(
    compressedData: Buffer,
    entry: ZipEntry,
    skipHashCheck?: boolean
  ): Promise<Buffer> {
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
      // Use ZSTD decompression (now async with ZstdManager)
      outBuf = await this.zstdDecompressSync(compressedData);
    } else {
      throw new Error(`Unsupported compression method: ${entry.cmpMethod}`);
    }

    // Verify hash
    if (!skipHashCheck) {
      if (entry.sha256) {
        const isValid = this.zipkit.testSHA256(entry, outBuf);
        if (!isValid) {
          throw new Error(Errors.INVALID_SHA256);
        }
      } else {
        const isValid = this.zipkit.testCRC32(entry, outBuf);
        if (!isValid) {
          throw new Error(Errors.INVALID_CRC);
        }
      }
    }

    return outBuf;
  }

}

// Default export for internal use by Zipkit only
export default ZipDecompress;
