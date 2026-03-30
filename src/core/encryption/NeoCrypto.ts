// ======================================
//  NeoCrypto.ts - NeoEncrypt (NEO AES-256 via extra 0x024E)
//  Copyright (c) 2026 NeoWare, Inc. All rights reserved.
// ======================================
// See docs/NEO_CRYPTO_FORMAT.md. Ciphertext layout matches AesCrypto (WinZip LE CTR + HMAC).
// NeoEncrypt uses standard ZIP compression method; only encryption metadata is in the NEO extra.

import ZipEntry from '../ZipEntry';
import {
  HDR_ID,
  NEO_CRYPTO_MAGIC_BYTES,
  NEO_CRYPTO_PAYLOAD_V1,
  NEO_CRYPTO_EXTRA_FIELD_SIZE,
} from '../constants/Headers';
import { AesCrypto } from './AesCrypto';

/** Encryption algorithm IDs inside NEO extra (payload format v1) */
export const NEO_CRYPTO_ALGORITHM_AES256_V1 = 1;

export interface NeoCryptoParsedPayload {
  payloadVersion: number;
  algorithm: number;
  flags: number;
  reserved: number;
}

export class NeoCrypto {
  /**
   * Build 11-byte NEO crypto payload (format version 1).
   */
  static buildPayloadV1(
    algorithm: number = NEO_CRYPTO_ALGORITHM_AES256_V1,
    flags: number = 0,
    reserved: number = 0
  ): Buffer {
    const buf = Buffer.alloc(NEO_CRYPTO_PAYLOAD_V1);
    for (let i = 0; i < 4; i++) {
      buf[i] = NEO_CRYPTO_MAGIC_BYTES[i];
    }
    buf.writeUInt8(1, 4);
    buf.writeUInt16LE(algorithm, 5);
    buf.writeUInt16LE(flags, 7);
    buf.writeUInt16LE(reserved, 9);
    return buf;
  }

  /**
   * Full ZIP extra field record: HeaderID + TSize + payload (15 bytes for v1).
   */
  static buildExtraFieldRecordV1(
    algorithm: number = NEO_CRYPTO_ALGORITHM_AES256_V1,
    flags: number = 0,
    reserved: number = 0
  ): Buffer {
    const buf = Buffer.alloc(NEO_CRYPTO_EXTRA_FIELD_SIZE);
    buf.writeUInt16LE(HDR_ID.NEO_CRYPTO, 0);
    buf.writeUInt16LE(NEO_CRYPTO_PAYLOAD_V1, 2);
    NeoCrypto.buildPayloadV1(algorithm, flags, reserved).copy(buf, 4);
    return buf;
  }

  /**
   * Parse NEO payload (11 bytes after extra header id+len). Returns null if invalid.
   */
  static tryParsePayload(data: Buffer): NeoCryptoParsedPayload | null {
    if (data.length < NEO_CRYPTO_PAYLOAD_V1) {
      return null;
    }
    if (
      data[0] !== NEO_CRYPTO_MAGIC_BYTES[0] ||
      data[1] !== NEO_CRYPTO_MAGIC_BYTES[1] ||
      data[2] !== NEO_CRYPTO_MAGIC_BYTES[2] ||
      data[3] !== NEO_CRYPTO_MAGIC_BYTES[3]
    ) {
      return null;
    }
    return {
      payloadVersion: data.readUInt8(4),
      algorithm: data.readUInt16LE(5),
      flags: data.readUInt16LE(7),
      reserved: data.readUInt16LE(9),
    };
  }

  static parsePayload(data: Buffer): NeoCryptoParsedPayload {
    const p = NeoCrypto.tryParsePayload(data);
    if (!p || p.payloadVersion !== 1) {
      throw new Error('NeoEncrypt: invalid NEO crypto extra field');
    }
    return p;
  }

  /**
   * Encrypt compressed data (algorithm 1 = same bytes as WinZip AES-256 in AesCrypto).
   */
  static encryptBuffer(entry: ZipEntry, compressedData: Buffer, password: string): Buffer {
    return AesCrypto.encryptBuffer(entry, compressedData, password);
  }

  /**
   * Decrypt NeoEncrypt file data (full salt+verifier+ciphertext+hmac).
   */
  static decryptBuffer(entry: ZipEntry, fullPayload: Buffer, password: string): Buffer {
    return AesCrypto.decryptBuffer(entry, fullPayload, password);
  }
}
