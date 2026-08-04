# neozipkit

Advanced ZIP file creation, compression, and encryption library for Node.js and the browser.

**Scope of this package:** NeoZipKit focuses solely on creating and manipulating ZIP files (compression, encryption, extraction). All blockchain-related functionality—timestamping, NFT tokenization, verification, wallet integration, and smart contracts—lives in the sibling **[neozip-blockchain](../neozip-blockchain/)** package within this monorepo. Use that package when you need to link ZIPs to the blockchain.

**Format note:** See **[NEOZIP_APPNOTE.md](./NEOZIP_APPNOTE.md)** for the NeoZip ZIP profile (compression methods, Extra Field `0x014E`, `META-INF` integrity and blockchain sidecars).

> **Stable 1.0:** NeoZipKit **1.0.3** (first non-beta was **1.0.2**). See [NEOZIP_APPNOTE.md](./NEOZIP_APPNOTE.md) and [WHATS_NEW.md](WHATS_NEW.md). Please report issues on [GitHub](https://github.com/NeoWareInc/neozipkit/issues).



## Features

- **Advanced ZIP compression** with support for multiple compression methods (Deflate, ZStandard, Stored)
- **Streaming compression** for memory-efficient processing of large files
- **Encryption** with ZIP (Legacy), **NeoEncrypt** (default AES-256 via Extra Field `0x024E`), and **WinZip AES-256** (AE-1/AE-2, method 99 — write with `encryptionMethod: 'aes256'`, always readable on extract); create and extract in Node and browser
- **Hash-based verification** with Merkle tree support (CRC-32, SHA-256)
- **Real-time progress tracking** for long-running operations
- **Browser and Node.js compatibility** with clean platform separation
- **TypeScript support** with full type definitions



## Installation

```bash
pnpm add neozipkit
```

Or with npm:

```bash
npm install neozipkit
```



## Quick Start



### Node.js

```typescript
import { ZipkitNode } from 'neozipkit/node';

const zip = new ZipkitNode();

// Create a ZIP from files
await zip.createZipFromFiles(['file1.txt', 'file2.txt'], 'output.zip');

// Extract a ZIP file
await zip.extractZipFile('archive.zip', './output');
```



### Browser

```typescript
import { ZipkitBrowser } from 'neozipkit/browser-esm';

const zip = new ZipkitBrowser();
await zip.addFile(file, { level: 6 });
const zipBlob = await zip.createZipBlob();
```



### Examples

Runnable examples live **only in this repository**—they are **not** shipped in the [npm package](https://www.npmjs.com/package/neozipkit). Browse or clone the repo to use them.

On GitHub: [`packages/neozipkit/examples/`](https://github.com/NeoWareInc/neozipkit/tree/main/packages/neozipkit/examples) — see [`examples/README.md`](examples/README.md) for scripts (create/extract/list/copy ZIP, AES demos, encrypted listing) and how to run them from a checkout.

```bash
# From monorepo root, after pnpm install
cd packages/neozipkit
npx ts-node examples/create-zip.ts
```



## Blockchain integration

All blockchain code lives in the sibling **[neozip-blockchain](../neozip-blockchain/)** package within this monorepo. For timestamping, NFT tokenization, on-chain verification, wallet management, and OpenTimestamps, install `neozip-blockchain` alongside this package. It depends on `neozipkit` for ZIP handling and adds all blockchain features on top. NeoZipKit itself contains no blockchain, contract, or wallet code.

## Package layout

- `neozipkit` – Main entry (core + platform detection)
- `neozipkit/node` – Node.js-only (ZipkitNode, file I/O, streaming)
- `neozipkit/browser` – Browser-only (ZipkitBrowser, Blob API)
- `neozipkit/browser-esm` – Browser ESM bundle (tree-shaking)



## I/O model (aligned with Rust NeoZipKit)

**Node / CLI product path:** one streaming (chunked) engine — read → hash → compress/encrypt → write in ~512 KiB buffers. There is no separate full-archive “VM / in-memory” mode. Small entries may still use an in-API buffer fast path inside the same APIs.


| Surface                                 | Behavior                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ZipkitNode` create / extract / list    | File streaming (`loadZipFile`, `writeZipEntry`, `extractToFile`, …)                                           |
| Core `Zipkit.loadZip(Buffer)` / browser | Buffer APIs kept for browser and small in-process buffers                                                     |
| Zstd (method 93)                        | Node native `zlib` Transform streams only (no WASM). Requires Node ≥ 22.15                                    |
| Legacy WASM zstd archives               | Detect with `detectLegacyWasmZstd` / `ZipkitNode.detectLegacyZstdEntries`; extract truncates +18 zero padding |


See also: [docs/ZSTD_USAGE.md](docs/ZSTD_USAGE.md) and the Rust crate notes in `neozip-rust` (`crates/neozipkit/src/limits.rs`).

## Publishing (npm)

The published tarball includes **`dist/`**, **`src/`** (for `neozipkit/src` conditional exports), **[`README.md`](README.md)**, and **[`WHATS_NEW.md`](WHATS_NEW.md)**. **`examples/`** and other repo-only folders are excluded—use **`pnpm publish:dry-run`** (`npm publish --dry-run`) to preview the file list.

## Development

This package is part of the [neozipkit monorepo](../../README.md). From the **repository root**:

```bash
# Install all dependencies
pnpm install

# Build all packages (topological order)
pnpm build

# Run all unit tests
pnpm test:unit
```

To work on this package alone:

```bash
cd packages/neozipkit
pnpm build
pnpm test
```

See `[docs/DEV_BUILD.md](docs/DEV_BUILD.md)` for the development build system and the [monorepo README](../../README.md) for version management and release workflow.

## API overview



### ZipkitNode and file handles (Node.js)

`ZipkitNode.loadZipFile()` opens the archive with `fs.promises.open()`. You should call `closeFile()` when you are done reading so the `FileHandle` is released promptly. Node deprecates relying on garbage collection to close handles ([DEP0137](https://nodejs.org/api/deprecations.html#DEP0137)).

As of **v0.6.1**, `loadZipFile()` automatically **closes any prior read handle** before loading another path on the **same** instance, so reusing a `ZipkitNode` does not leak descriptors. `closeFile()` remains the right way to finish with the current archive.

### Core

- **Zipkit** – Core ZIP handling (buffer-based, shared)
- **ZipkitNode** – Node.js file-based operations (extends Zipkit)
- **ZipkitBrowser** – Browser Blob-based operations (extends Zipkit)
- **ZipEntry** – ZIP entry representation
- **ZipCompress** / **ZipDecompress** – Compression and decompression
- **HashCalculator** – CRC-32, SHA-256, Merkle root
- **EncryptionManager** / **ZipCrypto** – Legacy ZIP encryption
- **AesCrypto** / **EncryptionMethod.AES_256** – AES-256 encryption (WinZip AE-1/AE-2)



### Compression methods

- **STORED (0)** – No compression
- **DEFLATED (8)** – Deflate (default)
- **ZSTD (93)** – Zstandard



### Encryption

- **NeoEncrypt (default AES-256)** – When you pass a `password` and omit `encryptionMethod` (or set `'neo-aes256'`), NeoZipKit writes NeoEncrypt: standard compression method in the header + Extra Field `0x024E`. Spec: [docs/NEO_CRYPTO_FORMAT.md](docs/NEO_CRYPTO_FORMAT.md).  
  **Note:** kit API name `'aes256'` still means **WinZip write**; product CLI `--aes256` / `-e` means **NeoEncrypt**.
- **WinZip AES-256 (interop)** – Use `password` and `encryptionMethod: 'aes256'` to **write** AE-1/AE-2 (method 99 + Extra Field `0x9901`). Extract always recognizes WinZip AES when present. Layout: [docs/WINZIP_AES_FORMAT.md](docs/WINZIP_AES_FORMAT.md).
- **ZIP (Legacy / ZipCrypto)** – Classic ZIP encryption; use `password` with `encryptionMethod: 'zipcrypto'`.



## What’s new

See [WHATS_NEW.md](WHATS_NEW.md) for release notes. 

## Security

See [SECURITY.md](SECURITY.md) for security considerations and best practices.

## License

MIT