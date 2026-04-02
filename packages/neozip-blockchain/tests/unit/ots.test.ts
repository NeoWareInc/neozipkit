/**
 * Unit tests for OpenTimestamps (OTS) module
 */

import {
  TIMESTAMP_SUBMITTED,
  TIMESTAMP_METADATA,
  CMP_METHOD,
  bufferToArrayBuffer,
  getOtsEntry,
  getMerkleRootSafe,
  verifyOtsZip,
} from '../../src/ots';
import type { ZipkitLike, ZipEntryLike } from '../../src/types';

describe('ZipkitOTS', () => {
  describe('constants', () => {
    it('should export correct OTS metadata filenames', () => {
      expect(TIMESTAMP_SUBMITTED).toBe('META-INF/TS-SUBMIT.OTS');
      expect(TIMESTAMP_METADATA).toBe('META-INF/TIMESTAMP.OTS');
    });

    it('should export CMP_METHOD with STORED and DEFLATED', () => {
      expect(CMP_METHOD.STORED).toBe(0);
      expect(CMP_METHOD.DEFLATED).toBe(8);
    });
  });

  describe('bufferToArrayBuffer', () => {
    it('should convert Buffer to ArrayBuffer with same bytes', () => {
      const buf = Buffer.from([1, 2, 3, 4, 5]);
      const ab = bufferToArrayBuffer(buf);
      expect(ab).toBeInstanceOf(ArrayBuffer);
      expect(ab.byteLength).toBe(5);
      expect(new Uint8Array(ab)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });

    it('should handle empty Buffer', () => {
      const buf = Buffer.alloc(0);
      const ab = bufferToArrayBuffer(buf);
      expect(ab.byteLength).toBe(0);
    });

    it('should handle hex string content', () => {
      const hex = 'deadbeef';
      const buf = Buffer.from(hex, 'hex');
      const ab = bufferToArrayBuffer(buf);
      expect(ab.byteLength).toBe(4);
      expect(new Uint8Array(ab)).toEqual(new Uint8Array(buf));
    });
  });

  describe('getOtsEntry', () => {
    it('should return null when zip has no getDirectory', () => {
      const zip = {} as ZipkitLike;
      expect(getOtsEntry(zip)).toBeNull();
    });

    it('should return null when directory is empty', () => {
      const zip: ZipkitLike = {
        getDirectory: () => [],
      };
      expect(getOtsEntry(zip)).toBeNull();
    });

    it('should return null when no OTS metadata entry exists', () => {
      const zip: ZipkitLike = {
        getDirectory: () => [
          { filename: 'file.txt' } as ZipEntryLike,
          { filename: 'META-INF/OTHER.NZIP' } as ZipEntryLike,
        ],
      };
      expect(getOtsEntry(zip)).toBeNull();
    });

    it('should prefer TIMESTAMP_METADATA over TIMESTAMP_SUBMITTED', () => {
      const confirmedEntry = { filename: TIMESTAMP_METADATA } as ZipEntryLike;
      const submitEntry = { filename: TIMESTAMP_SUBMITTED } as ZipEntryLike;
      const zip: ZipkitLike = {
        getDirectory: () => [
          { filename: 'file.txt' } as ZipEntryLike,
          submitEntry,
          confirmedEntry,
        ],
      };
      expect(getOtsEntry(zip)).toBe(confirmedEntry);
    });

    it('should return TS-SUBMIT.OTS entry when only submitted exists', () => {
      const submitEntry = { filename: TIMESTAMP_SUBMITTED } as ZipEntryLike;
      const zip: ZipkitLike = {
        getDirectory: () => [
          { filename: 'file.txt' } as ZipEntryLike,
          submitEntry,
        ],
      };
      expect(getOtsEntry(zip)).toBe(submitEntry);
    });

    it('should include metadata when getDirectory(true) is used', () => {
      const submitEntry = { filename: TIMESTAMP_SUBMITTED } as ZipEntryLike;
      const getDirectory = jest.fn(() => [submitEntry]);
      const zip: ZipkitLike = { getDirectory };
      getOtsEntry(zip);
      expect(getDirectory).toHaveBeenCalledWith(true);
    });
  });

  describe('getMerkleRootSafe', () => {
    it('should return null when zip has no getMerkleRoot', () => {
      const zip = {} as ZipkitLike;
      expect(getMerkleRootSafe(zip)).toBeNull();
    });

    it('should return null when getMerkleRoot returns undefined', () => {
      const zip: ZipkitLike = { getMerkleRoot: () => undefined as any };
      expect(getMerkleRootSafe(zip)).toBeNull();
    });

    it('should return null when getMerkleRoot returns empty string', () => {
      const zip: ZipkitLike = { getMerkleRoot: () => '' };
      expect(getMerkleRootSafe(zip)).toBeNull();
    });

    it('should return merkle root when getMerkleRoot returns valid string', () => {
      const root = 'a'.repeat(64);
      const zip: ZipkitLike = { getMerkleRoot: () => root };
      expect(getMerkleRootSafe(zip)).toBe(root);
    });

    it('should return null when getMerkleRoot throws', () => {
      const zip: ZipkitLike = {
        getMerkleRoot: () => {
          throw new Error('fail');
        },
      };
      expect(getMerkleRootSafe(zip)).toBeNull();
    });
  });

  describe('verifyOtsZip', () => {
    it('should return status "none" when no OTS entry found', async () => {
      const zip: ZipkitLike = {
        getDirectory: () => [{ filename: 'file.txt' } as ZipEntryLike],
      };
      const result = await verifyOtsZip(zip);
      expect(result.status).toBe('none');
    });

    it('should return status "error" with message when OTS entry exists but getOtsBuffer returns null', async () => {
      const zip: ZipkitLike = {
        getDirectory: () => [{ filename: TIMESTAMP_SUBMITTED } as ZipEntryLike],
        getMerkleRoot: () => 'a'.repeat(64),
        extractToBuffer: async () => {
          throw new Error('extract failed');
        },
        extract: async () => null,
      };
      const result = await verifyOtsZip(zip);
      expect(result.status).toBe('error');
      expect(result.message).toContain('Could not read OTS proof');
    });

    it('should return status "error" with message when merkle root is missing', async () => {
      const zip: ZipkitLike = {
        getDirectory: () => [{ filename: TIMESTAMP_SUBMITTED } as ZipEntryLike],
        getMerkleRoot: () => null,
        extractToBuffer: async () => Buffer.from('fake ots data'),
      };
      const result = await verifyOtsZip(zip);
      expect(result.status).toBe('error');
      expect(result.message).toContain('merkle root');
      expect(result.message).toContain('useSHA256');
    });
  });
});
