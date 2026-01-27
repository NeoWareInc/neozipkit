/**
 * ZIP Copy Utilities
 * 
 * Low-level functions for copying ZIP entries directly without decompression/recompression.
 * This allows efficient copying of entries from one ZIP file to another while preserving
 * all original properties (compression, timestamps, etc.).
 * 
 * These utilities are part of the neozipkit library and provide efficient ZIP entry
 * manipulation without requiring full decompression/recompression cycles.
 * 
 * **Note**: This file uses ZIP structure constants from the core module:
 * - `LOCAL_HDR` - Local file header constants (from `src/core/constants/Headers.ts`)
 * - `CENTRAL_DIR` - Central directory entry constants
 * - `CENTRAL_END` - End of central directory record constants
 * 
 * These constants provide standard ZIP format signatures, sizes, and field offsets
 * as defined in the PKZIP specification.
 */

import * as fs from 'fs';
import {
  LOCAL_HDR,
  CENTRAL_DIR,
  CENTRAL_END,
} from '../core/constants/Headers';
import { crc32 } from '../core/encryption/ZipCrypto';

/**
 * Local file header structure
 */
export interface LocalFileHeader {
  signature: number;
  version: number;
  flags: number;
  compression: number;
  modTime: number;
  modDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  filenameLength: number;
  extraFieldLength: number;
}

/**
 * Central directory entry structure
 */
export interface CentralDirEntry {
  signature: number;
  versionMadeBy: number;
  versionNeeded: number;
  flags: number;
  compression: number;
  modTime: number;
  modDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  filenameLength: number;
  extraFieldLength: number;
  commentLength: number;
  diskNumber: number;
  internalAttrs: number;
  externalAttrs: number;
  localHeaderOffset: number;
}

/**
 * End of central directory record structure
 */
export interface EndOfCentralDir {
  signature: number;
  diskNumber: number;
  centralDirDisk: number;
  centralDirRecords: number;
  totalRecords: number;
  centralDirSize: number;
  centralDirOffset: number;
  commentLength: number;
}

/**
 * ZIP file structure constants from core module
 * Using the SIGNATURE properties from the exported constants
 */
const LOCAL_FILE_HEADER_SIGNATURE = LOCAL_HDR.SIGNATURE; // 0x04034b50 "PK\03\04"
const CENTRAL_DIR_SIGNATURE = CENTRAL_DIR.SIGNATURE; // 0x02014b50 "PK\01\02"
const END_OF_CENTRAL_DIR_SIGNATURE = CENTRAL_END.SIGNATURE; // 0x06054b50 "PK\05\06"

/**
 * Read a 16-bit little-endian integer from buffer
 */
function readUInt16LE(buffer: Buffer, offset: number): number {
  return buffer.readUInt16LE(offset);
}

/**
 * Read a 32-bit little-endian integer from buffer
 */
function readUInt32LE(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset);
}

/**
 * Find the end of central directory record
 */
function findEndOfCentralDir(filePath: string): { offset: number; record: EndOfCentralDir; comment: Buffer } {
  const fd = fs.openSync(filePath, 'r');
  const stats = fs.fstatSync(fd);
  const fileSize = stats.size;
  
  // Search backwards from end of file (max 65535 + 22 bytes)
  const searchSize = Math.min(65535 + 22, fileSize);
  const buffer = Buffer.alloc(searchSize);
  fs.readSync(fd, buffer, 0, searchSize, fileSize - searchSize);
  fs.closeSync(fd);
  
  // Search backwards for end of central dir signature
  for (let i = searchSize - 22; i >= 0; i--) {
    if (readUInt32LE(buffer, i) === END_OF_CENTRAL_DIR_SIGNATURE) {
      const offset = fileSize - searchSize + i;
      const record: EndOfCentralDir = {
        signature: readUInt32LE(buffer, i),
        diskNumber: readUInt16LE(buffer, i + 4),
        centralDirDisk: readUInt16LE(buffer, i + 6),
        centralDirRecords: readUInt16LE(buffer, i + 8),
        totalRecords: readUInt16LE(buffer, i + 10),
        centralDirSize: readUInt32LE(buffer, i + 12),
        centralDirOffset: readUInt32LE(buffer, i + 16),
        commentLength: readUInt16LE(buffer, i + 20),
      };
      
      const comment = buffer.slice(i + 22, i + 22 + record.commentLength);
      
      return { offset, record, comment };
    }
  }
  
  throw new Error('End of central directory record not found');
}

