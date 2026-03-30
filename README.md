# neozipkit

Advanced ZIP file creation, compression, and encryption library for Node.js and the browser.

**Scope of this package:** NeoZipKit focuses solely on creating and manipulating ZIP files (compression, encryption, extraction). All blockchain-related functionality—timestamping, NFT tokenization, verification, wallet integration, and smart contracts—has been moved to **[neozip-blockchain](https://github.com/NeoWareInc/neozip-blockchain)**. Use that package when you need to link ZIPs to the blockchain.

> **⚠️ Alpha Version Warning**: NeoZipKit is currently in **alpha** status. This means:
> - The API may change in future releases
> - Some features may be incomplete or experimental
> - Breaking changes may occur before the stable release
> - Use in production with caution and thorough testing
>
> We welcome feedback and contributions! Please report issues on [GitHub](https://github.com/NeoWareInc/neozipkit/issues).

## Features

- **Advanced ZIP compression** with support for multiple compression methods (Deflate, ZStandard, Stored)
- **Streaming compression** for memory-efficient processing of large files
- **Encryption** with ZIP (Legacy), **AES-256** (WinZip-compatible AE-1/AE-2), and **NeoEncrypt** (NEO AES-256 via extra field `0x024E`, standard compression method in headers); create and extract in Node and browser
- **Hash-based verification** with Merkle tree support (CRC-32, SHA-256)
- **Real-time progress tracking** for long-running operations
- **Browser and Node.js compatibility** with clean platform separation
- **TypeScript support** with full type definitions

## Installation

```bash
yarn add neozipkit
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

Runnable examples are in the `examples/` directory:

- **`examples/create-zip.ts`** – Create ZIP archives from multiple files
- **`examples/extract-zip.ts`** – Extract ZIP files to directories
- **`examples/list-zip.ts`** – List ZIP archive contents
- **`examples/copy-zip.ts`** – Copy and modify ZIP archives
- **`examples/create-aes-zip.ts`** – Create AES-256 encrypted ZIPs (WinZip-compatible)
- **`examples/extract-aes-zip.ts`** – Extract and verify AES-256 encrypted ZIPs
- **`examples/create-neo-aes-zip.ts`** / **`examples/extract-neo-aes-zip.ts`** – NeoEncrypt (NeoZip-only) AES-256 ZIPs
- **`examples/list-encrypted-zip-verbose.ts`** – Verbose central-directory dump for encrypted entries (WinZip AES, NeoEncrypt, extras)

Run an example:

```bash
npx ts-node examples/create-zip.ts
```

See [`examples/README.md`](examples/README.md) for details.

## Blockchain integration

All blockchain code has been moved to a separate package. For timestamping, NFT tokenization, on-chain verification, wallet management, and OpenTimestamps, use **[neozip-blockchain](https://github.com/NeoWareInc/neozip-blockchain)**. It depends on NeoZipKit for ZIP handling and adds all blockchain features on top. NeoZipKit itself contains no blockchain, contract, or wallet code.

## Package layout

- **`neozipkit`** – Main entry (core + platform detection)
- **`neozipkit/node`** – Node.js-only (ZipkitNode, file I/O, streaming)
- **`neozipkit/browser`** – Browser-only (ZipkitBrowser, Blob API)
- **`neozipkit/browser-esm`** – Browser ESM bundle (tree-shaking)

## Development

```bash
# Install
yarn install

# Build
yarn build

# Dev build (feature branches)
yarn dev:build

# Tests
yarn test
yarn test:examples
```

See [`docs/DEV_BUILD.md`](docs/DEV_BUILD.md) for the development build system.

## API overview

### ZipkitNode and file handles (Node.js)

`ZipkitNode.loadZipFile()` opens the archive with `fs.promises.open()`. You should call **`closeFile()`** when you are done reading so the `FileHandle` is released promptly. Node deprecates relying on garbage collection to close handles ([DEP0137](https://nodejs.org/api/deprecations.html#DEP0137)).

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

- **ZIP (Legacy)** – Classic ZIP encryption; use `password` in options (no `encryptionMethod`).
- **AES-256** – WinZip-compatible (AE-1/AE-2); use `password` and `encryptionMethod: 'aes256'` in compress options. Create and extract supported in Node and browser. See [WHATS_NEW.md](WHATS_NEW.md#060-2025-01-27) for details. For on-disk layout (headers, extra field 0x9901), AE-1 vs AE-2, and how this differs from ZipCrypto and PKWARE strong encryption, see [docs/WINZIP_AES_FORMAT.md](docs/WINZIP_AES_FORMAT.md).
- **NeoEncrypt (NEO AES-256)** – NeoZip-specific: use `password` and `encryptionMethod: 'neo-aes256'`. The LO/CEN compression method stays a normal ZIP code (e.g. deflate, zstd); encryption is indicated by the encrypted flag plus extra field `0x024E`. Ciphertext layout matches the WinZip AES stream (PBKDF2, CTR, HMAC). Specification: [docs/NEO_CRYPTO_FORMAT.md](docs/NEO_CRYPTO_FORMAT.md).

## What’s new

See [WHATS_NEW.md](WHATS_NEW.md) for release notes. **v0.6.1** fixes **ZipkitNode** read handle lifecycle (reuse and failed loads; see above). **v0.6.0** adds full **AES-256 encryption** (create and extract, Node and browser, WinZip-compatible).

## Security

See [SECURITY.md](SECURITY.md) for security considerations and best practices.

## License

MIT
