# What’s New in NeoZipKit

Release notes for people who install and use **`neozipkit`** from npm. For blockchain timestamping and NFTs, see the sibling package [`neozip-blockchain`](https://www.npmjs.com/package/neozip-blockchain).

## Unreleased

Local build after **1.0.5**. Not on npm yet. ZipWiki consumes it with `file:../neozipkit/packages/neozipkit` until this build is published.

### Caller extra fields, including ZipWiki `0x014F`

`ZipEntry.createLocalHdr()` and `centralDirEntry()` write caller-supplied extra-field records beside **`0x014E`**, WinZip AES, and NeoEncrypt. Pass a buffer of complete records (header id + size + payload) on `entry.additionalExtra`.

- **`0x014F`** is ZipWiki’s origin locator (URI, size, mtime, CRC-32 or SHA-256). The id is `HDR_ID.ORIGIN`. The kit does not interpret the TLV; it stores and returns the bytes.
- Unknown extra ids survive a read. They are collected into `additionalExtra` so a later header rebuild does not drop them.
- `ZipCopyNode` copies local bytes as-is and copies `additionalExtra` onto the rebuilt central-directory header, so an origin tag survives a raw copy.
- Set `entry.emitUnicodePath = false` when the caller extra blob must be the only extra (ZipWiki pack does this). The default remains the Info-ZIP Unicode Path extra when the name needs it.
- Method **93** records version needed to extract **6.3** (63).

### Zstd on in-memory buffers, including the browser

Method 93 is no longer only a Node file stream.

- **Node:** `ZstdNode.compress`, `decompress`, `compressSync`, and `decompressSync` accept a `Buffer`, `Uint8Array`, or `ArrayBuffer`. `compressSyncAtLevel(data, zstdLevel)` uses a raw zlib zstd level (1–19). ZipWiki pack uses level **7** on that scale. The 1–9 kit scale (`mapCompressionLevel`, about `level * 2.1`) is unchanged for `createZipFromFiles` / `writeZipEntry`.
- **Browser:** the bundle no longer throws from the zstd stub. Compress and inflate use `CompressionStream` / `DecompressionStream` (`'zstd'`) on an `ArrayBuffer`. There is still no WASM codec. Sync `compressSync` / `decompressSync` are Node-only; the browser API is async. Browsers without `CompressionStream` zstd (and Node itself) throw a clear error. Deflate and store are unchanged.
- `inflateZipPayload(method, bytes)` (browser and core) and `inflateZipPayloadSync(method, buffer)` (`neozipkit/node`) inflate store (0), raw deflate (8), and zstd (93).

### In-memory and streaming writer

`ZipkitNode.writeMembersSync(path, members)` streams local headers, payloads, the central directory, and the EOCD to a file. `buildZipBufferSync(members)` builds the same archive as one `Buffer` for tests and small rewrites. `writeZipFileSync` is the same stream without the class.

- Default method is zstd **93** at raw level **7**. Pass `method: 0 | 8 | 93`. Empty payloads and payloads that do not shrink are stored.
- `useSHA256: true` writes Extra Field **`0x014E`**. `additionalExtra` is the caller block (`0x014F`). NeoEncrypt is not turned on.
- `precompressed` copies an existing method, compressed bytes, CRC-32, and extra blob without recompressing.

```ts
import { ZipkitNode } from 'neozipkit/node';

const zip = new ZipkitNode();
zip.writeMembersSync('notes.zipwiki', [
  {
    name: 'wiki/parsed/notes.txt.md',
    data: Buffer.from('# Notes\n'),
    method: 93,
    level: 7,
    additionalExtra: originExtra, // complete 0x014F record
  },
]);
```

### Merkle v1 on CRC-only archives

`getMerkleRootAsync()` (v1) now captures `merkleLeafV1` while `testEntry` checks CRC-32, not only when Extra Field `0x014E` is present. v0 is unchanged: bare `0x014E` digests for older archives.

### ESM import of `neozipkit/node`

The compiled kit is CommonJS. The package `import` condition is `node-esm.mjs`, so named imports (`ZipkitNode`, `buildZipBufferSync`, `ZipCopyNode`, Merkle helpers) work from ESM. `require('neozipkit/node')` still loads `dist/node/index.js`. `minimatch` is a runtime dependency of `ZipkitNode`.

---

## 1.0.5 (2026-08-14)

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

- **`getMerkleRootAsync()`** — preferred for **v1**: uses stream-captured `merkleLeafV1` when available, otherwise extracts content (buffer mode) or Node streaming `testEntry` (`ZipkitNode`)
- **`getMerkleRoot({ algorithm: 'v0' })`** — digests-only legacy root for old on-chain bindings
- **`getMerkleRoot()`** — v1 when leaves were already captured during create/hash; otherwise `null` (use async)
- Pure helpers / **`Zipkit.merkleRootFromEntries(...)`**: path normalize (NFC, `/`), path-ordered leaves, optional `merkleLeafV1`, `matchMerkleRoot` (§6.4-style v1→v0 fallback)

Leaves no longer sort by hash value or reorder parent pairs. During create/extract with `useSHA256`, **`HashCalculator`** computes bare digests and domain-separated **v1** leaves in the same streaming pass (`finalizeMerkleLeafV1` / entry `merkleLeafV1`).

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
