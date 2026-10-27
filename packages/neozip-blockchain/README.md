# neozip-blockchain

Blockchain functionality for NeoZip: **NeoZip Token Service timestamping** (stamp, upgrade, mint, verify), NFT minting, verification, and wallet management. Part of the [neozipkit monorepo](../../README.md).

> **Next release:** This package **2.0.0** (pairs with `neozipkit@1.6.0`). Publish this train **before** the next ZipWiki / neozip-cli releases. Format profile: [NEOZIP_APPNOTE.md](../neozipkit/NEOZIP_APPNOTE.md). See [WHATS_NEW.md](WHATS_NEW.md).

See [WHATS_NEW.md](WHATS_NEW.md) for release notes.

This package provides the client-side API and utilities that work with the sibling **[neozipkit](../neozipkit/)** package for full NZIP (NeoZip) workflows. The **NeoZip Token Service** is a **separate application**; this library contains the **NeoZip Token Service API client and helpers** used to communicate with that server (submit digests, poll for confirmations, fetch proofs, etc.). Run the NeoZip Token Service separately when using timestamping features.

## Features

- **NeoZip Token Service timestamping** (recommended): Submit digest to NeoZip Token Service, batch to blockchain, upgrade to TIMESTAMP.NZIP, mint NFT proof. Uses the **NeoZip Token Service API** in this repo to talk to a **separate NeoZip Token Service application**.
- **NFT Minting**: Mint ZIP file hashes as NFTs on Base network
- **Token Verification**: Verify ZIP file authenticity against blockchain
- **Wallet Management**: Browser and Node.js wallet integrations
- **Multi-Network Support**: Base Mainnet, Base Sepolia, and more
- **Examples**: Runnable scripts for stamp, upgrade, mint, verify, and token-create flows (see [`examples/README.md`](examples/README.md), `examples/`, and `package.json` `example:*` scripts)
- **Identity encryption**: Encrypt `.nzip` archives for ENS / address / Lit PKP recipients (`neozip-blockchain/encryption` + `neozip-blockchain/identity`). See [docs/ENCRYPTION.md](docs/ENCRYPTION.md).

## Installation

```bash
npm install neozip-blockchain
# or
pnpm add neozip-blockchain
```

For full NZIP creation and verification you typically use **neozipkit** together with this package:

```bash
npm install neozipkit neozip-blockchain
```

`neozipkit` is a **peer dependency** (not bundled). Install both packages in your app; Yarn/npm will not resolve `workspace:*` from the registry.

## NeoZip Token Service (separate application)

The **NeoZip Token Service** is a **separate application** (not part of this repo). It runs the backend that batches digest submissions and writes timestamps to the blockchain. This library provides the **NeoZip Token Service API client and helpers** (`src/token-service/`) used by your app to:

- Submit digests and poll for confirmations
- Fetch TIMESTAMP.NZIP and proof data
- Support stamp → upgrade → mint workflows

Configure your app with a **network profile** (`TOKEN_SERVICE_NETWORK=base-sepolia` default, or `base` for production) or an explicit `TOKEN_SERVICE_URL`. Library helpers resolve the correct host:

| Profile | Chain | Host |
|---------|-------|------|
| `base-sepolia` (default) | 84532 | `https://testnet.token-service.neozip.io` |
| `base` | 8453 | `https://token-service.neozip.io` |

See `src/constants/servers.ts` (`resolveNetworkProfile`, `getTokenServiceUrlForNetwork`). Paid mainnet token purchase is stubbed (`isTokenPurchaseAvailable` → `false`). Run the NeoZip Token Service separately for timestamping. See `examples/` and `.env.sample`.

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

### NeoZip Token Service timestamping (stamp, upgrade, mint)

Use the NeoZip Token Service to stamp a ZIP (submit digest), upgrade once the batch is confirmed (get TIMESTAMP.NZIP), then mint an NFT. See examples: `stamp-zip`, `upgrade-zip`, `mint-nft`, `token-create`.

### Archive flows (any ZIP, `.nzip`, `.zipwiki`)

`neozip-blockchain/archive` works on a file path and needs no `ZipkitLike`: the v1 Merkle root is computed with neozipkit's `ZipReaderNode` (or pass your own `merkleRoot`), and proofs are written as `META-INF/` sidecars via `applyMetaSidecars`. Content members stay byte-identical (including `0x014F`).

