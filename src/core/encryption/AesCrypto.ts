// ======================================
//  AesCrypto.ts - WinZip AES-256 Encryption (AE-1/AE-2)
//  Copyright (c) 2025 NeoWare, Inc. All rights reserved.
// ======================================
// Implements the WinZip AES encryption specification for ZIP files.
// Compatible with WinZip, 7-Zip, and other tools that support the AE-1/AE-2 format.
//
// Spec: https://www.winzip.com/en/support/aes-encryption/
//
// Data layout per encrypted entry:
//   [salt (16 bytes)] [password verifier (2 bytes)] [encrypted data] [HMAC-SHA1 (10 bytes)]
//
// Extra field 0x9901 (11 bytes):
//   [header ID (2)] [data size (2)] [vendor version (2)] [vendor ID (2)] [strength (1)] [real method (2)]

import * as crypto from 'crypto';
import ZipEntry from '../ZipEntry';
import {
  AES256_SALT_SIZE,
  AES256_KEY_SIZE,
  AES256_PWD_VERIFY_SIZE,
  AES_AUTH_CODE_SIZE,
  AES_EXTRA_FIELD_SIZE,
  HDR_ID,
  CMP_METHOD,
} from '../constants/Headers';

const COMPOSITE_KEY_LENGTH = 2 * AES256_KEY_SIZE + AES256_PWD_VERIFY_SIZE; // 66 bytes
const PBKDF2_ITERATIONS = 1000;
const AES_BLOCK_SIZE = 16;

interface DerivedKeys {
  aesKey: Buffer;
  hmacKey: Buffer;
  passwordVerifier: Buffer;
}

/**
 * WinZip AES-256 encryption/decryption for ZIP files.
 *
 * Uses PBKDF2-HMAC-SHA1 for key derivation, AES-256 in CTR mode with
 * a little-endian counter (WinZip convention), and HMAC-SHA1 for authentication.
 */
export class AesCrypto {

  /**
   * Derive encryption key, HMAC key, and password verification value
   * using PBKDF2 with HMAC-SHA1.
   */
  static deriveKeys(password: string | Buffer, salt: Buffer): DerivedKeys {
    const key = Buffer.isBuffer(password) ? password : Buffer.from(password);
    const compositeKey = crypto.pbkdf2Sync(key, salt, PBKDF2_ITERATIONS, COMPOSITE_KEY_LENGTH, 'sha1');
    return {
      aesKey: compositeKey.subarray(0, AES256_KEY_SIZE),
      hmacKey: compositeKey.subarray(AES256_KEY_SIZE, 2 * AES256_KEY_SIZE),
      passwordVerifier: compositeKey.subarray(2 * AES256_KEY_SIZE),
    };
  }

  /**
   * Encrypt compressed data using WinZip AES-256.
   *
   * @returns Buffer: salt(16) + verifier(2) + encryptedData + hmac(10)
   */
  static encryptBuffer(entry: ZipEntry, compressedData: Buffer, password: string): Buffer {
    const salt = crypto.randomBytes(AES256_SALT_SIZE);
    const keys = AesCrypto.deriveKeys(password, salt);

    const encrypted = AesCrypto.aesCtrProcess(keys.aesKey, compressedData);

    const hmac = crypto.createHmac('sha1', keys.hmacKey);
    hmac.update(encrypted);
    const authCode = hmac.digest().subarray(0, AES_AUTH_CODE_SIZE);

    return Buffer.concat([salt, keys.passwordVerifier, encrypted, authCode]);
  }

