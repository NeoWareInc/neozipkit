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
//
// Streaming helpers (AesEncryptor / AesDecryptor) keep only a 16-byte CTR block in
// flight so Node create/extract can chunk large AE-1/AE-2 entries.

import * as crypto from 'crypto';
import ZipEntry from '../ZipEntry';
import {
  AES256_SALT_SIZE,
  AES256_KEY_SIZE,
  AES256_PWD_VERIFY_SIZE,
  AES_AUTH_CODE_SIZE,
  AES_EXTRA_FIELD_SIZE,
  AES_OVERHEAD,
  HDR_ID,
} from '../constants/Headers';

const COMPOSITE_KEY_LENGTH = 2 * AES256_KEY_SIZE + AES256_PWD_VERIFY_SIZE; // 66 bytes
const PBKDF2_ITERATIONS = 1000;
const AES_BLOCK_SIZE = 16;

interface DerivedKeys {
  aesKey: Buffer;
  hmacKey: Buffer;
  passwordVerifier: Buffer;
}

/** Little-endian AES-CTR keystream (WinZip counter starts at 1). */
class AesCtrEngine {
  private readonly aesKey: Buffer;
  private readonly counter: Buffer;
  private keystream: Buffer;
  private ksPos: number;

  constructor(aesKey: Buffer) {
    this.aesKey = aesKey;
    this.counter = Buffer.alloc(AES_BLOCK_SIZE);
    this.counter[0] = 1;
    this.keystream = this.encryptCounter();
    this.ksPos = 0;
  }

  process(data: Buffer): Buffer {
    if (data.length === 0) {
      return Buffer.alloc(0);
    }
    const result = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      if (this.ksPos >= AES_BLOCK_SIZE) {
        AesCtrEngine.incrementCounterLE(this.counter);
        this.keystream = this.encryptCounter();
        this.ksPos = 0;
      }
      result[i] = data[i] ^ this.keystream[this.ksPos++];
    }
    return result;
  }

  private encryptCounter(): Buffer {
    const cipher = crypto.createCipheriv('aes-256-ecb', this.aesKey, null);
    cipher.setAutoPadding(false);
    return cipher.update(this.counter);
  }

  static incrementCounterLE(counter: Buffer): void {
    for (let i = 0; i < AES_BLOCK_SIZE; i++) {
      if (counter[i] === 255) {
        counter[i] = 0;
      } else {
        counter[i]++;
        break;
      }
    }
  }
}

/**
 * Streaming AE-1/AE-2 encryptor for ZIP entry payloads.
 *
 * Usage: `header()` once → `update(compressedChunk)` repeatedly → `finish()` for HMAC.
 */
export class AesEncryptor {
  private readonly keys: DerivedKeys;
  private readonly salt: Buffer;
  private readonly ctr: AesCtrEngine;
  private readonly hmac: crypto.Hmac;
  private headerSent = false;
  private finished = false;

  constructor(password: string) {
    this.salt = crypto.randomBytes(AES256_SALT_SIZE);
    this.keys = AesCrypto.deriveKeys(password, this.salt);
    this.ctr = new AesCtrEngine(this.keys.aesKey);
    this.hmac = crypto.createHmac('sha1', this.keys.hmacKey);
  }

  /** salt (16) + password verifier (2). Write before any ciphertext. */
  header(): Buffer {
    if (this.finished) {
      throw new Error('AesEncryptor already finished');
    }
    this.headerSent = true;
    return Buffer.concat([this.salt, this.keys.passwordVerifier]);
  }

  /** Encrypt one compressed-data chunk; updates HMAC over ciphertext. */
  update(plain: Buffer): Buffer {
    if (this.finished) {
      throw new Error('AesEncryptor already finished');
    }
    if (!this.headerSent) {
      throw new Error('AesEncryptor.header() must be called before update()');
    }
    if (plain.length === 0) {
      return Buffer.alloc(0);
    }
    const cipher = this.ctr.process(plain);
    this.hmac.update(cipher);
    return cipher;
  }

  /** Final 10-byte authentication code. */
  finish(): Buffer {
    if (this.finished) {
      throw new Error('AesEncryptor already finished');
    }
    if (!this.headerSent) {
      throw new Error('AesEncryptor.header() must be called before finish()');
    }
    this.finished = true;
    return this.hmac.digest().subarray(0, AES_AUTH_CODE_SIZE);
  }
}

/**
 * Streaming AE-1/AE-2 decryptor. `compressedSize` is the full ZIP payload length
 * (salt + verifier + ciphertext + auth), as stored in the local/central header.
 */
export class AesDecryptor {
  private readonly password: string;
  private readonly cipherLen: number;
  private remainingCipher: number;
  private keys: DerivedKeys | null = null;
  private ctr: AesCtrEngine | null = null;
  private hmac: crypto.Hmac | null = null;
  private headerBuf = Buffer.alloc(0);
  private authBuf = Buffer.alloc(0);
  private headerDone = false;
  private verified = false;

  constructor(password: string, compressedSize: number) {
    if (compressedSize < AES_OVERHEAD) {
      throw new Error('AES decryption failed: payload too short');
    }
    this.password = password;
    this.cipherLen = compressedSize - AES_OVERHEAD;
    this.remainingCipher = this.cipherLen;
  }

