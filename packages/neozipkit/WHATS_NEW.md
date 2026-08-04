# What’s New in NeoZipKit

Release notes for people who install and use **`neozipkit`** from npm. For blockchain timestamping and NFTs, see the sibling package [`neozip-blockchain`](https://www.npmjs.com/package/neozip-blockchain).

## 1.0.3 (2026-08-04)

### NeoZip Application Note + APPNOTE §6 Merkle (v0 / v1)

Ships **[NEOZIP_APPNOTE.md](./NEOZIP_APPNOTE.md)** in the npm package (also linked from the README). Aligns the kit with the profile’s **wire foundations** and **§6 Merkle** algorithms (optional AI-aware `META-INF/manifest.json` is still forthcoming).

**Foundations:**

- Extra Field **`0x014E`** — per-entry SHA-256 of uncompressed payload (when `useSHA256: true`)
- Zstd method **93** when you opt in with `useZstd: true` (Node ≥ 22.15; Deflate remains the library default)
- **ASCII case-insensitive** discovery of reserved `META-INF/` paths (`TOKEN.NZIP`, `TIMESTAMP.NZIP`, `TS-SUBMIT.NZIP`, OTS twins, `manifest.json`)
- Merkle leaves exclude all **`META-INF/**`** entries

**Merkle root (APPNOTE §6):**

| Algorithm | Leaves | Odd node | Domain separation |
| :---- | :---- | :---- | :---- |
| **v1** (default, new archives) | `SHA-256(0x00 ‖ payload)` | Promote unhashed | `0x00` leaf / `0x01` parent |
| **v0** (legacy verify) | bare `0x014E` digests | Duplicate last (Bitcoin-style) | None |

**API:**

- **`getMerkleRootAsync()`** — preferred: extract content entries, compute **v1** root
- **`getMerkleRoot({ algorithm: 'v0' })`** — digests-only legacy root for old on-chain bindings
- **`getMerkleRoot()`** — v1 needs payloads; returns `null` when only Extra Field digests are available (use async)
- Pure helpers / **`Zipkit.merkleRootFromEntries(...)`**: path normalize (NFC, `/`), path-ordered leaves, `matchMerkleRoot` (§6.4-style v1→v0 fallback)

Leaves no longer sort by hash value or reorder parent pairs.

**Also:** NeoEncrypt (`0x024E` + real compression method) remains the default confidential write path; WinZip AES (method **99** + **`0x9901`**) is recognized for interop (APPNOTE §4.2). TypeScript 6: removed deprecated `baseUrl` from the package tsconfig.

Helpers: `findReservedMetaEntry`, `isMetaInfPath`, `isReservedMetaPath`, `asciiPathEqualsIgnoreCase`.

---

## 1.0.2 (2026-07-28)

### First stable release

**1.0.2** is the first non-beta release. From here on, NeoZipKit follows [Semantic Versioning](https://semver.org/): breaking API changes bump the major version.

*(Versions `1.0.0` / `1.0.1` were reserved earlier on npm and are not used for this stable line.)*

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

**Create (NeoEncrypt — default when only `password` is set):**

```ts
const zip = new ZipkitNode();
await zip.createZipFromFiles(
  ['file1.txt', 'file2.txt'],
  'secure.zip',
  {
    password: 'YourStrongPassword',
    // encryptionMethod: 'neo-aes256', // default when password is set
    level: 6,
  }
);
```

**Create (explicit WinZip AES write):** pass `encryptionMethod: 'aes256'` (method 99 + `0x9901`).

**Extract:** pass the same password; NeoZipKit auto-detects NeoEncrypt (`0x024E`), WinZip AES (method 99), or ZipCrypto.

**How it works (summary):** PBKDF2-HMAC-SHA1 (1000 iterations), AES-256-CTR (WinZip little-endian counter), HMAC-SHA1 over ciphertext (10-byte auth code per entry). NeoEncrypt and WinZip AES-256 share that ciphertext layout; headers differ (`0x024E` + real cmp method vs method 99 + `0x9901`).

Also in this release:

- Encryption bit set correctly on all encrypted local headers (including the last entry).
- Copy/append helpers for building archives by copying entries then finalizing the central directory.

**Naming note:** kit API `'aes256'` = WinZip **write**; product CLI `--aes256` / `-e` = **NeoEncrypt**. See [NEOZIP_APPNOTE.md](NEOZIP_APPNOTE.md) §4.2.

---

For password handling and security notes, see the [SECURITY.md](https://github.com/NeoWareInc/neozipkit/blob/main/packages/neozipkit/SECURITY.md) in the repository.
