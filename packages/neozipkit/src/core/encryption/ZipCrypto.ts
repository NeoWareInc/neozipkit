/**
 * Traditional ZIP Crypto encryption implementation
 * Compatible with standard ZIP 2.0 encryption (ZipCrypto)
 */

import { EncryptionProvider, EncryptionOptions, EncryptionResult, DecryptionResult, EncryptionMethod } from './types';
import ZipEntry from '../ZipEntry';
import { Logger } from '../components/Logger';
import { GP_FLAG, ENCRYPT_HDR_SIZE } from '../constants/Headers';
import { randomBytes } from 'crypto';

export class ZipCrypto implements EncryptionProvider {
  private static readonly KEY_LENGTH = 3; // 24 bits for traditional ZIP crypto

  canHandle(method: EncryptionMethod): boolean {
    return method === EncryptionMethod.ZIP_CRYPTO;
  }

  getMethodName(): string {
    return 'ZIP-Crypto';
  }

  getKeyLength(): number {
    return ZipCrypto.KEY_LENGTH;
  }

  async encrypt(data: Buffer, options: EncryptionOptions): Promise<EncryptionResult> {
    try {
      if (options.method !== EncryptionMethod.ZIP_CRYPTO) {
        return {
          success: false,
          error: 'ZIP-Crypto encryption method required'
        };
      }

      // Initialize keys from password
      const keys = this.initKeys(options.password);
      
      // Encrypt data using traditional ZIP crypto
      const encryptedData = Buffer.alloc(data.length);
      
      for (let i = 0; i < data.length; i++) {
        const byte = data[i];
        const encryptedByte = this.encryptByte(keys, byte);
        encryptedData[i] = encryptedByte;
        this.updateKeys(keys, byte);
      }

      return {
        success: true,
        encryptedData: encryptedData
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown encryption error'
      };
    }
  }

  async decrypt(data: Buffer, options: EncryptionOptions): Promise<DecryptionResult> {
    try {
      if (options.method !== EncryptionMethod.ZIP_CRYPTO) {
        return {
          success: false,
          error: 'ZIP-Crypto decryption method required'
        };
      }

      // Initialize keys from password
      const keys = this.initKeys(options.password);
      
      // Decrypt data using traditional ZIP crypto
      const decryptedData = Buffer.alloc(data.length);
      
      for (let i = 0; i < data.length; i++) {
        const encryptedByte = data[i];
        const decryptedByte = this.decryptByte(keys, encryptedByte);
        decryptedData[i] = decryptedByte;
        this.updateKeys(keys, decryptedByte);
      }

      return {
        success: true,
        decryptedData: decryptedData
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown decryption error'
      };
    }
  }

  /**
   * Verify password using check byte from decrypted header
   * @param decryptedHeader - 12-byte decrypted encryption header
   * @param checkByte - Expected check byte value
   * @throws Error if password verification fails
   */
  verifyPassword(decryptedHeader: Buffer, checkByte: number): void {
    if (decryptedHeader.length < 12) {
      throw new Error('Decrypted header must be at least 12 bytes');
    }
    
    // Verify check byte (11th byte, 0-indexed)
    if (decryptedHeader[11] !== checkByte) {
      throw new Error('Password verification FAILED');
    }
  }

  /**
   * Parse local header to extract information needed for decryption
   * @param localHeaderBuffer - 30-byte local header buffer
   * @param entry - ZIP entry to update with extracted information
   * @returns Object with bitFlags, lastModTimeDate, localCrc, and checkByte
   */
  parseLocalHeaderForDecryption(localHeaderBuffer: Buffer, entry: ZipEntry): {
    bitFlags: number;
    lastModTimeDate: number;
    localCrc: number;
    checkByte: number;
  } {
    // Verify signature
    if (localHeaderBuffer.readUInt32LE(0) !== 0x04034b50) {
      throw new Error('Invalid local header signature');
    }

    // Read bit flags, lastModTimeDate, and CRC from local header
    const bitFlags = localHeaderBuffer.readUInt16LE(6);
    const lastModTimeDate = localHeaderBuffer.readUInt32LE(10);
    const localCrc = localHeaderBuffer.readUInt32LE(14);

    // Store lastModTimeDate in entry if DATA_DESC flag is set
    if ((bitFlags & GP_FLAG.DATA_DESC) && (!(entry as any).lastModTimeDate || (entry as any).lastModTimeDate === 0)) {
      (entry as any).lastModTimeDate = lastModTimeDate;
    }

    // Store local CRC for check byte calculation
    (entry as any).localCrc = localCrc;

    // Calculate check byte
    let checkByte: number;
    if (bitFlags & GP_FLAG.DATA_DESC) {
      const timeDate = (entry as any).lastModTimeDate || entry.timeDateDOS || 0;
      checkByte = (timeDate >> 8) & 0xff;
    } else {
      const crc = localCrc && localCrc !== 0 ? localCrc : entry.crc;
      checkByte = (crc >> 24) & 0xff;
    }

    return { bitFlags, lastModTimeDate, localCrc, checkByte };
  }

