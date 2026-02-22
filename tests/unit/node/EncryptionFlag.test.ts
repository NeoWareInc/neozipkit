/**
 * Unit tests for encryption flag bug fix
 * Tests that encryption flags are properly set in local headers for all files,
 * including the last file in the array when using createZipFromFiles with a password.
 */

import ZipkitNode from '../../../src/node/ZipkitNode';
import { CompressOptions } from '../../../src/core/ZipCompress';
import { LOCAL_HDR, GP_FLAG } from '../../../src/core/constants/Headers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Encryption Flag Bug Fix', () => {
  let tempDir: string;
  let testFiles: string[];
  let zipInstances: ZipkitNode[];

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zipkit-test-'));
    testFiles = [];
    zipInstances = [];

    // Create test files
    const file1 = path.join(tempDir, 'file1.txt');
    const file2 = path.join(tempDir, 'file2.txt');
    const file3 = path.join(tempDir, 'file3.txt');
    const file4 = path.join(tempDir, 'file4.txt');

    fs.writeFileSync(file1, 'Content of file 1');
    fs.writeFileSync(file2, 'Content of file 2');
    fs.writeFileSync(file3, 'Content of file 3');
    fs.writeFileSync(file4, 'Content of file 4 - this is the last file');

    testFiles = [file1, file2, file3, file4];
  });

  afterEach(async () => {
    // Close all file handles for all ZipkitNode instances
    for (const zip of zipInstances) {
      try {
        await zip.closeFile();
      } catch (error) {
        // Ignore errors if file handle is already closed
      }
    }
    zipInstances = [];

    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper function to read local header from ZIP file
   * Returns the bitFlags value from the local header
   */
  function readLocalHeaderBitFlags(zipPath: string, localHeaderOffset: number): number {
    const buffer = fs.readFileSync(zipPath);
    const flagsOffset = localHeaderOffset + LOCAL_HDR.FLAGS;
    return buffer.readUInt16LE(flagsOffset);
  }

  /**
   * Helper function to find all local header offsets in a ZIP file
   * Returns array of offsets for each local header
   */
  function findLocalHeaderOffsets(zipPath: string): number[] {
    const buffer = fs.readFileSync(zipPath);
    const offsets: number[] = [];
    let position = 0;

    // Search for local header signatures (PK\x03\x04)
    while (position < buffer.length - 4) {
      if (buffer.readUInt32LE(position) === LOCAL_HDR.SIGNATURE) {
        offsets.push(position);
        // Skip to next potential header (read filename length to calculate size)
        const fnameLen = buffer.readUInt16LE(position + LOCAL_HDR.FNAME_LEN);
        const extraLen = buffer.readUInt16LE(position + LOCAL_HDR.EXTRA_LEN);
        const localHeaderSize = LOCAL_HDR.SIZE + fnameLen + extraLen;
        const compressedSize = buffer.readUInt32LE(position + LOCAL_HDR.CMP_SIZE);
        position += localHeaderSize + compressedSize;
      } else {
        position++;
      }
    }

    return offsets;
  }

  it('should set encryption flag in local header for all files including the last one', async () => {
    const zip = new ZipkitNode();
    zipInstances.push(zip);
    const outputZip = path.join(tempDir, 'encrypted.zip');
    const password = 'test-password-123';

    const options: CompressOptions = {
      password,
      level: 6,
      useZstd: false
    };

    // Create ZIP with multiple files
    await zip.createZipFromFiles(testFiles, outputZip, options);

    // Verify ZIP file exists
    expect(fs.existsSync(outputZip)).toBe(true);

    // Find all local header offsets
    const localHeaderOffsets = findLocalHeaderOffsets(outputZip);

    // Should have 4 local headers (one for each file)
    expect(localHeaderOffsets.length).toBe(4);

    // Verify encryption flag is set in local header for ALL files
    for (let i = 0; i < localHeaderOffsets.length; i++) {
      const bitFlags = readLocalHeaderBitFlags(outputZip, localHeaderOffsets[i]);
      const isEncrypted = (bitFlags & GP_FLAG.ENCRYPTED) !== 0;

      expect(isEncrypted).toBe(true);
      expect(bitFlags & GP_FLAG.ENCRYPTED).toBe(GP_FLAG.ENCRYPTED);
    }

    // Specifically verify the last file (index 3)
    const lastFileBitFlags = readLocalHeaderBitFlags(outputZip, localHeaderOffsets[3]);
    expect(lastFileBitFlags & GP_FLAG.ENCRYPTED).toBe(GP_FLAG.ENCRYPTED);
  });

  it('should have consistent encryption flags in local header and central directory', async () => {
    const zip = new ZipkitNode();
    zipInstances.push(zip);
    const outputZip = path.join(tempDir, 'encrypted.zip');
    const password = 'test-password-123';

    const options: CompressOptions = {
      password,
      level: 6,
      useZstd: false
    };

    // Create ZIP with multiple files
    await zip.createZipFromFiles(testFiles, outputZip, options);

    // Load the ZIP to read central directory entries
    await zip.loadZipFile(outputZip);
    try {
      // Set password for decryption (needed to read encrypted entries)
      (zip as any).password = password;
      const entries = zip.getDirectory();

      // Find all local header offsets
      const localHeaderOffsets = findLocalHeaderOffsets(outputZip);

      // Verify consistency between local headers and central directory
      expect(entries.length).toBe(4);
      expect(localHeaderOffsets.length).toBe(4);

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const localHeaderBitFlags = readLocalHeaderBitFlags(outputZip, localHeaderOffsets[i]);
        const centralDirBitFlags = entry.bitFlags;

        // Both should have encryption flag set
        expect(localHeaderBitFlags & GP_FLAG.ENCRYPTED).toBe(GP_FLAG.ENCRYPTED);
        expect(centralDirBitFlags & GP_FLAG.ENCRYPTED).toBe(GP_FLAG.ENCRYPTED);

        // Flags should match
        expect(localHeaderBitFlags).toBe(centralDirBitFlags);
      }
    } finally {
      // Close file handle to prevent deprecation warnings
      await zip.closeFile();
    }
  });

  it('should work with different numbers of files', async () => {
    const zip = new ZipkitNode();
    zipInstances.push(zip);
    const password = 'test-password-123';

    const options: CompressOptions = {
      password,
      level: 6,
      useZstd: false
    };

    // Test with 1 file
    const singleFile = [testFiles[0]];
    const outputZip1 = path.join(tempDir, 'single.zip');
    await zip.createZipFromFiles(singleFile, outputZip1, options);
    const offsets1 = findLocalHeaderOffsets(outputZip1);
    expect(offsets1.length).toBe(1);
    expect(readLocalHeaderBitFlags(outputZip1, offsets1[0]) & GP_FLAG.ENCRYPTED).toBe(GP_FLAG.ENCRYPTED);

    // Test with 2 files
    const twoFiles = [testFiles[0], testFiles[1]];
    const outputZip2 = path.join(tempDir, 'two.zip');
    await zip.createZipFromFiles(twoFiles, outputZip2, options);
    const offsets2 = findLocalHeaderOffsets(outputZip2);
    expect(offsets2.length).toBe(2);
    for (const offset of offsets2) {
      expect(readLocalHeaderBitFlags(outputZip2, offset) & GP_FLAG.ENCRYPTED).toBe(GP_FLAG.ENCRYPTED);
    }

    // Test with all 4 files (already tested above, but included for completeness)
    const outputZip4 = path.join(tempDir, 'four.zip');
    await zip.createZipFromFiles(testFiles, outputZip4, options);
    const offsets4 = findLocalHeaderOffsets(outputZip4);
    expect(offsets4.length).toBe(4);
    for (const offset of offsets4) {
      expect(readLocalHeaderBitFlags(outputZip4, offset) & GP_FLAG.ENCRYPTED).toBe(GP_FLAG.ENCRYPTED);
    }
  });

  it('should not set encryption flag when no password is provided', async () => {
    const zip = new ZipkitNode();
    zipInstances.push(zip);
    const outputZip = path.join(tempDir, 'unencrypted.zip');

    const options: CompressOptions = {
      level: 6,
      useZstd: false
      // No password
    };

    // Create ZIP without password
    await zip.createZipFromFiles(testFiles, outputZip, options);

    // Find all local header offsets
    const localHeaderOffsets = findLocalHeaderOffsets(outputZip);

    // Verify encryption flag is NOT set for any file
    for (const offset of localHeaderOffsets) {
      const bitFlags = readLocalHeaderBitFlags(outputZip, offset);
      expect(bitFlags & GP_FLAG.ENCRYPTED).toBe(0);
    }
  });
});