/**
 * Read local file header
 */
function readLocalFileHeader(filePath: string, offset: number): { header: LocalFileHeader; filename: Buffer; extraField: Buffer; dataOffset: number } {
  const fd = fs.openSync(filePath, 'r');
  const headerBuffer = Buffer.alloc(30);
  fs.readSync(fd, headerBuffer, 0, 30, offset);
  
  const signature = readUInt32LE(headerBuffer, 0);
  if (signature !== LOCAL_FILE_HEADER_SIGNATURE) {
    fs.closeSync(fd);
    throw new Error(`Invalid local file header signature at offset ${offset}`);
  }
  
  const header: LocalFileHeader = {
    signature,
    version: readUInt16LE(headerBuffer, 4),
    flags: readUInt16LE(headerBuffer, 6),
    compression: readUInt16LE(headerBuffer, 8),
    modTime: readUInt16LE(headerBuffer, 10),
    modDate: readUInt16LE(headerBuffer, 12),
    crc32: readUInt32LE(headerBuffer, 14),
    compressedSize: readUInt32LE(headerBuffer, 18),
    uncompressedSize: readUInt32LE(headerBuffer, 22),
    filenameLength: readUInt16LE(headerBuffer, 26),
    extraFieldLength: readUInt16LE(headerBuffer, 28),
  };
  
  const filenameOffset = offset + 30;
  const extraFieldOffset = filenameOffset + header.filenameLength;
  const dataOffset = extraFieldOffset + header.extraFieldLength;
  
  const filename = Buffer.alloc(header.filenameLength);
  const extraField = Buffer.alloc(header.extraFieldLength);
  
  if (header.filenameLength > 0) {
    fs.readSync(fd, filename, 0, header.filenameLength, filenameOffset);
  }
  if (header.extraFieldLength > 0) {
    fs.readSync(fd, extraField, 0, header.extraFieldLength, extraFieldOffset);
  }
  
  fs.closeSync(fd);
  
  return { header, filename, extraField, dataOffset };
}

/**
 * Read central directory entry
 */
function readCentralDirEntry(filePath: string, offset: number): { entry: CentralDirEntry; filename: Buffer; extraField: Buffer; comment: Buffer; nextOffset: number } {
  const fd = fs.openSync(filePath, 'r');
  const entryBuffer = Buffer.alloc(46);
  fs.readSync(fd, entryBuffer, 0, 46, offset);
  
  const signature = readUInt32LE(entryBuffer, 0);
  if (signature !== CENTRAL_DIR_SIGNATURE) {
    fs.closeSync(fd);
    throw new Error(`Invalid central directory entry signature at offset ${offset}`);
  }
  
  const entry: CentralDirEntry = {
    signature,
    versionMadeBy: readUInt16LE(entryBuffer, 4),
    versionNeeded: readUInt16LE(entryBuffer, 6),
    flags: readUInt16LE(entryBuffer, 8),
    compression: readUInt16LE(entryBuffer, 10),
    modTime: readUInt16LE(entryBuffer, 12),
    modDate: readUInt16LE(entryBuffer, 14),
    crc32: readUInt32LE(entryBuffer, 16),
    compressedSize: readUInt32LE(entryBuffer, 20),
    uncompressedSize: readUInt32LE(entryBuffer, 24),
    filenameLength: readUInt16LE(entryBuffer, 28),
    extraFieldLength: readUInt16LE(entryBuffer, 30),
    commentLength: readUInt16LE(entryBuffer, 32),
    diskNumber: readUInt16LE(entryBuffer, 34),
    internalAttrs: readUInt16LE(entryBuffer, 36),
    externalAttrs: readUInt32LE(entryBuffer, 38),
    localHeaderOffset: readUInt32LE(entryBuffer, 42),
  };
  
  const filenameOffset = offset + 46;
  const extraFieldOffset = filenameOffset + entry.filenameLength;
  const commentOffset = extraFieldOffset + entry.extraFieldLength;
  const nextOffset = commentOffset + entry.commentLength;
  
  const filename = Buffer.alloc(entry.filenameLength);
  const extraField = Buffer.alloc(entry.extraFieldLength);
  const comment = Buffer.alloc(entry.commentLength);
  
  if (entry.filenameLength > 0) {
    fs.readSync(fd, filename, 0, entry.filenameLength, filenameOffset);
  }
  if (entry.extraFieldLength > 0) {
    fs.readSync(fd, extraField, 0, entry.extraFieldLength, extraFieldOffset);
  }
  if (entry.commentLength > 0) {
    fs.readSync(fd, comment, 0, entry.commentLength, commentOffset);
  }
  
  fs.closeSync(fd);
  
  return { entry, filename, extraField, comment, nextOffset };
}