  /**
   * Create encryption header (12 bytes) for PKZIP encryption
   * Generates 11 random bytes + 1 check byte
   * @param entry - ZIP entry to create header for
   * @param password - Password for encryption (used to calculate check byte)
   * @returns 12-byte encryption header buffer
   */
  createEncryptionHeader(entry: ZipEntry, password: string): Buffer {
    const header = Buffer.alloc(ENCRYPT_HDR_SIZE);
    
    // Generate 11 random bytes (bytes 0-10)
    const random = randomBytes(11);
    random.copy(header, 0);
    
    // Calculate check byte (byte 11)
    // For DATA_DESC files: use lastModTimeDate >> 8
    // For regular files: use CRC >> 24
    let checkByte: number;
    if ((entry.bitFlags & GP_FLAG.DATA_DESC) !== 0) {
      const timeDate = entry.lastModTimeDate || entry.timeDateDOS || 0;
      checkByte = (timeDate >> 8) & 0xff;
    } else {
      // Use CRC from entry (should be calculated before encryption)
      checkByte = (entry.crc >> 24) & 0xff;
    }
    
    // Set check byte (11th byte, 0-indexed)
    header[11] = checkByte;
    
    Logger.debug(`[ZipCrypto] Created encryption header: checkByte=0x${checkByte.toString(16).padStart(2, '0')}, DATA_DESC=${(entry.bitFlags & GP_FLAG.DATA_DESC) !== 0}`);
    
    return header;
  }

  /**
   * Encrypt buffer (header + compressed data) for PKZIP encryption
   * Creates encryption header, concatenates with compressed data, and encrypts everything
   * @param entry - ZIP entry to encrypt
   * @param compressedData - Compressed data to encrypt
   * @param password - Password for encryption
   * @returns Encrypted buffer (encrypted header + encrypted compressed data)
   */
  encryptBuffer(entry: ZipEntry, compressedData: Buffer, password: string): Buffer {
    // Create 12-byte encryption header
    const header = this.createEncryptionHeader(entry, password);
    
    // Concatenate header + compressed data
    const dataToEncrypt = Buffer.concat([header, compressedData]);
    
    // Initialize encryption keys from password
    const keys = this.initKeys(password);
    
    // Encrypt the entire buffer (header + compressed data) maintaining key state
    // This ensures keys are updated correctly throughout encryption
    const encryptedData = Buffer.alloc(dataToEncrypt.length);
    
    for (let i = 0; i < dataToEncrypt.length; i++) {
      const byte = dataToEncrypt[i];
      const encryptedByte = this.encryptByte(keys, byte);
      encryptedData[i] = encryptedByte;
      // Update keys after each byte - state must be maintained across the entire buffer
      this.updateKeys(keys, byte);
    }
    
    Logger.debug(`[ZipCrypto] Encrypted buffer: ${compressedData.length} bytes compressed data + ${ENCRYPT_HDR_SIZE} bytes header = ${encryptedData.length} bytes total`);
    
    return encryptedData;
  }

