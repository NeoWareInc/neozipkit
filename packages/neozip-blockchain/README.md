# neozip-blockchain

**Open-source companion to [neozipkit](https://www.npmjs.com/package/neozipkit)** — blockchain functionality for NeoZip: **Zipstamp server timestamping** (stamp, upgrade, mint, verify), NFT minting, verification, and wallet management.

> **Pre-1.0:** This package is under active development. The API may change before 1.0; use in production with caution.

This repository provides the client-side API and utilities that work with the **neozipkit** NPM package for full NZIP (NeoZip) workflows. The **Zipstamp server** is a **separate application**; this library contains the **Zipstamp server API client and helpers** used to communicate with that server (submit digests, poll for confirmations, fetch proofs, etc.). Run the Zipstamp server separately when using timestamping features.

## Features

- **Zipstamp server timestamping** (recommended): Submit digest to Zipstamp server, batch to blockchain, upgrade to TIMESTAMP.NZIP, mint NFT proof. Uses the **Zipstamp server API** in this repo to talk to a **separate Zipstamp server application**.
- **NFT Minting**: Mint ZIP file hashes as NFTs on Base network
- **Token Verification**: Verify ZIP file authenticity against blockchain
- **Wallet Management**: Browser and Node.js wallet integrations
- **Multi-Network Support**: Base Mainnet, Base Sepolia, and more
- **Examples**: Runnable scripts for stamp, upgrade, mint, verify, and token-create flows (see `examples/` and `examples/README.md`)

## Installation

```bash
npm install neozip-blockchain
# or
yarn add neozip-blockchain
```

For full NZIP creation and verification you typically use **neozipkit** together with this package:

```bash
npm install neozipkit neozip-blockchain
```

## Zipstamp server (separate application)

The **Zipstamp server** is a **separate application** (not part of this repo). It runs the backend that batches digest submissions and writes timestamps to the blockchain. This library provides the **Zipstamp server API client and helpers** (`src/zipstamp-server/`) used by your app to:

- Submit digests and poll for confirmations
- Fetch TIMESTAMP.NZIP and proof data
- Support stamp → upgrade → mint workflows

Configure your app with the Zipstamp server URL (e.g. `ZIPSTAMP_SERVER_URL`) and run the Zipstamp server separately when using timestamping features. See `examples/` and `.env.sample` for usage.

## Quick Start

### Minting a ZIP File NFT

```typescript
import { ZipkitMinter } from 'neozip-blockchain';

const minter = new ZipkitMinter('merkleRoot123...', {
  walletPrivateKey: '0x...',
  network: 'base-sepolia'
});

const result = await minter.mintToken();
console.log(`Token ID: ${result.tokenId}`);
```

### Verifying a Token

```typescript
import { ZipkitVerifier } from 'neozip-blockchain';

const verifier = new ZipkitVerifier({ debug: false });

// Verify token metadata
const result = await verifier.verifyToken(tokenMetadata);
if (result.success) {
  console.log('Token verified!');
}
```

### Wallet Management

```typescript
// Browser
import { WalletManagerBrowser } from 'neozip-blockchain/browser';

const wallet = new WalletManagerBrowser();
await wallet.connect();

// Node.js
import { WalletManagerNode } from 'neozip-blockchain/node';

const wallet = new WalletManagerNode();
await wallet.setupWallet(privateKey);
```

### Zipstamp server timestamping (stamp, upgrade, mint)

Use the Zipstamp server to stamp a ZIP (submit digest), upgrade once the batch is confirmed (get TIMESTAMP.NZIP), then mint an NFT. See examples: `stamp-zip`, `upgrade-zip`, `mint-nft`, `token-create`.

## Supported Networks

| Network | Chain ID | Status |
|---------|----------|--------|
| Base Mainnet | 8453 | Production |
| Base Sepolia | 84532 | Testnet |

## API Reference

### Core Exports

- `ZipkitMinter` - NFT minting functionality
- `ZipkitVerifier` - Token verification
- `CoreWalletManager` - Platform-agnostic wallet operations
- `WalletAnalyzer` - Wallet analysis and token scanning
- `CONTRACT_CONFIGS` - Network configurations
- `NZIP_CONTRACT_ABI` - Contract ABI

### Zipstamp server API (client for separate Zipstamp server app)

- `ZipstampServerClient` - HTTP client for the Zipstamp server
- `submitDigest`, `verifyDigest`, `getTimestampProof`, etc. (see `src/zipstamp-server/`) - Helpers and verification used by examples and apps that talk to the Zipstamp server

### Browser Exports

- `WalletManagerBrowser` - Browser wallet with MetaMask support
- `ZipkitMinterBrowser` - Browser-based minting
- `TokenVerifierBrowser` - Browser token verification

### Node.js Exports

- `WalletManagerNode` - Node.js wallet management
- `ZipkitWallet` - Wallet utilities

## OpenTimestamps (OTS) add-on

**Zipstamp server timestamping is the recommended and supported path.** OpenTimestamps (OTS) is provided as an **optional add-on** for Bitcoin-backed timestamps and backward compatibility. OTS may be **deprecated in a future release** in favor of Zipstamp server timestamps.

- **Access**: OTS is **not** on the main package entry. Use the subpath: `import { createTimestamp, verifyOtsZip } from 'neozip-blockchain/ots'`
- **Metadata**: OTS uses `TIMESTAMP.OTS` / `TS-SUBMIT.OTS`; Zipstamp server uses `TIMESTAMP.NZIP` / `TS-SUBMIT.NZIP`.
- **Functions**: `createTimestamp()`, `verifyOts()`, `verifyOtsZip()`, `deserializeOts()`, `parseVerifyResult()`, `upgradeOTS()`, `createOtsMetadataEntry()`, `getOtsEntry()`, `getOtsBuffer()`, `getMerkleRootSafe()`, `bufferToArrayBuffer()`
- **Note**: `upgradeOTS()` requires a Zipkit instance from neozipkit for ZIP file manipulation; pass it as the third argument.

## Integration with neozipkit

This project is the **open-source companion** to the **[neozipkit](https://www.npmjs.com/package/neozipkit)** NPM package. Use neozipkit for ZIP creation, merkle roots, and file handling; use this package for blockchain timestamping, NFT minting, and verification. They work together for full NZIP workflows:

```typescript
import { ZipkitNode } from 'neozipkit/node';
import { ZipkitMinter, ZipkitVerifier } from 'neozip-blockchain';

// Create and tokenize a ZIP
const zip = new ZipkitNode();
await zip.createZipFromFiles(files, 'archive.zip', { useSHA256: true });

// Get merkle root from ZIP
const merkleRoot = zip.getMerkleRoot();

// Mint as NFT
const minter = new ZipkitMinter(merkleRoot, {
  walletPrivateKey: process.env.WALLET_KEY,
  network: 'base-sepolia'
});
const result = await minter.mintToken();
```

## Smart Contracts

The NZIP-NFT smart contracts are included in the `contracts/` directory:

- `NZIP-NFT.sol` - Main NFT contract (v2.11)
- `NZIP-NFT-v2.10.sol` - Previous version
- Deployment scripts and configurations

### Contract Versions

| Version | Features |
|---------|----------|
| v2.11 | encryptedHash support, improved verification |
| v2.10 | Base production deployment |

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## Links

- [neozipkit (NPM)](https://www.npmjs.com/package/neozipkit) - ZIP file processing library; use with this package for full NZIP workflows
- [NeoZipKit (source)](https://github.com/NeoWareInc/neozipkit) - Open-source ZIP library repo
- [Documentation](https://neozip.io/docs)
- [NeoWare](https://neoware.com)

**Note:** The **Zipstamp server** is a separate application (not in this repo). This library only contains the client API used to communicate with it.

