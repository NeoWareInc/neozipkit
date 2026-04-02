/**
 * Tests for ZipkitMinter
 */

import { validatePrivateKey } from '../../src/core/ZipkitMinter';

describe('ZipkitMinter Utilities', () => {
  describe('validatePrivateKey', () => {
    it('should return true for valid private key', () => {
      // A valid Ethereum private key (test key - never use in production)
      const validKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      expect(validatePrivateKey(validKey)).toBe(true);
    });

    it('should return false for invalid private key', () => {
      expect(validatePrivateKey('not-a-key')).toBe(false);
      expect(validatePrivateKey('')).toBe(false);
      expect(validatePrivateKey('0x123')).toBe(false);
    });

    it('should return true for private key without 0x prefix', () => {
      const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      expect(validatePrivateKey(validKey)).toBe(true);
    });
  });
});