  /**
   * Decrypt buffer-based encrypted data (for in-memory extraction)
   * Handles local header parsing, encryption header extraction, and decryption
   * @param entry - ZIP entry with encryption information
   * @param buffer - Full ZIP file buffer
   * @param encryptedData - Encrypted data without header (from parseLocalHeader)
   * @param password - Password for decryption
   * @returns Decrypted compressed data (without header)
   */
  decryptBuffer(entry: ZipEntry, buffer: Buffer, encryptedData: Buffer, password: string): Buffer {
    // Read local header to get lastModTimeDate for DATA_DESC files (needed for check byte)
    const localData = buffer.subarray(entry.localHdrOffset);
    const localHeaderBuffer = localData.subarray(0, 30);

    // Parse local header to extract decryption info
    const { bitFlags, localCrc, checkByte } = this.parseLocalHeaderForDecryption(localHeaderBuffer, entry);

    // Extract the 12-byte encryption header
    // parseLocalHeader returns data WITHOUT the 12-byte encryption header
    // We need to prepend the header before decrypting so keys are updated correctly
    const fnameLen = localHeaderBuffer.readUInt16LE(26);
    const extraLen = localHeaderBuffer.readUInt16LE(28);
    const localSize = 30 + fnameLen + extraLen;
    const ENCRYPT_HDR_SIZE = 12;
    const encryptHeader = localData.subarray(localSize, localSize + ENCRYPT_HDR_SIZE);

    // Prepend the header to the encrypted data
    const encryptedDataWithHeader = Buffer.concat([encryptHeader, encryptedData]);

    // Decrypt the full data (header + compressed data) in one pass
    // This ensures keys are updated correctly throughout the decryption
    // MEMORY EFFICIENCY: Decrypt in-place into encryptedDataWithHeader (no new allocation)
    const keys = this.initKeys(password);

    for (let i = 0; i < encryptedDataWithHeader.length; i++) {
      const encryptedByte = encryptedDataWithHeader[i];
      const decryptedByte = this.decryptByte(keys, encryptedByte);
      encryptedDataWithHeader[i] = decryptedByte;
      this.updateKeys(keys, decryptedByte);
    }

    // Extract the decrypted header (first 12 bytes) for password verification
    // encryptedDataWithHeader now contains decrypted data
    const decryptedHeader = encryptedDataWithHeader.subarray(0, ENCRYPT_HDR_SIZE);

    // Verify password using check byte
    this.verifyPassword(decryptedHeader, checkByte);

    // Skip the decrypted header (first 12 bytes) and return only the decrypted compressed data
    return encryptedDataWithHeader.subarray(ENCRYPT_HDR_SIZE);
  }

