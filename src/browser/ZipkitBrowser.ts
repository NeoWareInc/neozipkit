// ======================================
//	ZipkitBrowser.ts
//  Copyright (c) 2025 NeoWare, Inc. All rights reserved.
// ======================================

import Zipkit, { CompressOptions, CreateZipOptions } from '../core';
import ZipEntry from '../core/ZipEntry';
import { ZipCompress } from '../core/ZipCompress';
import Errors from '../core/constants/Errors';
import * as Headers from '../core/constants/Headers';
import { TOKENIZED_METADATA, TIMESTAMP_SUBMITTED, TIMESTAMP_METADATA } from '../core/constants/Headers';
import { sha256, crc32 } from '../core/encryption/ZipCrypto';
import { DATATYPE, getTypeOf } from '../core/components/Util';
import type { FileData } from '../types';
import HashCalculator from '../core/components/HashCalculator';

// Re-export everything from Zipkit
export * from '../core';
export { ZipEntry, Errors, Headers, sha256, getTypeOf };

// ======================================
//	ZipkitBrowser
// ======================================

export default class ZipkitBrowser extends Zipkit {
  constructor() {
    super();      // Call the parent constructor

    // console.log('Zipkit.support.isNode: ', Zipkit.support.isNode);
    // console.log('Zipkit.support.buffer: ', Zipkit.support.buffer);
    // console.log('Zipkit.support.blob: ', Zipkit.support.blob);
    // console.log('Zipkit.support.streams: ', Zipkit.support.streams);
    // console.log('Zipkit.support.fileReader: ', Zipkit.support.fileReader);
  }

  // --------------------------------------
  // Load a ZIP file from a Blob and return the ZipEntry array
  // Always uses loadZip() to ensure proper initialization

  async loadZipBlob(data: Blob): Promise<ZipEntry[] | null> {
    if (getTypeOf(data) !== DATATYPE.BLOB) {
      throw new Error(Errors.DATATYPE_UNSUPPORTED);
    }

    return new Promise((resolve, reject) => {
      const reader = new window.FileReader();
      reader.readAsArrayBuffer(data);

      reader.onload = (e: ProgressEvent<FileReader>) => {
        if (!reader.result) {
          reject(new Error('Failed to read file'));
          return;
        }
        
        try {
          // Convert ArrayBuffer to Buffer
          const buffer = Buffer.from(reader.result as ArrayBuffer);
          
          // Always use loadZip() which:
          // 1. Resets ZIP data
          // 2. Stores buffer in this.inBuffer
          // 3. Loads EOCD and parses central directory
          // 4. Stores entries in this.zipEntries
          // 5. Returns the entries
          const entries = super.loadZip(buffer);
          resolve(entries);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(reader.error || new Error('Failed to read file'));
      };
    });
  }

  // --------------------------------------
  // Create a ZipEntry for a File object

  createZipFileEntry(file: FileData): ZipEntry {
    const entry = super.createZipEntry(file.name);
    entry.fileData = file;
    entry.uncompressedSize = file.size;

    const fileDate = new Date(file.lastModified);
    entry.timeDateDOS = entry.setDateTime(fileDate);
    entry.cmpMethod = Headers.CMP_METHOD.DEFLATED;

    return entry;
  }

  // --------------------------------------
  // Calculate the SHA256 hash of a File object

  async hashFile(file: FileData): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return sha256(buffer);
  }

  // --------------------------------------
  // Compress the data and return the compressed data buffer
  // Set the ZipEntry compressSize and CRC32 values

