# What’s New in NeoZipKit

## 0.6.1 (2026-03-30)

### ZipkitNode: read `FileHandle` lifecycle (Node.js)

- **`loadZipFile()`** now **closes any previously opened read handle** before resetting state and opening a new path. Calling `loadZipFile()` again on the **same** `ZipkitNode` used to assign `this.fileHandle = null` without closing the underlying `fs.promises.FileHandle`, which could leak descriptors and trigger Node’s **DEP0137** warning (closing `FileHandle` during garbage collection is deprecated).
- **Failed loads:** If opening or parsing fails after the handle is created, the handle is closed and file state is reset so the instance is not left with a dangling handle.
- **`closeFile()`** now also clears **`filePath`** and **`fileSize`** so “closed” matches “no archive loaded” metadata.

See [README.md — ZipkitNode and file handles](README.md#zipkitnode-and-file-handles-nodejs) for usage notes.

---

## 0.6.0 (2025-01-27)

### AES-256 encryption support

This release adds **full support for AES-256 encryption** in ZIP archives, in addition to the existing ZIP (Legacy) encryption.

- **WinZip-compatible AES-256 (AE-1/AE-2)**  
  Archives use the same format as WinZip AES encryption. You can create encrypted ZIPs in NeoZipKit and open them in WinZip, 7-Zip, The Unarchiver (`unar`/`lsar`), and other tools that support the [WinZip AES specification](https://www.winzip.com/en/support/aes-encryption/).

- **Create AES-256 encrypted ZIPs**  
  Pass a password and `encryptionMethod: 'aes256'` in your compress options:

  ```ts
  const zip = new ZipkitNode();
  await zip.createZipFromFiles(
    ['file1.txt', 'file2.txt'],
    'secure.zip',
    {
      password: 'YourStrongPassword',
      encryptionMethod: 'aes256',
      level: 6,
    }
  );
  ```

- **Extract AES-256 encrypted ZIPs**  
  Pass the same password when extracting; decryption is automatic when the archive uses AES:

  ```ts
  await zip.extractZipFile('secure.zip', './out', { password: 'YourStrongPassword' });
  ```

- **Cryptography**  
  - **Key derivation:** PBKDF2-HMAC-SHA1 (1000 iterations) with a 16-byte random salt per entry.  
  - **Encryption:** AES-256 in CTR mode (little-endian counter, WinZip convention).  
  - **Integrity:** HMAC-SHA1 over the ciphertext (10-byte authentication code per entry).

- **Browser support**  
  The browser bundle includes a crypto shim so AES-256 works in environments without Node’s `crypto` module (e.g. ESM/UMD in the browser). No extra dependencies are required.

- **API**  
  - **`EncryptionMethod.AES_256`** – Use with `EncryptionManager` and encryption options.  
  - **`AesCrypto`** – Static helpers `encryptBuffer` / `decryptBuffer` for WinZip AES-256; used internally by compress/decompress.  
  - **Compress options:** `password` and `encryptionMethod: 'aes256'` for file-based and buffer-based creation.

### Other changes

- **Encryption flag fix** – Local file headers now set the encryption bit correctly for all encrypted entries (including the last file), so central directory and local headers stay in sync (see `docs/ENCRYPTION_FLAG_BUG_FIX.md`).
- **Copy/append API** – `ZipCopyNode` and core `ZipCopy` support copy-entries-only plus finalize (central directory + EOCD) for building archives by copying then appending.
- **Scripts and docs** – Scripts reviewed and documented (`docs/SCRIPTS_REVIEW.md`); unused buffer shim removed from the browser build.

### Examples and tests

- **Examples:** `examples/test-aes.ts` (NeoEncrypt, default) and `examples/test-winzip-aes.ts` (WinZip-compatible) create and verify AES-256 ZIPs in one run.  
  Run: `yarn example:test-aes`, `yarn example:test-winzip-aes`.
- **Unit tests:** AES-256 key derivation, CTR, HMAC, and extra-field handling are covered.  
  Run: `yarn test:aes`.

### Compatibility

- **Node.js:** Unchanged (e.g. Node 16+).
- **Browser:** AES-256 is supported in the ESM and UMD bundles via the built-in crypto shim.
- **Interop:** AES-256 ZIPs created with NeoZipKit open in WinZip, 7-Zip, and other AE-1/AE-2–compatible tools. Legacy ZIP crypto remains supported for create and extract.

---

For security considerations and password handling, see [SECURITY.md](SECURITY.md).