  /**
   * Create a streaming decryptor for chunked data processing
   * Handles 12-byte header decryption and verification, then yields decrypted chunks
   * 
   * MEMORY EFFICIENCY: This method processes encrypted data one block at a time.
   * - Decryption state (keys) is maintained across blocks via updateKeys()
   * - Only the minimum 12-byte header is accumulated before password verification
   * - Each decrypted block is yielded immediately without accumulation
   * 
   * @param password - Password for decryption
   * @param checkByte - Expected check byte value for password verification
   * @param encryptedStream - Async generator of encrypted data chunks (one block at a time)
   * @returns Async generator of decrypted data chunks (one block at a time)
   */
  async *createStreamDecryptor(
    password: string,
    checkByte: number,
    encryptedStream: AsyncGenerator<Buffer>
  ): AsyncGenerator<Buffer> {
    // Initialize keys from password - state maintained across all blocks
    const keys = this.initKeys(password);
    
    // Process 12-byte encryption header incrementally (minimum accumulation)
    const ENCRYPT_HDR_SIZE = 12;
    const headerBuffer = Buffer.alloc(ENCRYPT_HDR_SIZE);
    let headerBytesCollected = 0;
    let currentChunk: Buffer | null = null;
    let currentChunkOffset = 0;
    
    // Read chunks incrementally until we have exactly 12 bytes for header
    // This minimizes memory usage by only accumulating the necessary header bytes
    while (headerBytesCollected < ENCRYPT_HDR_SIZE) {
      // Get next chunk if current chunk is exhausted
      if (!currentChunk || currentChunkOffset >= currentChunk.length) {
        const result = await encryptedStream.next();
        
        if (result.done || !result.value) {
          throw new Error('ZIP-Crypto: insufficient encrypted data (missing encryption header)');
        }
        
        currentChunk = result.value;
        currentChunkOffset = 0;
      }
      
      // Copy bytes from current chunk to header buffer
      const bytesNeeded = ENCRYPT_HDR_SIZE - headerBytesCollected;
      const bytesToCopy = Math.min(bytesNeeded, currentChunk.length - currentChunkOffset);
      
      currentChunk.copy(headerBuffer, headerBytesCollected, currentChunkOffset, currentChunkOffset + bytesToCopy);
      headerBytesCollected += bytesToCopy;
      currentChunkOffset += bytesToCopy;
    }
    
    // Decrypt the 12-byte encryption header byte-by-byte
    // This maintains proper key state for subsequent decryption
    // MEMORY EFFICIENCY: Decrypt in-place into headerBuffer (no new allocation)
    for (let i = 0; i < ENCRYPT_HDR_SIZE; i++) {
      const encryptedByte = headerBuffer[i];
      const decryptedByte = this.decryptByte(keys, encryptedByte) & 0xff;
      headerBuffer[i] = decryptedByte;
      // Update keys after each byte - state must be maintained across blocks
      this.updateKeys(keys, decryptedByte);
    }
    
    // Verify password using check byte (11th byte of decrypted header)
    // headerBuffer now contains decrypted header data
    this.verifyPassword(headerBuffer, checkByte);
    
    // Process remaining data from the first chunk (after header) if any
    // This ensures we decrypt and yield data immediately without accumulating
    // MEMORY EFFICIENCY: Decrypt in-place into currentChunk buffer (no new allocation)
    if (currentChunk && currentChunkOffset < currentChunk.length) {
      const remainingInChunk = currentChunk.length - currentChunkOffset;
      
      for (let i = 0; i < remainingInChunk; i++) {
        const pos = currentChunkOffset + i;
        const encryptedByte = currentChunk[pos];
        const decryptedByte = this.decryptByte(keys, encryptedByte);
        currentChunk[pos] = decryptedByte;
        // Maintain state across bytes - keys updated for next block
        this.updateKeys(keys, decryptedByte);
      }
      
      // Yield subarray of currentChunk (already decrypted in-place)
      yield currentChunk.subarray(currentChunkOffset);
    }
    
    // Process remaining chunks one at a time - decrypt and yield immediately
    // Decryption state (keys) continues across blocks via updateKeys()
    // MEMORY EFFICIENCY: Decrypt in-place into encryptedChunk buffer (no new allocation)
    for await (const encryptedChunk of encryptedStream) {
      
      // Decrypt each byte in-place, maintaining state across bytes
      for (let i = 0; i < encryptedChunk.length; i++) {
        const encryptedByte = encryptedChunk[i];
        const decryptedByte = this.decryptByte(keys, encryptedByte);
        encryptedChunk[i] = decryptedByte;
        // Update keys after each byte - ensures state continues correctly across blocks
        this.updateKeys(keys, decryptedByte);
      }
      
      // Yield the same buffer (now containing decrypted data) - no accumulation
      yield encryptedChunk;
    }
  }

  /**
   * Initialize encryption keys from password
   */
  private initKeys(password: string): number[] {
    const keys = [0x12345678, 0x23456789, 0x34567890];
    
    for (let i = 0; i < password.length; i++) {
      this.updateKeys(keys, password.charCodeAt(i));
    }
    
    return keys;
  }

  /**
   * Update encryption keys with a byte
   * Based on zip.js implementation - uses Math.imul for 32-bit integer multiplication
   */
  private updateKeys(keys: number[], byte: number): void {
    keys[0] = ((keys[0] >>> 8) ^ ZipCrypto.CRC_TABLE[(keys[0] ^ byte) & 0xff]) >>> 0;
    // Use Math.imul for multiplication (matches zip.js) and 0x08088405 constant
    keys[1] = ((Math.imul(keys[1] + (keys[0] & 0xff), 0x08088405) + 1) & 0xFFFFFFFF) >>> 0;
    keys[2] = ((keys[2] >>> 8) ^ ZipCrypto.CRC_TABLE[(keys[2] ^ (keys[1] >>> 24)) & 0xff]) >>> 0;
  }