/**
 * Copy a ZIP entry directly from source to destination
 * This copies the local file header + compressed data without decompression
 */
export function copyZipEntry(
  sourceZipPath: string,
  destZipFd: number,
  localHeaderOffset: number,
  compressedSize: number
): number {
  // Read local file header to get total header size
  const { header, filename, extraField, dataOffset } = readLocalFileHeader(sourceZipPath, localHeaderOffset);
  
  const localHeaderSize = 30 + header.filenameLength + header.extraFieldLength;
  const totalEntrySize = localHeaderSize + compressedSize;
  
  // Read the entire entry (header + compressed data) into a buffer
  const sourceFd = fs.openSync(sourceZipPath, 'r');
  const entryBuffer = Buffer.alloc(totalEntrySize);
  fs.readSync(sourceFd, entryBuffer, 0, totalEntrySize, localHeaderOffset);
  fs.closeSync(sourceFd);
  
  // Write to destination ZIP
  const bytesWritten = fs.writeSync(destZipFd, entryBuffer, 0, totalEntrySize);
  
  return bytesWritten;
}

/**
 * Copy central directory entry from source to destination
 */
export function copyCentralDirEntry(
  sourceZipPath: string,
  destZipFd: number,
  centralDirOffset: number,
  newLocalHeaderOffset: number
): { bytesWritten: number; nextOffset: number } {
  const { entry, filename, extraField, comment, nextOffset } = readCentralDirEntry(sourceZipPath, centralDirOffset);
  
  // Update the local header offset to point to the new location
  entry.localHeaderOffset = newLocalHeaderOffset;
  
  // Reconstruct the central directory entry with updated offset
  const entryBuffer = Buffer.alloc(46 + entry.filenameLength + entry.extraFieldLength + entry.commentLength);
  let pos = 0;
  
  entryBuffer.writeUInt32LE(entry.signature, pos); pos += 4;
  entryBuffer.writeUInt16LE(entry.versionMadeBy, pos); pos += 2;
  entryBuffer.writeUInt16LE(entry.versionNeeded, pos); pos += 2;
  entryBuffer.writeUInt16LE(entry.flags, pos); pos += 2;
  entryBuffer.writeUInt16LE(entry.compression, pos); pos += 2;
  entryBuffer.writeUInt16LE(entry.modTime, pos); pos += 2;
  entryBuffer.writeUInt16LE(entry.modDate, pos); pos += 2;
  entryBuffer.writeUInt32LE(entry.crc32, pos); pos += 4;
  entryBuffer.writeUInt32LE(entry.compressedSize, pos); pos += 4;
  entryBuffer.writeUInt32LE(entry.uncompressedSize, pos); pos += 4;
  entryBuffer.writeUInt16LE(entry.filenameLength, pos); pos += 2;
  entryBuffer.writeUInt16LE(entry.extraFieldLength, pos); pos += 2;
  entryBuffer.writeUInt16LE(entry.commentLength, pos); pos += 2;
  entryBuffer.writeUInt16LE(entry.diskNumber, pos); pos += 2;
  entryBuffer.writeUInt16LE(entry.internalAttrs, pos); pos += 2;
  entryBuffer.writeUInt32LE(entry.externalAttrs, pos); pos += 4;
  entryBuffer.writeUInt32LE(entry.localHeaderOffset, pos); pos += 4;
  
  filename.copy(entryBuffer, pos); pos += entry.filenameLength;
  extraField.copy(entryBuffer, pos); pos += entry.extraFieldLength;
  comment.copy(entryBuffer, pos); pos += entry.commentLength;
  
  const bytesWritten = fs.writeSync(destZipFd, entryBuffer);
  
  return { bytesWritten, nextOffset };
}

