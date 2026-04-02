/**
 * Unit tests for Zipstamp server API (metadata, proof verification, entry helpers)
 */

import { ethers } from 'ethers';
import {
  SUBMIT_METADATA,
  TIMESTAMP_METADATA,
  NFT_METADATA,
  NFT_METADATA_LEGACY,
  findMetadataEntry,
  getMetadataType,
  shouldUpgrade,
  getMetadataFileNames,
  verifyMerkleProofLocal,
  getEthTimestampEntry,
} from '../../src/zipstamp-server';
import type { ZipkitLike, ZipEntryLike } from '../../src/types';
import type { TimestampMetadata } from '../../src/zipstamp-server';

describe('Zipstamp Server API', () => {
  describe('constants', () => {
    it('should export correct metadata filenames', () => {
      expect(SUBMIT_METADATA).toBe('META-INF/TS-SUBMIT.NZIP');
      expect(TIMESTAMP_METADATA).toBe('META-INF/TIMESTAMP.NZIP');
      expect(NFT_METADATA).toBe('META-INF/TOKEN.NZIP');
      expect(NFT_METADATA_LEGACY).toBe('META-INF/NZIP.TOKEN');
    });
  });

  describe('findMetadataEntry', () => {
    it('should return null for empty entries', () => {
      expect(findMetadataEntry([])).toBeNull();
    });

    it('should return null when no timestamp metadata exists', () => {
      const entries = [
        { filename: 'file.txt' },
        { filename: 'META-INF/TOKEN.NZIP' },
      ] as any[];
      expect(findMetadataEntry(entries)).toBeNull();
    });

    it('should prefer TIMESTAMP_METADATA over SUBMIT_METADATA', () => {
      const confirmedEntry = { filename: TIMESTAMP_METADATA };
      const submitEntry = { filename: SUBMIT_METADATA };
      const entries = [
        { filename: 'file.txt' },
        submitEntry,
        confirmedEntry,
      ] as any[];
      const result = findMetadataEntry(entries);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('confirmed');
      expect(result!.entry.filename).toBe(TIMESTAMP_METADATA);
    });

    it('should return pending when only SUBMIT_METADATA exists', () => {
      const submitEntry = { filename: SUBMIT_METADATA };
      const entries = [{ filename: 'file.txt' }, submitEntry] as any[];
      const result = findMetadataEntry(entries);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('pending');
      expect(result!.entry.filename).toBe(SUBMIT_METADATA);
    });
  });

  describe('getMetadataType', () => {
    it('should return null for null entry', () => {
      expect(getMetadataType(null)).toBeNull();
    });

    it('should return "confirmed" for TIMESTAMP_METADATA filename', () => {
      expect(getMetadataType({ filename: TIMESTAMP_METADATA } as any)).toBe('confirmed');
    });

    it('should return "pending" for SUBMIT_METADATA filename', () => {
      expect(getMetadataType({ filename: SUBMIT_METADATA } as any)).toBe('pending');
    });

    it('should return null for other filenames', () => {
      expect(getMetadataType({ filename: 'file.txt' } as any)).toBeNull();
      expect(getMetadataType({ filename: NFT_METADATA } as any)).toBeNull();
    });
  });

  describe('shouldUpgrade', () => {
    it('should return false when metadataType is confirmed', () => {
      const metadata = { status: 'pending', transactionHash: undefined } as TimestampMetadata;
      expect(shouldUpgrade(metadata, 'confirmed')).toBe(false);
    });

    it('should return true when metadataType is pending', () => {
      const metadata = { status: 'confirmed', transactionHash: '0xabc' } as TimestampMetadata;
      expect(shouldUpgrade(metadata, 'pending')).toBe(true);
    });

    it('should return true when metadata has no transactionHash', () => {
      const metadata = { status: 'pending' } as TimestampMetadata;
      expect(shouldUpgrade(metadata, null)).toBe(true);
    });

    it('should return true when metadata status is pending', () => {
      const metadata = { status: 'pending', transactionHash: '0xabc' } as TimestampMetadata;
      expect(shouldUpgrade(metadata, null)).toBe(true);
    });

    it('should return false when confirmed metadata and has transactionHash', () => {
      const metadata = { status: 'confirmed', transactionHash: '0xabc' } as TimestampMetadata;
      expect(shouldUpgrade(metadata, 'confirmed')).toBe(false);
    });
  });

  describe('getMetadataFileNames', () => {
    it('should return TIMESTAMP_METADATA and SUBMIT_METADATA', () => {
      const names = getMetadataFileNames();
      expect(names).toEqual([TIMESTAMP_METADATA, SUBMIT_METADATA]);
    });

    it('should return array of length 2', () => {
      expect(getMetadataFileNames().length).toBe(2);
    });
  });

  describe('verifyMerkleProofLocal', () => {
    const zeros32 = '0'.repeat(64);
    const ones32 = 'f'.repeat(64);

    it('should return true for empty proof when digest equals batchMerkleRoot', () => {
      expect(verifyMerkleProofLocal(zeros32, zeros32, [])).toBe(true);
      expect(verifyMerkleProofLocal('0x' + zeros32, '0x' + zeros32, [])).toBe(true);
    });

    it('should return false for empty proof when digest does not equal batchMerkleRoot', () => {
      expect(verifyMerkleProofLocal(zeros32, ones32, [])).toBe(false);
    });

    it('should return true for valid single-element proof', () => {
      // Build a 2-leaf tree: leaf1, leaf2, root = keccak256(sorted(leaf1, leaf2))
      const leaf1 = ethers.zeroPadValue('0x00', 32);
      const leaf2 = ethers.zeroPadValue('0x01', 32);
      const left = Buffer.from(ethers.getBytes(leaf1));
      const right = Buffer.from(ethers.getBytes(leaf2));
      const [a, b] = Buffer.compare(left, right) <= 0 ? [leaf1, leaf2] : [leaf2, leaf1];
      const root = ethers.keccak256(ethers.concat([ethers.getBytes(a), ethers.getBytes(b)]));
      const digestHex = leaf1.slice(2);
      const rootHex = root.slice(2);
      const proofHex = leaf2.slice(2);
      expect(verifyMerkleProofLocal(digestHex, rootHex, [proofHex])).toBe(true);
    });

    it('should return false when proof is invalid', () => {
      const digest = zeros32;
      const wrongRoot = ones32;
      const wrongProof = ['1'.repeat(64)];
      expect(verifyMerkleProofLocal(digest, wrongRoot, wrongProof)).toBe(false);
    });

    it('should return false for invalid digest length', () => {
      // digest must be 64 hex chars (32 bytes)
      expect(verifyMerkleProofLocal('short', zeros32, [])).toBe(false);
      expect(verifyMerkleProofLocal(zeros32 + 'extra', zeros32, [])).toBe(false);
    });

    it('should accept 0x-prefixed hex', () => {
      expect(verifyMerkleProofLocal('0x' + zeros32, '0x' + zeros32, [])).toBe(true);
    });
  });

  describe('getEthTimestampEntry', () => {
    it('should return null when zip has no getDirectory', () => {
      const zip = {} as ZipkitLike;
      expect(getEthTimestampEntry(zip)).toBeNull();
    });

    it('should return null when directory is empty', () => {
      const zip: ZipkitLike = { getDirectory: () => [] };
      expect(getEthTimestampEntry(zip)).toBeNull();
    });

    it('should prefer TIMESTAMP_METADATA over SUBMIT_METADATA', () => {
      const confirmedEntry = { filename: TIMESTAMP_METADATA } as ZipEntryLike;
      const submitEntry = { filename: SUBMIT_METADATA } as ZipEntryLike;
      const zip: ZipkitLike = {
        getDirectory: () => [submitEntry, confirmedEntry],
      };
      expect(getEthTimestampEntry(zip)).toBe(confirmedEntry);
    });

    it('should return SUBMIT_METADATA entry when only pending exists', () => {
      const submitEntry = { filename: SUBMIT_METADATA } as ZipEntryLike;
      const zip: ZipkitLike = {
        getDirectory: () => [{ filename: 'file.txt' }, submitEntry],
      };
      expect(getEthTimestampEntry(zip)).toBe(submitEntry);
    });

    it('should return null when no timestamp metadata entry exists', () => {
      const zip: ZipkitLike = {
        getDirectory: () => [
          { filename: 'file.txt' } as ZipEntryLike,
          { filename: NFT_METADATA } as ZipEntryLike,
        ],
      };
      expect(getEthTimestampEntry(zip)).toBeNull();
    });

    it('should call getDirectory with true to include metadata', () => {
      const getDirectory = jest.fn(() => []);
      const zip: ZipkitLike = { getDirectory };
      getEthTimestampEntry(zip);
      expect(getDirectory).toHaveBeenCalledWith(true);
    });
  });
});
