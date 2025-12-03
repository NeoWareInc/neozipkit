# neozipkit

Advanced ZIP file creation and verification library with blockchain timestamping and NFT tokenization capabilities.

> **⚠️ Alpha Version Warning**: NeoZipKit v0.3.0 is currently in **alpha** status. This means:
> - The API may change in future releases
> - Some features may be incomplete or experimental
> - Breaking changes may occur before the stable release
> - Use in production with caution and thorough testing
>
> We welcome feedback and contributions! Please report issues on [GitHub](https://github.com/NeoWareInc/neozipkit/issues).

## 🌟 Features

- **Advanced ZIP compression** with support for multiple compression methods (Deflate, ZStandard, Stored)
- **Streaming compression** for memory-efficient processing of large files
- **Blockchain timestamping** using OpenTimestamps for file integrity verification
- **NFT tokenization** for creating blockchain-backed ZIP file certificates
- **Hash-based verification** with Merkle tree support
- **Real-time progress tracking** for long-running operations
- **Browser and Node.js compatibility** with clean platform separation
- **TypeScript support** with full type definitions

## 📦 Installation

```bash
yarn add neozipkit
```

Or with npm:

```bash
npm install neozipkit
```

> **⚠️ Note**: NeoZipKit v0.3.0 is in **alpha** status. See the warning above for important information about using alpha versions.

## 🚀 Quick Start

### Basic Usage

NeoZipKit provides both browser and Node.js implementations for creating, extracting, and managing ZIP files.

**Node.js:**
```typescript
import { ZipkitNode } from 'neozipkit/node';

const zip = new ZipkitNode();

// Create a ZIP from files
await zip.createZipFromFiles(['file1.txt', 'file2.txt'], 'output.zip');

// Extract a ZIP file
await zip.extractZipFile('archive.zip', './output');
```

**Browser:**
```typescript
import { ZipkitBrowser } from 'neozipkit/browser-esm';

const zip = new ZipkitBrowser();
await zip.addFile(file, { level: 6 });
const zipBlob = await zip.createZipBlob();
```

### Examples

Complete, runnable examples are available in the `examples/` directory:

- **`examples/create-zip.ts`** - Create ZIP archives from multiple files
- **`examples/extract-zip.ts`** - Extract ZIP files to directories
- **`examples/list-zip.ts`** - List ZIP archive contents
- **`examples/blockchain-tokenize.ts`** - Create tokenized ZIP files with NFT minting
- **`examples/verify-tokenized-zip.ts`** - Verify tokenized ZIP files on blockchain

Run examples with:
```bash
ts-node examples/create-zip.ts
```

See [`examples/README.md`](examples/README.md) for detailed usage instructions and all available examples.

**Note:** The browser bundle includes all necessary polyfills (Buffer, crypto) automatically. No additional configuration is required.

## 🏗️ Package Architecture

### Source Code Structure

```
src/
├── Zipkit.ts                      # Core ZipKit class with buffer-based ZIP operations
├── ZipEntry.ts                    # ZIP entry handling
├── ZipCompress.ts                 # Compression algorithms
├── ZipDecompress.ts               # Decompression algorithms
├── Logger.ts                      # Logging utility
├── types.ts                       # Shared type definitions
├── version.ts                     # Version information
├── components/                    # Core ZIP utilities
│   ├── HashCalculator.ts          # Unified hash calculator (incremental hashing, accumulation, Merkle tree)
│   ├── ProgressTracker.ts         # Progress tracking
│   ├── Support.ts                 # Feature support detection
│   └── Util.ts                    # General utilities (CRC32 delegates to ZipCrypto)
├── constants/                     # Constants and definitions
│   ├── Errors.ts                  # Error definitions
│   └── Headers.ts                 # ZIP header constants
├── encryption/                    # Encryption utilities
│   ├── index.ts                   # Encryption exports
│   ├── Manager.ts                 # Encryption manager (unified interface)
│   ├── types.ts                   # Encryption types
│   └── ZipCrypto.ts               # ZIP crypto implementation (includes CRC32)
├── browser/                       # Browser-only implementations
│   ├── ZipkitBrowser.ts           # Browser ZIP operations with Blob support
│   └── index.ts                   # Browser-specific exports
├── node/                          # Node.js-only implementations
│   ├── ZipkitNode.ts              # Node.js file-based ZIP operations (extends Zipkit)
│   ├── ZipCompressNode.ts         # Node.js compression with file I/O
│   ├── ZipDecompressNode.ts       # Node.js decompression with file I/O
│   └── index.ts                    # Node.js exports
├── blockchain/                    # Blockchain integration module
│   ├── core/                      # Core blockchain functionality
│   │   ├── ZipkitOTS.ts           # OpenTimestamps utilities
│   │   ├── ZipkitVerifier.ts      # Token verification
│   │   ├── ZipkitMinter.ts        # NFT minting
│   │   ├── WalletManager.ts       # Core wallet management
│   │   ├── contracts.ts           # Contract addresses & ABIs
│   │   ├── types.ts               # Blockchain types
│   │   └── index.ts               # Core exports
│   ├── browser/                   # Browser blockchain components
│   │   ├── WalletManagerBrowser.ts    # Browser wallet management
│   │   ├── ZipkitMinterBrowser.ts     # Browser minting
│   │   ├── TokenVerifierBrowser.ts    # Browser token verification
│   │   └── index.ts               # Browser exports
│   ├── node/                      # Node.js blockchain components
│   │   └── WalletManagerNode.ts   # Node.js wallet management (file system)
│   │   └── index.ts               # Node.js exports
│   ├── index.ts                   # Main blockchain exports
│   └── README.md                  # Blockchain module documentation
├── types/                         # External module declarations
│   ├── index.ts                   # Type exports
│   ├── modules.d.ts               # Module declarations
│   └── opentimestamps.d.ts        # OpenTimestamps type definitions
└── index.ts                       # Main exports (all platforms)
```

### Architecture

NeoZipKit provides platform-specific implementations optimized for different environments:

- **`ZipkitBrowser`** - Browser implementation using Blob API for memory-efficient operations
- **`ZipkitNode`** - Node.js implementation with file-based streaming for large files

Both implementations support:
- Multiple compression methods (Deflate, ZStandard, Stored)
- Streaming for large files
- Progress tracking
- Hash verification (CRC-32, SHA-256)

## 📚 Import Patterns

### Browser Applications (Recommended)

```typescript
// Browser-only bundle (excludes Node.js dependencies)
import { ZipkitBrowser } from 'neozipkit/browser';
import { TokenMetadata } from 'neozipkit/browser';
```

### Universal Applications (Next.js, Node.js)

```typescript
// Main bundle
import Zipkit from 'neozipkit';
import { createTimestamp, verifyOts } from 'neozipkit/blockchain';
import { TokenMetadata } from 'neozipkit';
```

### Node.js-Only Components

```typescript
// Node.js-specific components
import { ZipkitNode } from 'neozipkit/node';
import { ZipCompress } from 'neozipkit';
import { createTimestamp, verifyOts } from 'neozipkit/blockchain';
import { ZipkitVerifier, ZipkitMinter } from 'neozipkit/blockchain';
```

### Blockchain Components

```typescript
// Blockchain functionality (works in both browser and Node.js)
import { 
  ZipkitVerifier, 
  ZipkitMinter, 
  WalletManager,
  createTimestamp,
  verifyOts 
} from 'neozipkit/blockchain';
```

## 🔗 Blockchain Integration

NeoZipKit includes comprehensive blockchain integration for creating and verifying tokenized ZIP files on Ethereum-compatible networks.

### Supported Features

- **NFT Tokenization**: Convert ZIP files into ERC-721 NFTs with complete metadata
- **Blockchain Verification**: Verify ZIP file authenticity against blockchain tokens
- **OpenTimestamps**: Bitcoin blockchain timestamping for file integrity
- **Multi-Network Support**: Base Mainnet, Base Sepolia, Ethereum, Polygon, Arbitrum
- **Smart Contracts**: Production-ready contracts for public and private tokenization

### Blockchain Components

- **`TokenVerifier`** - Verify tokenized ZIP files against blockchain
- **`NFTMinter`** - Mint NFTs for ZIP files
- **`TokenQuerier`** - Query token information from blockchain
- **`TokenCertificate`** - Generate certificates for tokenized files
- **`ZipTokenProcessor`** - Process ZIP files for tokenization
- **`WalletManager`** - Manage wallet connections and networks

### Usage

See the blockchain examples for complete implementations:
- **`examples/blockchain-tokenize.ts`** - Create and mint tokenized ZIP files
- **`examples/verify-tokenized-zip.ts`** - Verify tokenized ZIP files on blockchain

For detailed blockchain integration documentation, see [`src/blockchain/README.md`](src/blockchain/README.md).

## 🎯 Smart Contracts

The package includes production-ready smart contracts for ZIP file tokenization:

### Contract Types

#### 🌐 Public Contract (`NZIP-NFT.sol`)
- **Universal verification** - Anyone can verify any token
- **Public blockchain metadata** - All data visible on blockchain
- **Use cases**: Certificates, public records, open-source projects
- **Symbol**: `NZIP`


### Current Deployment

**✅ Production Contract (v2.10)**:
```
Address: 0x6313074922717351986929879903441992482216
Network: Base Sepolia
Version: 2.10.0
Status: ✅ ACTIVE - Use for all new integrations
Explorer: https://sepolia.basescan.org/address/0x6313074922717351986929879903441992482216
```

### Contract Deployment

For contract deployment and verification, see [`contracts/README.md`](contracts/README.md) for complete instructions.

## 🔧 Development

### Build Process

```bash
# Production build
yarn build

# Development build (for feature branches)
yarn dev:build

# Watch mode
yarn dev:watch
```

See [`DEV_BUILD.md`](DEV_BUILD.md) for details on the development build system.

### TypeScript Configuration

- **Target**: ES2020
- **Module**: CommonJS
- **Source**: `./src`
- **Output**: `./dist`
- **Declarations**: Generated alongside JavaScript files

## 📖 API Reference

### Zipkit Class

**Zipkit** is the core ZIP file processing library with dual-mode support for efficient handling of ZIP archives of any size.

#### Architecture

Zipkit uses a dual-mode architecture:
- **Buffer-based mode**: Entire ZIP file is loaded into memory for fast random access. Ideal for small to medium archives (< 100MB).
- **File-based mode**: ZIP file is accessed via file handles with chunked reading/writing. Ideal for large archives (> 100MB) to minimize memory usage.

#### Core Components

- **ZipCompress**: Handles compression of ZIP entries (STORED, DEFLATED, ZSTD)
- **ZipDecompress**: Handles decompression of ZIP entries with streaming support
- **Zipkit**: Core class that manages parsing and loading of ZIP file structure (buffer-based)
- **ZipkitNode**: Extends Zipkit with file-based operations for Node.js environments
- **zipEntries[]**: Protected array that serves as the single source of truth for ZIP entry order and metadata (accessible by subclasses, use `getDirectory()` for external access)

#### Entry Management

The `zipEntries[]` array is the central repository for all ZIP entries. It maintains the order of entries as they appear in the ZIP file's Central Directory, ensuring consistency between write order and read order. Entries are automatically added to this array when:
- Loading an existing ZIP file via `loadZip()` or `loadZipFile()`
- Creating new entries via `createZipEntry()`

**Note**: The `zipEntries[]` array is now **protected** (not public). External code should use `getDirectory()` to access entries. Subclasses (like `ZipkitNode` and `ZipkitBrowser`) can still access it directly.

#### Usage Patterns

See the examples directory for complete usage patterns:
- **Creating ZIPs**: `examples/create-zip.ts`
- **Extracting ZIPs**: `examples/extract-zip.ts`
- **Listing ZIPs**: `examples/list-zip.ts`

#### Compression Methods

Zipkit supports three compression methods:
- **STORED (0)**: No compression, data stored as-is
- **DEFLATED (8)**: Standard deflate compression (default)
- **ZSTD (93)**: Zstandard compression (faster, modern algorithm)

#### Hash Calculation

Zipkit calculates and verifies file integrity using:
- **CRC-32**: Standard ZIP checksum (always calculated via `ZipCrypto.crc32()`)
- **SHA-256**: Optional cryptographic hash for enhanced security

#### ZipDecompress Component

ZipDecompress is the decompression component of Zipkit, responsible for:
- Extracting entries from ZIP archives (buffer-based or file-based)
- Decompressing data using STORED, DEFLATED, or ZSTD methods
- Verifying file integrity via CRC-32 or SHA-256 hashes
- Streaming decompression for memory-efficient extraction of large files

**Methods:**
- `extract(entry, skipHashCheck?)`: Extracts a ZIP entry from a buffer-based ZIP archive
- `extractToFile(entry, outputPath, options?)`: Extracts a ZIP entry directly to disk with true streaming

**Supported Compression Methods:**
- **STORED (0)**: No decompression needed, data passed through unchanged
- **DEFLATED (8)**: Standard deflate decompression using pako library
- **ZSTD (93)**: Zstandard decompression (lazy initialization on first use)

**Hash Verification:**
By default, extracted data is verified against stored hashes:
- If entry has SHA-256 hash, it is verified
- Otherwise, CRC-32 checksum is verified
- Hash verification can be skipped by passing `skipHashCheck: true`

**Streaming Architecture:**
For file-based ZIPs, ZipDecompress uses a streaming architecture:
1. Reads compressed data in chunks from the ZIP file
2. Decompresses chunks incrementally
3. Writes decompressed chunks directly to output file
4. Calculates and verifies hash during decompression

#### ZipCompress Component

ZipCompress is the compression component of Zipkit, responsible for:
- Compressing data using STORED, DEFLATED, or ZSTD methods
- Calculating CRC-32 and SHA-256 hashes during compression
- Chunked processing for memory-efficient compression of large files
- Supporting both buffer-based and streaming compression modes

**Methods:**
- `compressData(entry, data, options?, onOutputBuffer?)`: Main compression entry point
- `deflateCompress(data, options?, bufferSize?, entry?, onOutputBuffer?)`: Compresses using deflate algorithm
- `zstdCompress(input, options?, bufferSize?, entry?, onOutputBuffer?)`: Compresses using Zstandard algorithm

**Compression Options:**
- `level`: Compression level 1-9 (0 = store, default: 6)
- `useSHA256`: Calculate SHA-256 hash in addition to CRC-32 (default: false)
- `useZstd`: Use Zstandard compression instead of deflate (default: false)
- `bufferSize`: Override default buffer size for chunked processing (default: 512KB)

**Compression Method Selection:**
ZipCompress automatically selects the compression method based on options:
- **STORED**: If `options.level === 0` or file is too small for ZSTD (< 100 bytes)
- **ZSTD**: If `options.useZstd === true` and file is >= 100 bytes
- **DEFLATED**: Default method (standard ZIP compression)

**Hash Calculation:**
Hash calculation is performed incrementally during compression using HashCalculator:
- **CRC-32**: Always calculated for standard ZIP compatibility (via `ZipCrypto.crc32()`)
- **SHA-256**: Calculated if `options.useSHA256 === true`

**Chunked Processing:**
For large files, ZipCompress processes data in chunks for memory efficiency:
- **STORED**: Outputs chunks directly without accumulating
- **DEFLATED**: Streams compression using chunked reader, can output incrementally
- **ZSTD**: Accumulates all chunks, then compresses (requires full buffer)

**Streaming Output:**
When `onOutputBuffer` callback is provided, compressed data chunks are written incrementally as they are produced, allowing writing compressed data directly to output streams without accumulating everything in memory.

#### Merkle Root Calculation

For blockchain integration, Zipkit can calculate Merkle roots from entry SHA-256 hashes, automatically excluding metadata files (META-INF/*) to ensure consistent calculation across different ZIP creation methods.

### Core Classes

- **`ZipKit`** - Core ZIP functionality (shared across all platforms, buffer-based)
- **`ZipkitBrowser`** - Browser-compatible ZIP operations (extends Zipkit, adds Blob support)
- **`ZipkitNode`** - Node.js file-based ZIP operations (extends Zipkit, adds file I/O)
- **`ZipEntry`** - ZIP entry representation and manipulation
- **`HashCalculator`** - Unified hash calculator supporting incremental hashing, hash accumulation, and Merkle tree operations

### Core Components

- **`ZipCompress`** - Compression algorithms (shared, handles both buffer and file modes)
- **`ZipDecompress`** - Decompression algorithms (shared, handles both buffer and file modes)
- **`ProgressTracker`** - Real-time progress tracking for operations
- **`EncryptionManager`** - Encryption manager (unified encryption interface)
- **`ZipCrypto`** - ZIP crypto implementation (includes CRC32 calculation)

### Blockchain Components

- **`ZipkitVerifier`** - Verify tokenized ZIP files against blockchain
- **`ZipkitMinter`** - Mint NFTs for ZIP files
- **`WalletManager`** - Manage wallet connections and networks
- **`createTimestamp`** - Create OpenTimestamps proofs
- **`verifyOts`** - Verify OpenTimestamps proofs

### Platform-Specific Components

#### Node.js Components

- **`ZipkitNode`** - Node.js file-based ZIP operations (extends Zipkit)
  
  **File Loading:**
  - `loadZipFile(filePath)` - Load ZIP from file path (asynchronous)
  - `loadZipFromFile(filePath)` - Alias for `loadZipFile()`
  
  **File Extraction:**
  - `extractZipFile(archivePath, destination, options?)` - Extract entire ZIP file to directory (main unzip function with comprehensive options)
  - `extractToFile(entry, outputPath, options?)` - Extract entry to file with streaming support
  - `extractEntryToFile(entry, outputPath, options?)` - Alias for `extractToFile()`
  - `extractEntryToPath(entry, outputPath, options?)` - Extract entry with advanced features (symlinks, hardlinks, timestamps, permissions)
  - `extractAll(outputDir, options?)` - Extract all entries to directory with progress tracking
  
  **File Compression:**
  - `compressFile(filePath, entry, options?)` - Compress a file from disk
  - `compressFileStream(filePath, entry, options?, onOutputBuffer?)` - Compress a file using streaming for large files
  - `compressData(entry, data, options?, onOutputBuffer?)` - Compress data buffer (overrides base class)
  
  **ZIP File Creation:**
  - `createZipFromFiles(filePaths, outputPath, options?)` - Create a ZIP file from multiple file paths
  - `addFileToZip(filePath, entryName?, options?)` - Add a file to the current ZIP
  
  **Advanced ZIP Creation (Low-level API):**
  - `initializeZipFile(outputPath)` - Initialize ZIP file for writing, returns ZipFileWriter
  - `prepareEntryFromFile(filePath, entryName?)` - Prepare ZipEntry from file path with metadata
  - `writeZipEntry(writer, entry, filePath, options?, callbacks?)` - Write a ZIP entry to the file
  - `writeCentralDirectory(writer, entries, options?)` - Write central directory
  - `writeEndOfCentralDirectory(writer, totalEntries, centralDirSize, centralDirOffset, comment?)` - Write end of central directory
  - `finalizeZipFile(writer)` - Finalize and close ZIP file
  
  **File Management:**
  - `getFileHandle()` - Get underlying file handle for advanced operations
  - `closeFile()` - Close file handle explicitly
  - `copyEntry(entry)` - Copy entry from file-based ZIP (returns Buffer)

#### Browser Components
- **`TokenVerifierBrowser`** - Browser-based token verification
- **`WalletManagerBrowser`** - Browser wallet management

### Constants and Types

- **`constants/Headers`** - ZIP header constants and compression methods
- **`constants/Errors`** - Error definitions
- **`types`** - TypeScript type definitions
- **`CMP_METHOD`** - Compression method constants

### Compression Methods

Zipkit supports three compression methods:
- **STORED (0)**: No compression, data stored as-is
- **DEFLATED (8)**: Standard deflate compression (default)
- **ZSTD (93)**: Zstandard compression (faster, modern algorithm)

See the examples for usage patterns with different compression methods.

## 🌐 Network Support

### Supported Networks

- **Base Sepolia** (Chain ID: 84532) - Testing
- **Base Mainnet** (Chain ID: 8453) - Production
- **Ethereum Mainnet** - Production
- **Polygon** - Production
- **Arbitrum** - Production

### Network Configuration

Network configurations are defined in `src/blockchain/core/contracts.ts`. Supported networks include Base Mainnet, Base Sepolia, Ethereum, Polygon, and Arbitrum.

See the blockchain examples for network usage.

## 🔐 Security Considerations

### Private Key Security

**CRITICAL**: Never commit private keys to version control or hardcode them in your code.

- ✅ **Use environment variables** - Store private keys in `.env` file (see `.env.example`)
- ✅ **Testnet only for examples** - Never use mainnet keys in examples
- ✅ **Exclude sensitive files** - Wallet files and `.env` files are automatically excluded from git
- ✅ **Secure key management for production** - Use HSMs or KMS for production applications

**Quick Security Checklist:**
- [ ] Private keys stored in environment variables (not hardcoded)
- [ ] `.env` file excluded from git (automatically via `.gitignore`)
- [ ] Wallet files excluded from git (automatically via `.gitignore`)
- [ ] Only testnet keys used for examples
- [ ] Secure key management for production deployments

For comprehensive security guidelines, see [SECURITY.md](SECURITY.md).

### Development Best Practices

- **Private Keys**: Never commit private keys or mnemonics to version control
- **Environment Variables**: Use `.env` file for private keys (see `.env.example` template)
- **Network Security**: Use secure RPC endpoints and validate all inputs
- **Smart Contract Audits**: Audit contracts before production deployment
- **Error Handling**: Implement comprehensive error handling for all operations
- **Type Safety**: Leverage TypeScript for compile-time error detection

### File Verification

- **Merkle Trees**: All ZIP files use cryptographic Merkle trees for integrity verification
- **Blockchain Anchoring**: Timestamps and hashes are anchored to blockchain networks
- **Multi-Layer Verification**: Support for both OpenTimestamps and NFT-based verification

## 📦 Dependencies

### Core Dependencies

- **`ethers`** (peer dependency) - Blockchain operations
- **`opentimestamps`** - Bitcoin blockchain timestamping
- **`uuid`** - Unique identifier generation
- **`web3`** (peer dependency) - Alternative blockchain interface

### Development Dependencies

- **`@types/node`** - Node.js type definitions
- **`typescript`** - TypeScript compiler

## 🤝 Contributing

### Development Setup

1. Clone the repository and install dependencies: `yarn install`
2. Make changes to TypeScript files in `src/`
3. Run `yarn dev:build` for development builds
4. Test changes using the examples: `ts-node examples/create-zip.ts`
5. Commit only source files, not generated files

### Making Changes

- Edit TypeScript files in `src/` directories
- Update exports in `src/index.ts` if adding new public modules
- Update `package.json` exports if creating new public modules
- Run build process to generate JavaScript
- Test using examples before submitting PRs

For detailed contributing guidelines, see [`REPOSITORY_MANAGEMENT.md`](REPOSITORY_MANAGEMENT.md).

## 📄 License

MIT

## 🎉 Getting Started

Ready to start using NeoZipKit? Here are some next steps:

1. **Install the package**: `yarn add neozipkit@0.3.0-alpha` (or `yarn add neozipkit@alpha` for latest alpha)
2. **Run the examples**: Start with `ts-node examples/create-zip.ts` to see basic usage
3. **Explore the examples**: Check [`examples/README.md`](examples/README.md) for all available examples
4. **Read the API docs**: See the API Reference section below for detailed method documentation
5. **Try blockchain features**: Run `examples/blockchain-tokenize.ts` for NFT tokenization

For detailed examples and advanced usage, explore the `examples/` directory and [`src/blockchain/README.md`](src/blockchain/README.md) for blockchain integration.