  /**
   * Decrypt AES-256 encrypted data from a ZIP entry.
   *
   * @param entry - ZIP entry metadata
   * @param fullPayload - The full payload: salt + verifier + encrypted + hmac
   * @param password - Decryption password
   * @returns Decrypted (compressed) data
   */
  static decryptBuffer(entry: ZipEntry, fullPayload: Buffer, password: string): Buffer {
    const salt = fullPayload.subarray(0, AES256_SALT_SIZE);
    const storedVerifier = fullPayload.subarray(AES256_SALT_SIZE, AES256_SALT_SIZE + AES256_PWD_VERIFY_SIZE);
    const encryptedData = fullPayload.subarray(
      AES256_SALT_SIZE + AES256_PWD_VERIFY_SIZE,
      fullPayload.length - AES_AUTH_CODE_SIZE
    );
    const storedAuthCode = fullPayload.subarray(fullPayload.length - AES_AUTH_CODE_SIZE);

    const keys = AesCrypto.deriveKeys(password, salt);

    if (!keys.passwordVerifier.equals(storedVerifier)) {
      throw new Error('AES decryption failed: wrong password');
    }

    const hmac = crypto.createHmac('sha1', keys.hmacKey);
    hmac.update(encryptedData);
    const calculatedAuthCode = hmac.digest().subarray(0, AES_AUTH_CODE_SIZE);

    if (!calculatedAuthCode.equals(storedAuthCode)) {
      throw new Error('AES decryption failed: authentication code mismatch (data corrupted or tampered)');
    }

    return AesCrypto.aesCtrProcess(keys.aesKey, encryptedData);
  }

  /**
   * AES-CTR encrypt/decrypt with WinZip's little-endian counter.
   *
   * WinZip uses a counter that starts at 1 and increments in little-endian byte order.
   * Node's built-in aes-256-ctr uses big-endian counter increment, so we process
   * block-by-block with an explicit LE counter to match the WinZip format.
   */
  private static aesCtrProcess(aesKey: Buffer, data: Buffer): Buffer {
    if (data.length === 0) {
      return Buffer.alloc(0);
    }

    const result = Buffer.alloc(data.length);
    const counter = Buffer.alloc(AES_BLOCK_SIZE);
    counter[0] = 1; // LE counter starts at 1

    let offset = 0;
    while (offset < data.length) {
      // Encrypt the counter block to get keystream
      const cipher = crypto.createCipheriv('aes-256-ecb', aesKey, null);
      cipher.setAutoPadding(false);
      const keystream = cipher.update(counter);

      const blockLen = Math.min(AES_BLOCK_SIZE, data.length - offset);
      for (let i = 0; i < blockLen; i++) {
        result[offset + i] = data[offset + i] ^ keystream[i];
      }

      offset += blockLen;
      AesCrypto.incrementCounterLE(counter);
    }

    return result;
  }

  /**
   * Increment a 16-byte counter in little-endian order.
   */
  private static incrementCounterLE(counter: Buffer): void {
    for (let i = 0; i < AES_BLOCK_SIZE; i++) {
      if (counter[i] === 255) {
        counter[i] = 0;
      } else {
        counter[i]++;
        break;
      }
    }
  }

  /**
   * Build the WinZip AES extra data field (0x9901).
   *
   * @param realMethod - The actual compression method (e.g. DEFLATED=8, STORED=0)
   * @param vendorVersion - 1 for AE-1 (CRC stored), 2 for AE-2 (CRC=0)
   * @returns 11-byte buffer containing the complete extra field
   */
  static buildAesExtraField(realMethod: number, vendorVersion: number = 1): Buffer {
    const buf = Buffer.alloc(AES_EXTRA_FIELD_SIZE);
    buf.writeUInt16LE(HDR_ID.AES, 0);        // Extra field header ID (0x9901)
    buf.writeUInt16LE(7, 2);                  // Data size (always 7)
    buf.writeUInt16LE(vendorVersion, 4);      // AE-1 (0x0001) or AE-2 (0x0002)
    buf.writeUInt16LE(0x4541, 6);             // Vendor ID: "AE" (little-endian)
    buf.writeUInt8(0x03, 8);                  // Encryption strength: AES-256
    buf.writeUInt16LE(realMethod, 9);         // Actual compression method
    return buf;
  }

  /**
   * Parse the AES extra data field (0x9901) from a buffer.
   *
   * @param data - 7-byte data portion of the extra field (without header ID and size)
   * @returns Parsed AES extra field values
   */
  static parseAesExtraField(data: Buffer): {
    vendorVersion: number;
    vendorId: string;
    encryptionStrength: number;
    realCmpMethod: number;
  } {
    return {
      vendorVersion: data.readUInt16LE(0),
      vendorId: String.fromCharCode(data[2], data[3]),
      encryptionStrength: data.readUInt8(4),
      realCmpMethod: data.readUInt16LE(5),
    };
  }
}