/**
 * Copy ZIP entries directly from source to destination
 * This is the main function that can be added to neozipkit
 * 
 * @param sourceZipPath - Path to source ZIP file
 * @param destZipPath - Path to destination ZIP file
 * @param entryFilter - Function to filter which entries to copy (returns true to include)
 * @returns Object with copied entry information
 */
export async function copyZipEntriesDirect(
  sourceZipPath: string,
  destZipPath: string,
  entryFilter?: (filename: string) => boolean
): Promise<{ entries: Array<{ filename: string; localHeaderOffset: number; compressedSize: number }>; centralDirOffset: number }> {
  // Find end of central directory
  const { offset: eocdOffset, record: eocd, comment: eocdComment } = findEndOfCentralDir(sourceZipPath);
  
  // Open destination file for writing
  const destFd = fs.openSync(destZipPath, 'w');
  let destOffset = 0;
  
  const copiedEntries: Array<{ filename: string; localHeaderOffset: number; compressedSize: number; centralDirOffset: number }> = [];
  const centralDirEntries: Array<{ sourceOffset: number; destOffset: number }> = [];
  
  // Read and copy central directory entries
  let centralDirOffset = eocd.centralDirOffset;
  for (let i = 0; i < eocd.totalRecords; i++) {
    const { entry, filename, nextOffset } = readCentralDirEntry(sourceZipPath, centralDirOffset);
    const filenameStr = filename.toString('utf8');
    
    // Apply filter if provided
    if (entryFilter && !entryFilter(filenameStr)) {
      centralDirOffset = nextOffset;
      continue;
    }
    
    // Copy the local file entry
    const localHeaderSize = 30 + entry.filenameLength + entry.extraFieldLength;
    const totalLocalSize = localHeaderSize + entry.compressedSize;
    
    const newLocalHeaderOffset = destOffset;
    const bytesWritten = copyZipEntry(sourceZipPath, destFd, entry.localHeaderOffset, entry.compressedSize);
    destOffset += bytesWritten;
    
    // Store for later central directory update
    centralDirEntries.push({
      sourceOffset: centralDirOffset,
      destOffset: destOffset, // Will be updated when we write central dir
    });
    
    copiedEntries.push({
      filename: filenameStr,
      localHeaderOffset: newLocalHeaderOffset,
      compressedSize: entry.compressedSize,
      centralDirOffset: destOffset, // Will be updated
    });
    
    centralDirOffset = nextOffset;
  }
  
  // Write central directory entries with updated offsets
  const centralDirStartOffset = destOffset;
  for (let i = 0; i < centralDirEntries.length; i++) {
    const { sourceOffset } = centralDirEntries[i];
    const { localHeaderOffset } = copiedEntries[i];
    
    const result = copyCentralDirEntry(sourceZipPath, destFd, sourceOffset, localHeaderOffset);
    copiedEntries[i].centralDirOffset = destOffset;
    destOffset += result.bytesWritten;
  }
  
  const centralDirSize = destOffset - centralDirStartOffset;
  
  // Write end of central directory record
  const eocdBuffer = Buffer.alloc(22 + eocd.commentLength);
  let pos = 0;
  eocdBuffer.writeUInt32LE(END_OF_CENTRAL_DIR_SIGNATURE, pos); pos += 4;
  eocdBuffer.writeUInt16LE(eocd.diskNumber, pos); pos += 2;
  eocdBuffer.writeUInt16LE(eocd.centralDirDisk, pos); pos += 2;
  eocdBuffer.writeUInt16LE(copiedEntries.length, pos); pos += 2; // Updated count
  eocdBuffer.writeUInt16LE(copiedEntries.length, pos); pos += 2; // Updated total
  eocdBuffer.writeUInt32LE(centralDirSize, pos); pos += 4; // Updated size
  eocdBuffer.writeUInt32LE(centralDirStartOffset, pos); pos += 4; // Updated offset
  eocdBuffer.writeUInt16LE(eocd.commentLength, pos); pos += 2;
  eocdComment.copy(eocdBuffer, pos);
  
  fs.writeSync(destFd, eocdBuffer);
  
  fs.closeSync(destFd);
  
  return {
    entries: copiedEntries.map(e => ({
      filename: e.filename,
      localHeaderOffset: e.localHeaderOffset,
      compressedSize: e.compressedSize,
    })),
    centralDirOffset: centralDirStartOffset,
  };
}