  /**
   * Encrypt a single byte
   * Based on zip.js implementation - uses Math.imul for 32-bit integer multiplication
   */
  private encryptByte(keys: number[], byte: number): number {
    const temp = keys[2] | 2;
    // Use Math.imul like zip.js and mask with 0xFF
    return (byte ^ (Math.imul(temp, (temp ^ 1)) >>> 8)) & 0xFF;
  }

  /**
   * Decrypt a single byte
   * Based on zip.js implementation - uses Math.imul for 32-bit integer multiplication
   */
  private decryptByte(keys: number[], encryptedByte: number): number {
    const temp = keys[2] | 2;
    // Use Math.imul like zip.js and mask with 0xFF
    return (encryptedByte ^ (Math.imul(temp, (temp ^ 1)) >>> 8)) & 0xFF;
  }

  /**
   * CRC32 lookup table (shared for all CRC32 operations)
   */
  static readonly CRC_TABLE = [
    0x00000000, 0x77073096, 0xee0e612c, 0x990951ba, 0x076dc419, 0x706af48f,
    0xe963a535, 0x9e6495a3, 0x0edb8832, 0x79dcb8a4, 0xe0d5e91e, 0x97d2d988,
    0x09b64c2b, 0x7eb17cbd, 0xe7b82d07, 0x90bf1d91, 0x1db71064, 0x6ab020f2,
    0xf3b97148, 0x84be41de, 0x1adad47d, 0x6ddde4eb, 0xf4d4b551, 0x83d385c7,
    0x136c9856, 0x646ba8c0, 0xfd62f97a, 0x8a65c9ec, 0x14015c4f, 0x63066cd9,
    0xfa0f3d63, 0x8d080df5, 0x3b6e20c8, 0x4c69105e, 0xd56041e4, 0xa2677172,
    0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b, 0x35b5a8fa, 0x42b2986c,
    0xdbbbc9d6, 0xacbcf940, 0x32d86ce3, 0x45df5c75, 0xdcd60dcf, 0xabd13d59,
    0x26d930ac, 0x51de003a, 0xc8d75180, 0xbfd06116, 0x21b4f4b5, 0x56b3c423,
    0xcfba9599, 0xb8bda50f, 0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924,
    0x2f6f7c87, 0x58684c11, 0xc1611dab, 0xb6662d3d, 0x76dc4190, 0x01db7106,
    0x98d220bc, 0xefd5102a, 0x71b18589, 0x06b6b51f, 0x9fbfe4a5, 0xe8b8d433,
    0x7807c9a2, 0x0f00f934, 0x9609a88e, 0xe10e9818, 0x7f6a0dbb, 0x086d3d2d,
    0x91646c97, 0xe6635c01, 0x6b6b51f4, 0x1c6c6162, 0x856530d8, 0xf262004e,
    0x6c0695ed, 0x1b01a57b, 0x8208f4c1, 0xf50fc457, 0x65b0d9c6, 0x12b7e950,
    0x8bbeb8ea, 0xfcb9887c, 0x62dd1ddf, 0x15da2d49, 0x8cd37cf3, 0xfbd44c65,
    0x4db26158, 0x3ab551ce, 0xa3bc0074, 0xd4bb30e2, 0x4adfa541, 0x3dd895d7,
    0xa4d1c46d, 0xd3d6f4fb, 0x4369e96a, 0x346ed9fc, 0xad678846, 0xda60b8d0,
    0x44042d73, 0x33031de5, 0xaa0a4c5f, 0xdd0d7cc9, 0x5005713c, 0x270241aa,
    0xbe0b1010, 0xc90c2086, 0x5768b525, 0x206f85b3, 0xb966d409, 0xce61e49f,
    0x5edef90e, 0x29d9c998, 0xb0d09822, 0xc7d7a8b4, 0x59b33d17, 0x2eb40d81,
    0xb7bd5c3b, 0xc0ba6cad, 0xedb88320, 0x9abfb3b6, 0x03b6e20c, 0x74b1d29a,
    0xead54739, 0x9dd277af, 0x04db2615, 0x73dc1683, 0xe3630b12, 0x94643b84,
    0x0d6d6a3e, 0x7a6a5aa8, 0xe40ecf0b, 0x9309ff9d, 0x0a00ae27, 0x7d079eb1,
    0xf00f9344, 0x8708a3d2, 0x1e01f268, 0x6906c2fe, 0xf762575d, 0x806567cb,
    0x196c3671, 0x6e6b06e7, 0xfed41b76, 0x89d32be0, 0x10da7a5a, 0x67dd4acc,
    0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5, 0xd6d6a3e8, 0xa1d1937e,
    0x38d8c2c4, 0x4fdff252, 0xd1bb67f1, 0xa6bc5767, 0x3fb506dd, 0x48b2364b,
    0xd80d2bda, 0xaf0a1b4c, 0x36034af6, 0x41047a60, 0xdf60efc3, 0xa867df55,
    0x316e8eef, 0x4669be79, 0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236,
    0xcc0c7795, 0xbb0b4703, 0x220216b9, 0x5505262f, 0xc5ba3bbe, 0xb2bd0b28,
    0x2bb45a92, 0x5cb36a04, 0xc2d7ffa7, 0xb5d0cf31, 0x2cd99e8b, 0x5bdeae1d,
    0x9b64c2b0, 0xec63f226, 0x756aa39c, 0x026d930a, 0x9c0906a9, 0xeb0e363f,
    0x72076785, 0x05005713, 0x95bf4a82, 0xe2b87a14, 0x7bb12bae, 0x0cb61b38,
    0x92d28e9b, 0xe5d5be0d, 0x7cdcefb7, 0x0bdbdf21, 0x86d3d2d4, 0xf1d4e242,
    0x68ddb3f8, 0x1fda836e, 0x81be16cd, 0xf6b9265b, 0x6fb077e1, 0x18b74777,
    0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c, 0x8f659eff, 0xf862ae69,
    0x616bffd3, 0x166ccf45, 0xa00ae278, 0xd70dd2ee, 0x4e048354, 0x3903b3c2,
    0xa7672661, 0xd06016f7, 0x4969474d, 0x3e6e77db, 0xaed16a4a, 0xd9d65adc,
    0x40df0b66, 0x37d83bf0, 0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9,
    0xbdbdf21c, 0xcabac28a, 0x53b39330, 0x24b4a3a6, 0xbad03605, 0xcdd70693,
    0x54de5729, 0x23d967bf, 0xb3667a2e, 0xc4614ab8, 0x5d681b02, 0x2a6f2b94,
    0xb40bbe37, 0xc30c8ea1, 0x5a05df1b, 0x2d02ef8d
  ];

