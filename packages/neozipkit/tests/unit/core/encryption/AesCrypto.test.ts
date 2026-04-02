/**
 * Unit tests for WinZip AES-256 encryption (AE-1/AE-2)
 */

import { AesCrypto } from '../../../../src/core/encryption/AesCrypto';
import ZipEntry from '../../../../src/core/ZipEntry';
import {
  AES256_SALT_SIZE,
  AES256_PWD_VERIFY_SIZE,
  AES_AUTH_CODE_SIZE,
  AES_EXTRA_FIELD_SIZE,
  HDR_ID,
  CMP_METHOD,
} from '../../../../src/core/constants/Headers';

describe('AesCrypto', () => {

  describe('deriveKeys', () => {
    it('should derive keys of correct lengths', () => {
      const salt = Buffer.alloc(AES256_SALT_SIZE, 0xAA);
      const keys = AesCrypto.deriveKeys('testpassword', salt);

      expect(keys.aesKey.length).toBe(32);
      expect(keys.hmacKey.length).toBe(32);
      expect(keys.passwordVerifier.length).toBe(2);
    });

    it('should produce different keys for different passwords', () => {
      const salt = Buffer.alloc(AES256_SALT_SIZE, 0xBB);
      const keys1 = AesCrypto.deriveKeys('password1', salt);
      const keys2 = AesCrypto.deriveKeys('password2', salt);

      expect(keys1.aesKey.equals(keys2.aesKey)).toBe(false);
      expect(keys1.hmacKey.equals(keys2.hmacKey)).toBe(false);
    });

    it('should produce different keys for different salts', () => {
      const salt1 = Buffer.alloc(AES256_SALT_SIZE, 0x01);
      const salt2 = Buffer.alloc(AES256_SALT_SIZE, 0x02);
      const keys1 = AesCrypto.deriveKeys('samepassword', salt1);
      const keys2 = AesCrypto.deriveKeys('samepassword', salt2);

      expect(keys1.aesKey.equals(keys2.aesKey)).toBe(false);
    });

    it('should produce deterministic output for same inputs', () => {
      const salt = Buffer.alloc(AES256_SALT_SIZE, 0xCC);
      const keys1 = AesCrypto.deriveKeys('deterministic', salt);
      const keys2 = AesCrypto.deriveKeys('deterministic', salt);

      expect(keys1.aesKey.equals(keys2.aesKey)).toBe(true);
      expect(keys1.hmacKey.equals(keys2.hmacKey)).toBe(true);
      expect(keys1.passwordVerifier.equals(keys2.passwordVerifier)).toBe(true);
    });
  });

  describe('encrypt/decrypt round-trip', () => {
    it('should encrypt and decrypt small data', () => {
      const entry = new ZipEntry('test.txt');
      const data = Buffer.from('Hello, World!');
      const password = 'TestPassword123';

      const encrypted = AesCrypto.encryptBuffer(entry, data, password);

      // Encrypted payload should include salt + verifier + data + hmac
      expect(encrypted.length).toBe(
        AES256_SALT_SIZE + AES256_PWD_VERIFY_SIZE + data.length + AES_AUTH_CODE_SIZE
      );

      const decrypted = AesCrypto.decryptBuffer(entry, encrypted, password);
      expect(decrypted.equals(data)).toBe(true);
    });

    it('should encrypt and decrypt empty data', () => {
      const entry = new ZipEntry('empty.txt');
      const data = Buffer.alloc(0);
      const password = 'EmptyTest';

      const encrypted = AesCrypto.encryptBuffer(entry, data, password);
      expect(encrypted.length).toBe(AES256_SALT_SIZE + AES256_PWD_VERIFY_SIZE + AES_AUTH_CODE_SIZE);

      const decrypted = AesCrypto.decryptBuffer(entry, encrypted, password);
      expect(decrypted.length).toBe(0);
    });

    it('should encrypt and decrypt larger data', () => {
      const entry = new ZipEntry('large.bin');
      const data = Buffer.alloc(65536);
      for (let i = 0; i < data.length; i++) {
        data[i] = i & 0xFF;
      }
      const password = 'LargeDataPassword!';

      const encrypted = AesCrypto.encryptBuffer(entry, data, password);
      const decrypted = AesCrypto.decryptBuffer(entry, encrypted, password);

      expect(decrypted.equals(data)).toBe(true);
    });

    it('should produce different ciphertext for same data with different encryptions (random salt)', () => {
      const entry = new ZipEntry('test.txt');
      const data = Buffer.from('Same data, different salt');
      const password = 'SamePassword';

      const encrypted1 = AesCrypto.encryptBuffer(entry, data, password);
      const encrypted2 = AesCrypto.encryptBuffer(entry, data, password);

      // Salt is random, so ciphertext should differ
      expect(encrypted1.equals(encrypted2)).toBe(false);

      // But both should decrypt to the same data
      const dec1 = AesCrypto.decryptBuffer(entry, encrypted1, password);
      const dec2 = AesCrypto.decryptBuffer(entry, encrypted2, password);
      expect(dec1.equals(data)).toBe(true);
      expect(dec2.equals(data)).toBe(true);
    });
  });

  describe('wrong password detection', () => {
    it('should throw on wrong password', () => {
      const entry = new ZipEntry('secret.txt');
      const data = Buffer.from('Top Secret');
      const encrypted = AesCrypto.encryptBuffer(entry, data, 'CorrectPassword');

      expect(() => {
        AesCrypto.decryptBuffer(entry, encrypted, 'WrongPassword');
      }).toThrow('wrong password');
    });
  });

  describe('HMAC integrity', () => {
    it('should detect tampered ciphertext', () => {
      const entry = new ZipEntry('integrity.txt');
      const data = Buffer.from('Integrity check data');
      const password = 'IntegrityTest';

      const encrypted = AesCrypto.encryptBuffer(entry, data, password);

      // Tamper with the encrypted data portion (after salt + verifier, before hmac)
      const tamperOffset = AES256_SALT_SIZE + AES256_PWD_VERIFY_SIZE + 1;
      const tampered = Buffer.from(encrypted);
      tampered[tamperOffset] ^= 0xFF;

      expect(() => {
        AesCrypto.decryptBuffer(entry, tampered, password);
      }).toThrow('authentication code mismatch');
    });

    it('should detect tampered HMAC', () => {
      const entry = new ZipEntry('integrity2.txt');
      const data = Buffer.from('More integrity data');
      const password = 'HMACTest';

      const encrypted = AesCrypto.encryptBuffer(entry, data, password);

      // Tamper with the last byte (part of HMAC)
      const tampered = Buffer.from(encrypted);
      tampered[tampered.length - 1] ^= 0xFF;

      expect(() => {
        AesCrypto.decryptBuffer(entry, tampered, password);
      }).toThrow('authentication code mismatch');
    });
  });

  describe('buildAesExtraField', () => {
    it('should build correct AE-1 extra field for Deflate', () => {
      const field = AesCrypto.buildAesExtraField(CMP_METHOD.DEFLATED, 1);

      expect(field.length).toBe(AES_EXTRA_FIELD_SIZE);
      expect(field.readUInt16LE(0)).toBe(HDR_ID.AES);        // 0x9901
      expect(field.readUInt16LE(2)).toBe(7);                  // data size
      expect(field.readUInt16LE(4)).toBe(1);                  // AE-1
      expect(field.readUInt16LE(6)).toBe(0x4541);             // "AE"
      expect(field.readUInt8(8)).toBe(0x03);                  // AES-256
      expect(field.readUInt16LE(9)).toBe(CMP_METHOD.DEFLATED);// real method
    });

    it('should build correct AE-2 extra field for Stored', () => {
      const field = AesCrypto.buildAesExtraField(CMP_METHOD.STORED, 2);

      expect(field.readUInt16LE(4)).toBe(2);                  // AE-2
      expect(field.readUInt16LE(9)).toBe(CMP_METHOD.STORED);  // real method
    });
  });

  describe('parseAesExtraField', () => {
    it('should parse a valid AES extra field', () => {
      const fieldData = Buffer.alloc(7);
      fieldData.writeUInt16LE(1, 0);       // AE-1
      fieldData.writeUInt16LE(0x4541, 2);  // "AE"
      fieldData.writeUInt8(0x03, 4);       // AES-256
      fieldData.writeUInt16LE(8, 5);       // Deflate

      const parsed = AesCrypto.parseAesExtraField(fieldData);

      expect(parsed.vendorVersion).toBe(1);
      expect(parsed.vendorId).toBe('AE');
      expect(parsed.encryptionStrength).toBe(3);
      expect(parsed.realCmpMethod).toBe(8);
    });
  });

  describe('CTR counter behavior', () => {
    it('should handle data larger than one AES block (16 bytes)', () => {
      const entry = new ZipEntry('multiblock.bin');
      const data = Buffer.alloc(48, 0x42); // 3 full blocks
      const password = 'MultiBlockTest';

      const encrypted = AesCrypto.encryptBuffer(entry, data, password);
      const decrypted = AesCrypto.decryptBuffer(entry, encrypted, password);

      expect(decrypted.equals(data)).toBe(true);
    });

    it('should handle data not aligned to block size', () => {
      const entry = new ZipEntry('unaligned.bin');
      const data = Buffer.alloc(37, 0x55); // 2 full blocks + 5 bytes
      const password = 'UnalignedTest';

      const encrypted = AesCrypto.encryptBuffer(entry, data, password);
      const decrypted = AesCrypto.decryptBuffer(entry, encrypted, password);

      expect(decrypted.equals(data)).toBe(true);
    });

    it('should handle exactly one block of data', () => {
      const entry = new ZipEntry('oneblock.bin');
      const data = Buffer.alloc(16, 0xAA);
      const password = 'OneBlockTest';

      const encrypted = AesCrypto.encryptBuffer(entry, data, password);
      const decrypted = AesCrypto.decryptBuffer(entry, encrypted, password);

      expect(decrypted.equals(data)).toBe(true);
    });
  });
});