  /**
   * Feed the next archive chunk. Returns decrypted compressed bytes
   * (empty while still reading salt/verifier).
   */
  push(chunk: Buffer): Buffer {
    let data = chunk;
    if (!this.headerDone) {
      this.headerBuf = Buffer.concat([this.headerBuf, data]);
      const need = AES256_SALT_SIZE + AES256_PWD_VERIFY_SIZE;
      if (this.headerBuf.length < need) {
        return Buffer.alloc(0);
      }
      const salt = this.headerBuf.subarray(0, AES256_SALT_SIZE);
      const storedVerifier = this.headerBuf.subarray(AES256_SALT_SIZE, need);
      this.keys = AesCrypto.deriveKeys(this.password, salt);
      if (!this.keys.passwordVerifier.equals(storedVerifier)) {
        throw new Error('AES decryption failed: wrong password');
      }
      this.ctr = new AesCtrEngine(this.keys.aesKey);
      this.hmac = crypto.createHmac('sha1', this.keys.hmacKey);
      this.headerDone = true;
      data = this.headerBuf.subarray(need);
      this.headerBuf = Buffer.alloc(0);
    }

    if (data.length === 0) {
      return Buffer.alloc(0);
    }

    const cipherTake = Math.min(data.length, this.remainingCipher);
    const cipherPart = data.subarray(0, cipherTake);
    const rest = data.subarray(cipherTake);
    if (rest.length > 0) {
      this.authBuf = Buffer.concat([this.authBuf, rest]);
    }

    if (cipherPart.length === 0) {
      this.tryVerify();
      return Buffer.alloc(0);
    }

    this.hmac!.update(cipherPart);
    const plain = this.ctr!.process(cipherPart);
    this.remainingCipher -= cipherPart.length;
    this.tryVerify();
    return plain;
  }

  /** Ensure ciphertext is complete and HMAC verified. */
  end(): void {
    if (this.remainingCipher > 0) {
      throw new Error('AES decryption failed: truncated ciphertext');
    }
    this.tryVerify();
    if (!this.verified) {
      throw new Error('AES decryption failed: missing authentication code');
    }
  }

  private tryVerify(): void {
    if (this.verified || this.remainingCipher > 0 || !this.hmac) {
      return;
    }
    if (this.authBuf.length < AES_AUTH_CODE_SIZE) {
      return;
    }
    const stored = this.authBuf.subarray(0, AES_AUTH_CODE_SIZE);
    const calculated = this.hmac.digest().subarray(0, AES_AUTH_CODE_SIZE);
    if (!calculated.equals(stored)) {
      throw new Error(
        'AES decryption failed: authentication code mismatch (data corrupted or tampered)'
      );
    }
    this.verified = true;
  }
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
    const compositeKey = crypto.pbkdf2Sync(
      key,
      salt,
      PBKDF2_ITERATIONS,
      COMPOSITE_KEY_LENGTH,
      'sha1'
    );
    return {
      aesKey: compositeKey.subarray(0, AES256_KEY_SIZE),
      hmacKey: compositeKey.subarray(AES256_KEY_SIZE, 2 * AES256_KEY_SIZE),
      passwordVerifier: compositeKey.subarray(2 * AES256_KEY_SIZE),
    };
  }

  /** Create a streaming AE-1/AE-2 encryptor. */
  static createEncryptor(password: string): AesEncryptor {
    return new AesEncryptor(password);
  }

  /**
   * Create a streaming AE-1/AE-2 decryptor.
   * @param compressedSize Full payload size including salt, verifier, and auth code.
   */
  static createDecryptor(password: string, compressedSize: number): AesDecryptor {
    return new AesDecryptor(password, compressedSize);
  }

  /**
   * Encrypt compressed data using WinZip AES-256.
   *
   * @returns Buffer: salt(16) + verifier(2) + encryptedData + hmac(10)
   */
  static encryptBuffer(entry: ZipEntry, compressedData: Buffer, password: string): Buffer {
    void entry;
    const enc = AesCrypto.createEncryptor(password);
    const parts = [enc.header()];
    if (compressedData.length > 0) {
      parts.push(enc.update(compressedData));
    }
    parts.push(enc.finish());
    return Buffer.concat(parts);
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
    void entry;
    const dec = AesCrypto.createDecryptor(password, fullPayload.length);
    const out = dec.push(fullPayload);
    dec.end();
    return out;
  }

  /**
   * Decrypt an async chunk stream (Node extract path).
   * Yields decrypted compressed chunks; verifies HMAC when the stream ends.
   */
  static async *decryptStream(
    password: string,
    compressedSize: number,
    encryptedStream: AsyncIterable<Buffer>
  ): AsyncGenerator<Buffer> {
    const dec = AesCrypto.createDecryptor(password, compressedSize);
    for await (const chunk of encryptedStream) {
      const plain = dec.push(chunk);
      if (plain.length > 0) {
        yield plain;
      }
    }
    dec.end();
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
    buf.writeUInt16LE(HDR_ID.AES, 0);
    buf.writeUInt16LE(7, 2);
    buf.writeUInt16LE(vendorVersion, 4);
    buf.writeUInt16LE(0x4541, 6); // "AE"
    buf.writeUInt8(0x03, 8); // AES-256
    buf.writeUInt16LE(realMethod, 9);
    return buf;
  }

  /**
   * Parse the AES extra data field (0x9901) from a buffer.
   *
   * @param data - 7-byte data portion of the extra field (without header ID and size)
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