  /**
   * CRC32 implementation for ZIP crypto (single byte update)
   * Used internally for key updates during encryption/decryption
   */
  private crc32(crc: number, byte: number): number {
    return ((crc >>> 8) ^ ZipCrypto.CRC_TABLE[(crc ^ byte) & 0xff]) >>> 0;
  }

  /**
   * Static CRC32 calculation for a full buffer
   * Delegates to exported crc32() function
   * @param buf - Buffer or string to calculate CRC32 for
   * @returns CRC32 checksum as unsigned 32-bit integer
   */
  static crc32(buf: Buffer | string): number {
    return crc32Impl(buf);
  }

  /**
   * Static CRC32 incremental update (single byte)
   * Delegates to exported crc32update() function
   * @param crc - Current CRC32 value
   * @param byte - Byte to update with
   * @returns Updated CRC32 value
   */
  static crc32update(crc: number, byte: number): number {
    return crc32updateImpl(crc, byte);
  }
}

/**
 * CRC32 calculation for a full buffer
 * Main public API for CRC32 calculation
 * @param buf - Buffer or string to calculate CRC32 for
 * @returns CRC32 checksum as unsigned 32-bit integer
 */
function crc32Impl(buf: Buffer | string): number {
  if (typeof buf === "string") {
    buf = Buffer.from(buf, "utf8");
  }
  
  let len = buf.length;
  let crc = ~0;
  for (let off = 0; off < len; ) {
    crc = ZipCrypto.CRC_TABLE[(crc ^ buf[off++]) & 0xff] ^ (crc >>> 8);
  }
  
  // Finalize: xor with ~0 and cast as uint32
  return ~crc >>> 0;
}

