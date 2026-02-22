# Encryption Flag Bug Fix

## Problem Description

In `createZipFromFiles`, when a password is provided, the encryption flag (`bitFlags & 0x01`) was not being set in the local header for encrypted entries. This affected all files, but was particularly noticeable with the last file in the array.

### Symptoms

- ZIP files created with `createZipFromFiles` and a password had encryption flags set in the central directory but not in local headers
- ZIP readers that check the local header first would fail to recognize encrypted files
- The last file in the array was consistently missing the encryption flag in its local header
- Central directory and local headers were inconsistent regarding encryption status

### Root Cause

The bug occurred due to the order of operations in `writeZipEntry`:

1. **Local header written first** (line 563-576 in `src/node/ZipkitNode.ts`): The local header is created and written to disk before compression/encryption happens. At this point, `entry.bitFlags` does not have the encryption flag set.

2. **Encryption happens during compression** (line 434 in `src/node/ZipCompressNode.ts`): The encryption flag is set on `entry.bitFlags` during the compression process, after the local header has already been written.

3. **Only compressedSize and CRC are updated** (lines 631-641): After compression, the code updates the `compressedSize` and `crc` fields in the local header, but the `bitFlags` field is never updated.

4. **Central directory is correct** (line 424 in `src/core/ZipEntry.ts`): The central directory correctly reads from `entry.bitFlags` after encryption, so it has the correct encryption flag.

This created a mismatch: the central directory indicated encryption, but the local header did not.

## Solution

Update the `bitFlags` field in the local header after compression/encryption, similar to how `compressedSize` and `crc` are updated.

### Implementation

**File Modified**: `src/node/ZipkitNode.ts`

**Change**: Added code to update `bitFlags` in the local header after encryption is applied (after line 641):

```typescript
// Update bitFlags in local header if encryption was applied
// This is necessary because the local header is written before compression/encryption,
// but encryption flags are set during compression. We need to update the header afterward.
if (entry.isEncrypted || (entry.bitFlags & GP_FLAG.ENCRYPTED)) {
  const bitFlagsOffset = entry.localHdrOffset + LOCAL_HDR.FLAGS;
  const bitFlagsBuffer = Buffer.alloc(2);
  bitFlagsBuffer.writeUInt16LE(entry.bitFlags >>> 0, 0);
  fs.writeSync(writer.outputFd, bitFlagsBuffer, 0, 2, bitFlagsOffset);
}
```

### Why This Works

- The local header is written before encryption (as required by ZIP format for streaming)
- Encryption flags are set during compression/encryption
- After encryption, we update the local header's `bitFlags` field at the correct offset (offset 6)
- This ensures consistency between local headers and the central directory

## Testing

A comprehensive test suite was added in `tests/unit/node/EncryptionFlag.test.ts` that verifies:

1. **All files encrypted**: All files (including the last one) have the encryption flag set in their local headers
2. **Consistency**: Local headers and central directory have matching encryption flags
3. **Different file counts**: Works correctly with 1, 2, 4, or more files
4. **No false positives**: Files without passwords do not have encryption flags set

### Test Results

```bash
$ yarn test tests/unit/node/EncryptionFlag.test.ts

✓ should set encryption flag in local header for all files including the last one
✓ should have consistent encryption flags in local header and central directory
✓ should work with different numbers of files
✓ should not set encryption flag when no password is provided
```

## Verification Steps

To verify the fix works:

1. **Create a ZIP with multiple encrypted files**:
   ```typescript
   const zip = new ZipkitNode();
   await zip.createZipFromFiles(
     ['file1.txt', 'file2.txt', 'file3.txt', 'file4.txt'],
     'output.zip',
     { password: 'test-password' }
   );
   ```

2. **Read the ZIP file directly** and check local headers:
   ```typescript
   const buffer = fs.readFileSync('output.zip');
   // Find local header at offset
   const bitFlags = buffer.readUInt16LE(localHeaderOffset + 6);
   const isEncrypted = (bitFlags & 0x01) !== 0;
   // Should be true for all files
   ```

3. **Load and verify entries**:
   ```typescript
   await zip.loadZipFile('output.zip', 'test-password');
   const entries = zip.getDirectory();
   // All entries should have isEncrypted = true
   // All entries should have bitFlags & GP_FLAG.ENCRYPTED set
   ```

## Impact

- **Fixed**: All encrypted files now have consistent encryption flags in both local headers and central directory
- **Compatibility**: ZIP files created with this fix are fully compatible with standard ZIP readers
- **No breaking changes**: The fix only corrects incorrect behavior; no API changes required

## Related Files

- `src/node/ZipkitNode.ts` - Main fix location
- `src/node/ZipCompressNode.ts` - Where encryption flags are set during compression
- `src/core/ZipEntry.ts` - Entry class with bitFlags property
- `src/core/constants/Headers.ts` - GP_FLAG and LOCAL_HDR constants
- `tests/unit/node/EncryptionFlag.test.ts` - Test suite

## Date Fixed

2025-01-27

