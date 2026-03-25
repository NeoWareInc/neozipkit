/**
 * Unit tests for NeoEncrypt extra field and AES stream (delegates to AesCrypto)
 */

import { NeoCrypto, NEO_CRYPTO_ALGORITHM_AES256_V1 } from '../../../../src/core/encryption/NeoCrypto';
import ZipEntry from '../../../../src/core/ZipEntry';
import {
  AES256_SALT_SIZE,
  AES256_PWD_VERIFY_SIZE,
  AES_AUTH_CODE_SIZE,
  HDR_ID,
  NEO_CRYPTO_EXTRA_FIELD_SIZE,
  NEO_CRYPTO_PAYLOAD_V1,
} from '../../../../src/core/constants/Headers';
import { AesCrypto } from '../../../../src/core/encryption/AesCrypto';

describe('NeoCrypto', () => {
  describe('payload and extra field', () => {
    it('buildPayloadV1 round-trips via tryParsePayload', () => {
      const p = NeoCrypto.buildPayloadV1(NEO_CRYPTO_ALGORITHM_AES256_V1, 0, 0);
      expect(p.length).toBe(NEO_CRYPTO_PAYLOAD_V1);
      const parsed = NeoCrypto.tryParsePayload(p);
      expect(parsed).not.toBeNull();
      expect(parsed!.payloadVersion).toBe(1);
      expect(parsed!.algorithm).toBe(NEO_CRYPTO_ALGORITHM_AES256_V1);
      expect(parsed!.flags).toBe(0);
      expect(parsed!.reserved).toBe(0);
    });

    it('buildExtraFieldRecordV1 has correct header id and size', () => {
      const rec = NeoCrypto.buildExtraFieldRecordV1();
      expect(rec.length).toBe(NEO_CRYPTO_EXTRA_FIELD_SIZE);
      expect(rec.readUInt16LE(0)).toBe(HDR_ID.NEO_CRYPTO);
      expect(rec.readUInt16LE(2)).toBe(NEO_CRYPTO_PAYLOAD_V1);
      const inner = rec.subarray(4);
      const parsed = NeoCrypto.tryParsePayload(inner);
      expect(parsed?.algorithm).toBe(NEO_CRYPTO_ALGORITHM_AES256_V1);
    });

    it('parsePayload throws on invalid buffer', () => {
      expect(() => NeoCrypto.parsePayload(Buffer.alloc(4))).toThrow('invalid');
    });
  });

  describe('encrypt/decrypt', () => {
    it('round-trips plaintext via NeoCrypto (same layout as AesCrypto)', () => {
      const entry = new ZipEntry('n.txt');
      const data = Buffer.from('NeoEncrypt payload');
      const password = 'pw';

      const enc = NeoCrypto.encryptBuffer(entry, data, password);
      expect(enc.length).toBe(
        AES256_SALT_SIZE + AES256_PWD_VERIFY_SIZE + data.length + AES_AUTH_CODE_SIZE
      );

      const dec = NeoCrypto.decryptBuffer(entry, enc, password);
      expect(dec.equals(data)).toBe(true);
    });

    it('matches AesCrypto ciphertext shape (delegation)', () => {
      const entry = new ZipEntry('x.txt');
      const data = Buffer.from('same');
      const password = 'secret';
      const a = AesCrypto.encryptBuffer(entry, data, password);
      const b = NeoCrypto.encryptBuffer(entry, data, password);
      expect(a.length).toBe(b.length);
    });

    it('throws on wrong password', () => {
      const entry = new ZipEntry('e.txt');
      const enc = NeoCrypto.encryptBuffer(entry, Buffer.from('x'), 'good');
      expect(() => NeoCrypto.decryptBuffer(entry, enc, 'bad')).toThrow('wrong password');
    });

    it('throws on tampered ciphertext', () => {
      const entry = new ZipEntry('t.txt');
      const enc = NeoCrypto.encryptBuffer(entry, Buffer.from('data'), 'p');
      const tampered = Buffer.from(enc);
      tampered[AES256_SALT_SIZE + AES256_PWD_VERIFY_SIZE] ^= 0xff;
      expect(() => NeoCrypto.decryptBuffer(entry, tampered, 'p')).toThrow('authentication code mismatch');
    });
  });
});