  async compressDataBlob(entry: ZipEntry, data: Blob, options?: CompressOptions): Promise<Buffer> {
    if (getTypeOf(data) !== DATATYPE.BLOB) {
      throw new Error(Errors.DATATYPE_UNSUPPORTED);
    }

    return new Promise(async (resolve, reject) => {
      const _compressData = async (entry: ZipEntry, data: Buffer, options?: CompressOptions): Promise<Buffer> => {
        // Use Zipkit wrapper method
        return await this.compressData(entry, data, options);
      };

      const reader = new window.FileReader();
      reader.readAsArrayBuffer(data);

      reader.onload = async function(this: FileReader, e: ProgressEvent<FileReader>) {
        if (!this.result) {
          reject(new Error('Failed to read file'));
          return;
        }
        try {
          const _inBuf = Buffer.from(this.result as ArrayBuffer);
          const result = await _compressData(entry, _inBuf, options);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = function(this: FileReader, e: ProgressEvent<FileReader>) {
        reject(this.error || new Error('Failed to read file'));
      };
    });
  }

  // --------------------------------------
  // Extract a Blob from a ZipEntry

  async extractBlob(entry: ZipEntry, skipHashCheck?: boolean): Promise<Blob | null> {
    try {
      const _outBuf = await this.extract(entry, skipHashCheck);
      if (!_outBuf) return null;
      
      // Convert Buffer to Uint8Array for Blob compatibility
      const uint8Array = new Uint8Array(_outBuf);
      return new Blob([uint8Array], { type: 'application/octet-stream' });
    } catch (error) {
      throw error;
    }
  }

  // --------------------------------------
  // Create a ZIP file in memory and return a Blob

  async createZipBlob(cmpOptions?: CompressOptions, options?: CreateZipOptions): Promise<Blob | null> {
    const _onError = options?.onError || (() => {});
    const _onEntryDone = options?.onEntryDone || (() => {});

    const zipEntries = super.getDirectory();
    if (!zipEntries) {
      _onError(new Error(Errors.NO_FILES));
      return null;
    }

    let offset = 0;
    const buffers: Buffer[] = [];

    for (const entry of zipEntries) {
      if (!entry.isUpdated) {
        // CRITICAL FIX: Check for token files even in copy mode
        if (entry.filename === TOKENIZED_METADATA || entry.filename === TIMESTAMP_SUBMITTED || entry.filename === TIMESTAMP_METADATA) {
          // Force this entry to be processed with special handling instead of copied
          entry.isUpdated = true;
          // Don't continue here - let it fall through to special handling below
        } else {
          const inData = await super.copyEntry(entry);
          entry.localHdrOffset = offset;
          offset += inData.length;
          buffers.push(inData);
          _onEntryDone(entry, 'Copied');
          continue;
        }
      }

      if (!entry.fileData) {
        _onError(new Error(Errors.FILE_NOT_FOUND));
        return null;
      }

      const fileBuffer = await entry.fileData.arrayBuffer();
      
      // Special handling for already-compressed entries - use existing compressed data
      if (entry.cmpData && entry.compressedSize && entry.crc) {
        // Entry is already compressed, use the existing compressed data
        const localHdr = entry.createLocalHdr();
        entry.localHdrOffset = offset;
        offset += localHdr.length + entry.cmpData.length;
        
        buffers.push(localHdr);
        buffers.push(entry.cmpData);
        _onEntryDone(entry, 'Written (pre-compressed)');
        continue;
      }
      
      // Special handling for token metadata files - store uncompressed with CRC-32
      if (entry.filename === TOKENIZED_METADATA || entry.filename === TIMESTAMP_SUBMITTED || entry.filename === TIMESTAMP_METADATA) {
        // For token metadata, use STORED compression (no compression)
        const buffer = Buffer.from(fileBuffer);
        
        // Calculate CRC-32 for the token file (not SHA-256 to avoid Merkle Root interference)
        entry.crc = crc32(buffer);
        
        // Set up entry for STORED compression
        entry.cmpMethod = 0; // STORED
        entry.compressedSize = buffer.length;
        entry.uncompressedSize = buffer.length;
        
        // Do NOT set SHA-256 hash for token metadata to avoid Merkle Root calculation
        // entry.sha256 should remain undefined for metadata files
        
        const localHdr = entry.createLocalHdr();
        entry.localHdrOffset = offset;
        offset += localHdr.length + buffer.length;
        
        buffers.push(localHdr);
        buffers.push(buffer);
        _onEntryDone(entry, 'Stored (metadata)');
      } else {
        // Normal file processing with compression
        const cmpData = await this.compressData(entry, Buffer.from(fileBuffer), cmpOptions);
        const localHdr = entry.createLocalHdr();

        entry.localHdrOffset = offset;
        offset += localHdr.length + cmpData.length;

        buffers.push(localHdr);
        buffers.push(cmpData);
        _onEntryDone(entry, 'Written');
      }
    }

    const centralDirOffset = offset;
    for (const entry of zipEntries) {
      const centralDirEntry = entry.centralDirEntry();
      offset += centralDirEntry.length;
      buffers.push(centralDirEntry);
    }

    const centralDirSize = offset - centralDirOffset;
    const ceBuf = super.centralEndHdr(centralDirSize, centralDirOffset);
    buffers.push(ceBuf);

    const combinedBuffer = Buffer.concat(buffers);
    // Convert Buffer to Uint8Array for Blob compatibility
    const uint8Array = new Uint8Array(combinedBuffer);
    return new Blob([uint8Array], { type: 'application/zip' });
  }

  /**
   * Checks if a filename is a blockchain metadata file that should be excluded from Merkle Root calculation
   * @param filename - The filename to check
   * @returns boolean - True if the file is a metadata file
   */
  private isMetadataFile(filename: string): boolean {
    return filename === TIMESTAMP_SUBMITTED ||
           filename === TIMESTAMP_METADATA ||
           filename === TOKENIZED_METADATA;
  }

  // --------------------------------------
  // Helper method: Add a file to the ZIP with compression
  // Simplifies the common workflow of creating entry + compressing

  async addFile(file: FileData, options?: CompressOptions): Promise<ZipEntry> {
    // Create entry
    const entry = this.createZipFileEntry(file);
    
    // Compress the file
    // In browser, File objects implement both FileData and Blob interfaces
    // We need to convert FileData to Blob for compressDataBlob
    const fileBlob = file as unknown as Blob;
    const compressedData = await this.compressDataBlob(entry, fileBlob, options);
    entry.cmpData = compressedData;
    
    return entry;
  }

  // --------------------------------------
  // Verify a ZIP entry by attempting to extract it
  // Returns true if the entry is valid, false otherwise

  async verifyEntry(entry: ZipEntry, skipHashCheck?: boolean): Promise<boolean> {
    try {
      const blob = await this.extractBlob(entry, skipHashCheck);
      return blob !== null;
    } catch (error) {
      console.error(`Verification failed for ${entry.filename}:`, error);
      return false;
    }
  }
}
