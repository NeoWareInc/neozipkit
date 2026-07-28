# What’s New in NeoZipKit

Release notes for people who install and use **`neozipkit`** from npm. For blockchain timestamping and NFTs, see the sibling package [`neozip-blockchain`](https://www.npmjs.com/package/neozip-blockchain).

## 1.0.0 (2026-07-28)

### First stable release

**1.0.0** is the first non-beta release. From here on, NeoZipKit follows [Semantic Versioning](https://semver.org/): breaking API changes bump the major version.

### Zstandard compression (Node.js)

Zstd (ZIP method **93**) now uses **Node.js built-in `zlib` streaming**. The previous WASM-based codec is removed.

**What this means for you:**

- Use Zstd only on **Node.js ≥ 22.15** or **≥ 23.8**.
- Archives are compatible with other tools that support ZIP method 93 / libzstd.
- Large files stay memory-efficient (chunked streaming, default buffer ~512 KiB).
- **Browsers do not support Zstd.** Use Deflate (or Stored) in the browser, or create/extract Zstd archives in Node.

```ts
import { ZipkitNode } from 'neozipkit/node';

const zip = new ZipkitNode();
await zip.createZipFromFiles(['file1.txt', 'file2.txt'], 'output.zip', {
  useZstd: true,
  level: 6,
});
```

**Upgrading from older NeoZipKit Zstd archives:** Older releases wrote frames with a small padding quirk. Extract still works; you can also scan an archive:

```ts
const hits = await zip.detectLegacyZstdEntries('old-archive.zip');
for (const { entry, detection } of hits) {
  if (detection.isLegacyWasm) {
    console.log(entry.filename, detection.confidence, detection.reason);
  }
}
```

### Streaming-first I/O (Node)

Node create/extract/list paths are **streaming** (read → hash → compress/encrypt → write in chunks). There is no separate “load the whole archive into a VM” mode.

- Prefer `ZipkitNode` file APIs for disk workflows.
- Buffer APIs remain for the browser and small in-process use cases.

### Compatibility snapshot

| Environment | Deflate / Stored | Zstd | AES-256 / NeoEncrypt / ZipCrypto |
|-------------|------------------|------|-----------------------------------|
| Node.js (see version above for Zstd) | Yes | Yes | Yes |
| Browser (ESM / UMD) | Yes | No | Yes |

---

## 0.6.1 (2026-03-30)

### More reliable file handle reuse (Node.js)

If you call `loadZipFile()` more than once on the same `ZipkitNode` instance, NeoZipKit now **closes the previous read handle** before opening the next file. Failed loads also clean up so handles are not left open. `closeFile()` clears path/size metadata so “closed” means no archive is loaded.

This avoids descriptor leaks and Node’s `FileHandle` GC deprecation warning when reusing a `ZipkitNode`.

---

## 0.6.0 (2025-01-27)

### AES-256 encryption

Full **WinZip-compatible AES-256 (AE-1/AE-2)** support, in addition to legacy ZIP encryption.

- Create and extract encrypted ZIPs in **Node and the browser**.
- Interop with WinZip, 7-Zip, The Unarchiver (`unar`/`lsar`), and other AE-1/AE-2 tools.

**Create:**

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

**Extract:**

```ts
await zip.extractZipFile('secure.zip', './out', {
  password: 'YourStrongPassword',
});
```

**How it works (summary):** PBKDF2-HMAC-SHA1 (1000 iterations), AES-256-CTR (WinZip little-endian counter), HMAC-SHA1 over ciphertext (10-byte auth code per entry).

Also in this release:

- Encryption bit set correctly on all encrypted local headers (including the last entry).
- Copy/append helpers for building archives by copying entries then finalizing the central directory.

**NeoEncrypt** (NeoZip-specific AES via extra field `0x024E`, normal compression method in headers) is available with `encryptionMethod: 'neo-aes256'`. See the package README for details.

---

For password handling and security notes, see the [SECURITY.md](https://github.com/NeoWareInc/neozipkit/blob/main/packages/neozipkit/SECURITY.md) in the repository.