/**
 * Convert Unix timestamp to DOS date/time format
 */
function unixToDosDateTime(unixTimestamp: number): { date: number; time: number } {
  const date = new Date(unixTimestamp * 1000);
  const dosTime = ((date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2))) & 0xFFFF;
  const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xFFFF;
  return { date: dosDate, time: dosTime };
}

/**
 * Append a new entry to an existing ZIP file
 * This function adds a local file header + data, then updates the central directory
 * 
 * @param zipPath - Path to existing ZIP file
 * @param entryData - Buffer containing the uncompressed entry data
 * @param filename - Filename for the entry
 * @param compressionMethod - Compression method (0 = STORED, 8 = DEFLATE, etc.)
 * @param timestamp - Optional Unix timestamp (seconds since epoch) for the entry. If not provided, uses current time.
 * @returns Object with new entry offsets
 */
export function appendEntryToZip(
  zipPath: string,
  entryData: Buffer,
  filename: string,
  compressionMethod: number = 0,
  timestamp?: number
): { localHeaderOffset: number; centralDirOffset: number } {
  // Find end of central directory
  const { offset: eocdOffset, record: eocd } = findEndOfCentralDir(zipPath);
  
  const fd = fs.openSync(zipPath, 'r+');
  
  // Calculate CRC32 (for stored entries, CRC32 of the data)
  const entryCrc32 = crc32(entryData) >>> 0;
  
  // For stored compression, compressed size = uncompressed size
  const compressedSize = compressionMethod === 0 ? entryData.length : entryData.length; // TODO: handle compression
  const uncompressedSize = entryData.length;
  
  // Get timestamp for file entry (use provided timestamp or current time)
  const entryTimestamp = timestamp !== undefined ? timestamp : Math.floor(Date.now() / 1000);
  const { date: dosDate, time: dosTime } = unixToDosDateTime(entryTimestamp);
  
  const filenameBuffer = Buffer.from(filename, 'utf8');
  const filenameLength = filenameBuffer.length;
  const extraFieldLength = 0;
  
  // Write local file header
  const localHeaderSize = 30 + filenameLength + extraFieldLength;
  const localHeaderBuffer = Buffer.alloc(localHeaderSize);
  let pos = 0;
  
  localHeaderBuffer.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, pos); pos += 4;
  localHeaderBuffer.writeUInt16LE(20, pos); pos += 2; // version needed to extract
  localHeaderBuffer.writeUInt16LE(0, pos); pos += 2; // flags
  localHeaderBuffer.writeUInt16LE(compressionMethod, pos); pos += 2;
  localHeaderBuffer.writeUInt16LE(dosTime, pos); pos += 2;
  localHeaderBuffer.writeUInt16LE(dosDate, pos); pos += 2;
  localHeaderBuffer.writeUInt32LE(entryCrc32, pos); pos += 4;
  localHeaderBuffer.writeUInt32LE(compressedSize, pos); pos += 4;
  localHeaderBuffer.writeUInt32LE(uncompressedSize, pos); pos += 4;
  localHeaderBuffer.writeUInt16LE(filenameLength, pos); pos += 2;
  localHeaderBuffer.writeUInt16LE(extraFieldLength, pos); pos += 2;
  filenameBuffer.copy(localHeaderBuffer, pos); pos += filenameLength;
  
  // Read the existing central directory and end of central dir to preserve them
  const existingCentralDirSize = eocd.centralDirSize;
  const existingCentralDirOffset = eocd.centralDirOffset;
  const existingCentralDir = Buffer.alloc(existingCentralDirSize);
  fs.readSync(fd, existingCentralDir, 0, existingCentralDirSize, existingCentralDirOffset);
  
  // Read existing end of central dir comment
  const existingComment = Buffer.alloc(eocd.commentLength);
  if (eocd.commentLength > 0) {
    fs.readSync(fd, existingComment, 0, eocd.commentLength, eocdOffset + 22);
  }
  
  const newLocalHeaderOffset = eocdOffset;
  const entryTotalSize = localHeaderSize + entryData.length;
  
  // Write local header + data before end of central dir (overwrites old EOCD temporarily)
  fs.writeSync(fd, localHeaderBuffer, 0, localHeaderSize, eocdOffset);
  fs.writeSync(fd, entryData, 0, entryData.length, eocdOffset + localHeaderSize);
  
  // Write existing central directory after the new entry
  const newCentralDirOffset = eocdOffset + entryTotalSize;
  fs.writeSync(fd, existingCentralDir, 0, existingCentralDirSize, newCentralDirOffset);
  
  // Write new central directory entry after existing central directory
  const centralDirEntrySize = 46 + filenameLength + extraFieldLength;
  const centralDirBuffer = Buffer.alloc(centralDirEntrySize);
  pos = 0;
  
  centralDirBuffer.writeUInt32LE(CENTRAL_DIR_SIGNATURE, pos); pos += 4;
  centralDirBuffer.writeUInt16LE(20, pos); pos += 2; // version made by
  centralDirBuffer.writeUInt16LE(20, pos); pos += 2; // version needed
  centralDirBuffer.writeUInt16LE(0, pos); pos += 2; // flags
  centralDirBuffer.writeUInt16LE(compressionMethod, pos); pos += 2;
  centralDirBuffer.writeUInt16LE(dosTime, pos); pos += 2;
  centralDirBuffer.writeUInt16LE(dosDate, pos); pos += 2;
  centralDirBuffer.writeUInt32LE(entryCrc32, pos); pos += 4;
  centralDirBuffer.writeUInt32LE(compressedSize, pos); pos += 4;
  centralDirBuffer.writeUInt32LE(uncompressedSize, pos); pos += 4;
  centralDirBuffer.writeUInt16LE(filenameLength, pos); pos += 2;
  centralDirBuffer.writeUInt16LE(extraFieldLength, pos); pos += 2;
  centralDirBuffer.writeUInt16LE(0, pos); pos += 2; // comment length
  centralDirBuffer.writeUInt16LE(0, pos); pos += 2; // disk number
  centralDirBuffer.writeUInt16LE(0, pos); pos += 2; // internal attrs
  centralDirBuffer.writeUInt32LE(0, pos); pos += 4; // external attrs
  centralDirBuffer.writeUInt32LE(newLocalHeaderOffset, pos); pos += 4;
  filenameBuffer.copy(centralDirBuffer, pos); pos += filenameLength;
  
  const newCentralDirEndOffset = newCentralDirOffset + existingCentralDirSize;
  fs.writeSync(fd, centralDirBuffer, 0, centralDirEntrySize, newCentralDirEndOffset);
  
  // Update end of central directory
  const newEocdOffset = newCentralDirEndOffset + centralDirEntrySize;
  const newTotalRecords = eocd.totalRecords + 1;
  const newCentralDirSize = existingCentralDirSize + centralDirEntrySize;
  
  const eocdBuffer = Buffer.alloc(22 + eocd.commentLength);
  pos = 0;
  eocdBuffer.writeUInt32LE(END_OF_CENTRAL_DIR_SIGNATURE, pos); pos += 4;
  eocdBuffer.writeUInt16LE(eocd.diskNumber, pos); pos += 2;
  eocdBuffer.writeUInt16LE(eocd.centralDirDisk, pos); pos += 2;
  eocdBuffer.writeUInt16LE(newTotalRecords, pos); pos += 2;
  eocdBuffer.writeUInt16LE(newTotalRecords, pos); pos += 2;
  eocdBuffer.writeUInt32LE(newCentralDirSize, pos); pos += 4;
  eocdBuffer.writeUInt32LE(newCentralDirOffset, pos); pos += 4;
  eocdBuffer.writeUInt16LE(eocd.commentLength, pos); pos += 2;
  
  // Copy original comment if any
  if (eocd.commentLength > 0) {
    existingComment.copy(eocdBuffer, pos);
  }
  
  fs.writeSync(fd, eocdBuffer, 0, eocdBuffer.length, newEocdOffset);
  
  fs.closeSync(fd);
  
  return {
    localHeaderOffset: newLocalHeaderOffset,
    centralDirOffset: newCentralDirOffset,
  };
}