```typescript
import { stampArchive, upgradeTimestamp, mintTimestampProof, verifyArchive } from 'neozip-blockchain/archive';
import { loadNeozipConnection } from 'neozip-blockchain/node';

const conn = loadNeozipConnection(); // env first (NEOZIP_RECIPIENT_EMAIL, NEOZIP_WALLET_PASSKEY, …)

await stampArchive('wiki.zipwiki', { email: conn!.email!, network: 'base-sepolia' }); // TS-SUBMIT.NZIP
await upgradeTimestamp('wiki.zipwiki', { wait: true });                              // TIMESTAMP.NZIP
await mintTimestampProof('wiki.zipwiki', { walletPrivateKey: conn!.walletPrivateKey! }); // TOKEN.NZIP

const r = await verifyArchive('wiki.zipwiki'); // offline by default; { online: true } asks the server / chain
// r.kind: 'none' | 'submit' | 'timestamp' | 'token'; r.merkle.match; r.status
```

Changing content invalidates sidecars (AppNote §8.6); `writeSidecars` drops stale conflicting ones. `mintDirect` mints straight from the wallet without a timestamp. Importing `neozip-blockchain/archive` loads `ethers` and `neozipkit/node`; the package root only exports the pure `build*Sidecar` helpers and flow types. The encrypted CLI secret store (`secrets.enc`) is not read: set `NEOZIP_TOKEN_SERVICE_ACCESS_TOKEN` / `NEOZIP_WALLET_PASSKEY`.

## Supported Networks

| Network | Chain ID | Status | NFT (library default) |
|---------|----------|--------|------------------------|
| Base Mainnet | 8453 | Production | v2.51 + TimestampReg v0.90 (legacy v2.10: `LEGACY_BASE_MAINNET_NFT_V210`) |
| Base Sepolia | 84532 | Testnet (default) | v2.51 + TimestampReg v0.90 |

## API Reference

### Core Exports

- `ZipkitMinter` - NFT minting functionality
- `ZipkitVerifier` - Token verification
- `CoreWalletManager` - Platform-agnostic wallet operations
- `WalletAnalyzer` - Wallet analysis and token scanning
- `CONTRACT_CONFIGS` - Network configurations
- `NZIP_CONTRACT_ABI` - Contract ABI

### NeoZip Token Service API (client for separate NeoZip Token Service app)

- `TokenServiceClient` - HTTP client for the NeoZip Token Service
- `submitDigest`, `verifyDigest`, `getTimestampProof`, etc. (see `src/token-service/`) - Helpers and verification used by examples and apps that talk to the NeoZip Token Service

### Browser Exports

- `WalletManagerBrowser` - Browser wallet with MetaMask support
- `ZipkitMinterBrowser` - Browser-based minting
- `TokenVerifierBrowser` - Browser token verification

### Node.js Exports

- `WalletManagerNode` - Node.js wallet management
- `ZipkitWallet` - Wallet utilities

## Integration with neozipkit

Both packages live in the same [monorepo](../../README.md). Versions may diverge when only one side needs a major (this train: **neozipkit@1.6.0** + **neozip-blockchain@2.0.0**). Use **[neozipkit](../neozipkit/)** for ZIP creation, merkle roots, and file handling; use this package for blockchain timestamping, NFT minting, and verification. They work together for full NZIP workflows:

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

## Publishing (npm)

The npm tarball is intentionally minimal: compiled **`dist/`**, the **package root [`README.md`](README.md)**, **[`WHATS_NEW.md`](WHATS_NEW.md)**, and **[`LICENSE`](LICENSE)** (`package.json` `"files"`). **`examples/`**, **`contracts/`**, and other repo docs are **not** on npm; use this repository for those.

Preview what will ship: run **`pnpm publish:dry-run`** (it uses **`npm publish --dry-run`**, which matches npm’s file list).

## Development

This package is part of the [neozipkit monorepo](../../README.md). From the **repository root**:

```bash
pnpm install
pnpm build        # builds neozipkit first, then neozip-blockchain
pnpm test:unit
```

To work on this package alone:

```bash
cd packages/neozip-blockchain
pnpm build
pnpm test
```

See the [monorepo README](../../README.md) for version management and release workflow.

Smart contracts (Solidity, ABI, deployments): see [`contracts/README.md`](contracts/README.md) and [`contracts/docs/`](contracts/docs/).

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## Links

- [neozipkit](../neozipkit/) — sibling ZIP processing package in this monorepo
- [neozipkit on npm](https://www.npmjs.com/package/neozipkit)
- [neozip-blockchain on npm](https://www.npmjs.com/package/neozip-blockchain)
- [GitHub repository](https://github.com/NeoWareInc/neozipkit)
- [Documentation](https://neozip.io/docs)
- [NeoWare](https://neoware.com)

**Note:** The **NeoZip Token Service** is a separate application (not in this repo). This library only contains the client API used to communicate with it.

