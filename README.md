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
- **Encryption** with ZIP crypto and AES support
- **Hash-based verification** with Merkle tree support (CRC-32, SHA-256)
- **Real-time progress tracking** for long-running operations
- **Browser and Node.js compatibility** with clean platform separation
- **TypeScript support** with full type definitions

## Installation

```bash
yarn add @neozip/neozipkit
```

Or with npm:

```bash
npm install @neozip/neozipkit
```

## Quick Start

### Node.js

```typescript
import { ZipkitNode } from '@neozip/neozipkit/node';

const zip = new ZipkitNode();

// Create a ZIP from files
await zip.createZipFromFiles(['file1.txt', 'file2.txt'], 'output.zip');

// Extract a ZIP file
await zip.extractZipFile('archive.zip', './output');
```

### Browser

```typescript
import { ZipkitBrowser } from '@neozip/neozipkit/browser-esm';

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

Run an example:

```bash
npx ts-node examples/create-zip.ts
```

See [`examples/README.md`](examples/README.md) for details.

## Blockchain integration

All blockchain code has been moved to a separate package. For timestamping, NFT tokenization, on-chain verification, wallet management, and OpenTimestamps, use **[neozip-blockchain](https://github.com/NeoWareInc/neozip-blockchain)**. It depends on NeoZipKit for ZIP handling and adds all blockchain features on top. NeoZipKit itself contains no blockchain, contract, or wallet code.

## Package layout

- **`@neozip/neozipkit`** – Main entry (core + platform detection)
- **`@neozip/neozipkit/node`** – Node.js-only (ZipkitNode, file I/O, streaming)
- **`@neozip/neozipkit/browser`** – Browser-only (ZipkitBrowser, Blob API)
- **`@neozip/neozipkit/browser-esm`** – Browser ESM bundle (tree-shaking)

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

### Core

- **Zipkit** – Core ZIP handling (buffer-based, shared)
- **ZipkitNode** – Node.js file-based operations (extends Zipkit)
- **ZipkitBrowser** – Browser Blob-based operations (extends Zipkit)
- **ZipEntry** – ZIP entry representation
- **ZipCompress** / **ZipDecompress** – Compression and decompression
- **HashCalculator** – CRC-32, SHA-256, Merkle root
- **EncryptionManager** / **ZipCrypto** – Encryption support

### Compression methods

- **STORED (0)** – No compression
- **DEFLATED (8)** – Deflate (default)
- **ZSTD (93)** – Zstandard

## Security

See [SECURITY.md](SECURITY.md) for security considerations and best practices.

## License

MIT
