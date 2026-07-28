# Zstd Compression Usage Guide

## Overview

NeoZipKit supports Zstandard (Zstd) as an alternative to Deflate. Compression uses **Node.js native `zlib` chunked streaming only** (standard libzstd-compatible frames). There is **no WASM zstd codec**.

| Environment | Support |
|-------------|---------|
| **Node.js** (≥ 22.15 or ≥ 23.8) | Native `zlib` Transform streaming via `ZstdNode` |
| **Browser** | Not supported — use Deflate, or create/extract zstd archives in Node |

## Compression Method Codes

- **Method 0**: STORED (no compression)
- **Method 8**: DEFLATE (standard ZIP compression)
- **Method 93**: ZSTD (Zstandard compression)

## Using Zstd Compression

```typescript
import ZipkitNode from 'neozipkit/node';

const zip = new ZipkitNode();

await zip.createZipFromFiles(
  ['file1.txt', 'file2.txt'],
  'output.zip',
  {
    level: 6,
    useZstd: true,
    useSHA256: true
  }
);
```

### Extracting Zstd-Compressed Files

```typescript
import ZipkitNode from 'neozipkit/node';

const zip = new ZipkitNode();
await zip.extractZipFile('input.zip', './output-directory');
```

## Streaming / chunking

All zstd create/extract paths feed data through chunked readers and `zlib` Transform streams (`createZstdCompress` / `createZstdDecompress`). Large entries are not loaded entirely into a single compress buffer.

## Compression Levels

Zipkit maps the usual 1–9 range onto zstd levels (~1–19):

| Zipkit Level | Approx. Zstd | Speed   | Compression |
|--------------|--------------|---------|-------------|
| 1            | 1–3          | Fastest | Lower       |
| 6 (default)  | ~12–13       | Balanced| Good        |
| 9            | 19           | Slower  | Best        |

## Memory

Memory scales with `bufferSize` (default ~512KB) plus zlib stream state — not with full entry size when streaming.

## Legacy WASM detection

Older NeoZipKit releases used `@oneidentity/zstd-js`. Detect those entries:

```typescript
import ZipkitNode, { detectLegacyWasmZstd } from 'neozipkit/node';

const zip = new ZipkitNode();
const hits = await zip.detectLegacyZstdEntries('old-archive.zip');
for (const { entry, detection } of hits) {
  if (detection.isLegacyWasm) {
    console.log(entry.filename, detection.confidence, detection.reason);
  }
}

// Or inspect a single compressed payload:
const result = await detectLegacyWasmZstd(compressedBytes, uncompressedSize, {
  verify: true,
  crc: entryCrc,
});
```

Extract paths automatically truncate zstd output to the ZIP `uncompressed_size` (same idea as Rust NeoZipKit), so legacy entries still extract when CRC matches the truncated payload.

## Troubleshooting

### “Native zstd requires Node.js…”

Upgrade to Node.js ≥ 22.15 or ≥ 23.8 (zlib ZSTD APIs).

### Browser `useZstd: true`

Throws: browser builds ship a stub only. Use Deflate in the browser, or Node for zstd.

## References

- [Zstandard](https://facebook.github.io/zstd/)
- [Node.js zlib ZSTD](https://nodejs.org/api/zlib.html)