/**
 * CRC32 incremental update (single byte)
 * Used for streaming CRC32 calculation
 * @param crc - Current CRC32 value
 * @param byte - Byte to update with
 * @returns Updated CRC32 value
 */
function crc32updateImpl(crc: number, byte: number): number {
  return ZipCrypto.CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
}

/**
 * CRC32 calculation for a full buffer
 * Main public API for CRC32 calculation
 * @param buf - Buffer or string to calculate CRC32 for
 * @returns CRC32 checksum as unsigned 32-bit integer
 */
export function crc32(buf: Buffer | string): number {
  return crc32Impl(buf);
}

/**
 * CRC32 incremental update (single byte)
 * Used for streaming CRC32 calculation
 * @param crc - Current CRC32 value
 * @param byte - Byte to update with
 * @returns Updated CRC32 value
 */
export function crc32update(crc: number, byte: number): number {
  return crc32updateImpl(crc, byte);
}

// Cryptographic utility functions
import { createHash } from 'crypto';

// Return the SHA256 hash of a buffer
export function sha256(data: Buffer): string {
  const hash = createHash('sha256');
  return hash
    .update(data)
    .digest('hex');
}

/**
 * Options for creating a DecryptionStream
 */
export interface DecryptionStreamOptions {
  password: string;
  method: EncryptionMethod;
  entry: ZipEntry;
}

/**
 * Streaming decryption for chunked compressed data processing
 * Encapsulated within ZipCrypto for PKZIP decryption
 */
export class DecryptionStream {
  private password: string;
  private method: EncryptionMethod;
  private entry: ZipEntry;
  private zipCrypto: ZipCrypto;

  constructor(options: DecryptionStreamOptions) {
    this.password = options.password;
    this.method = options.method;
    this.entry = options.entry;
    this.zipCrypto = new ZipCrypto();
  }

  /**
   * Decrypt compressed data stream chunk by chunk
   */
  async *decrypt(encryptedStream: AsyncGenerator<Buffer>): AsyncGenerator<Buffer> {
    if (this.method !== EncryptionMethod.ZIP_CRYPTO) {
      throw new Error(`Unsupported encryption method: ${this.method}`);
    }

    // Calculate check byte based on entry
    const checkByte = this.calculateCheckByte();
    
    // Use ZipCrypto's streaming decryptor
    yield* this.zipCrypto.createStreamDecryptor(this.password, checkByte, encryptedStream);
  }

  /**
   * Calculate check byte for password verification
   * For DATA_DESC files: lastModTimeDate >> 8
   * For non-DATA_DESC files: CRC >> 24
   */
  private calculateCheckByte(): number {
    if (this.entry.bitFlags & GP_FLAG.DATA_DESC) {
      let lastModTimeDate = (this.entry as any).lastModTimeDate;
      if (!lastModTimeDate || lastModTimeDate === 0) {
        lastModTimeDate = this.entry.timeDateDOS || 0;
      }
      const checkByte = (lastModTimeDate >> 8) & 0xff;
      return checkByte;
    } else {
      const crc = (this.entry as any).localCrc && (this.entry as any).localCrc !== 0 
        ? (this.entry as any).localCrc 
        : this.entry.crc;
      const checkByte = (crc >> 24) & 0xff;
      return checkByte;
    }
  }

  /**
   * Prepare entry for decryption by parsing local header from file handle
   * This extracts the information needed for check byte calculation
   * @param fileHandle - File handle to read from
   * @param entry - ZIP entry to update
   * @returns Check byte value for password verification
   */
  static async prepareEntryForDecryption(fileHandle: any, entry: ZipEntry): Promise<number> {
    // Read local header to get lastModTimeDate for DATA_DESC files (needed for check byte)
    const localHeaderBuffer = Buffer.alloc(30);
    await fileHandle.read(localHeaderBuffer, 0, 30, entry.localHdrOffset);

    // Use ZipCrypto to parse the header
    const zipCrypto = new ZipCrypto();
    const { checkByte } = zipCrypto.parseLocalHeaderForDecryption(localHeaderBuffer, entry);

    return checkByte;
  }
}
