# Migration Guide: neozipkit to neozip-blockchain

This guide explains how to migrate from using blockchain functionality in `@neozip/neozipkit` to the standalone `neozip-blockchain` package.

## Overview

The `neozip-blockchain` package contains all blockchain-related functionality that was previously part of `neozipkit`. This separation allows:

1. **Smaller bundle sizes** - Only include blockchain code if you need it
2. **Independent updates** - Blockchain and ZIP functionality can be updated separately
3. **Cleaner architecture** - Clear separation of concerns between ZIP processing and blockchain operations

## Package Compatibility

| Feature | neozipkit | neozip-blockchain |
|---------|-----------|-------------------|
| ZIP file processing | ✅ | ❌ |
| NFT minting | ✅ | ✅ |
| Token verification | ✅ | ✅ |
| Wallet management | ✅ | ✅ |
| OpenTimestamps | ✅ | ✅ (partial*) |
| Smart contracts | ✅ | ✅ |

*OpenTimestamps functions that require ZIP manipulation need a Zipkit instance passed in.

## Import Changes

### Before (neozipkit)

```typescript
import { 
  ZipkitMinter, 
  ZipkitVerifier,
  WalletManagerBrowser,
  WalletManagerNode,
  createTimestamp,
  verifyOts
} from '@neozip/neozipkit/blockchain';

import { TokenMetadata, NetworkConfig } from '@neozip/neozipkit';
```

### After (neozip-blockchain)

```typescript
import { 
  ZipkitMinter, 
  ZipkitVerifier,
  WalletManagerBrowser,
  WalletManagerNode,
  createTimestamp,
  verifyOts,
  TokenMetadata,
  NetworkConfig
} from 'neozip-blockchain';

// Or import from submodules
import { ZipkitMinter, ZipkitVerifier } from 'neozip-blockchain/core';
import { WalletManagerBrowser } from 'neozip-blockchain/browser';
import { WalletManagerNode } from 'neozip-blockchain/node';
```

## API Compatibility

Most APIs remain identical. The main differences are:

### 1. ZipkitOTS Functions

Functions like `upgradeOTS` that need to modify ZIP files now accept an optional Zipkit instance:

```typescript
// Before (in neozipkit)
await upgradeOTS(zipFilePath, upgradedOts);

// After (in neozip-blockchain)
import ZipkitNode from '@neozip/neozipkit/node';

const zipkit = new ZipkitNode();
await upgradeOTS(zipFilePath, upgradedOts, zipkit);
```

### 2. TokenVerifierBrowser

The browser token verifier now accepts a generic `ZipkitLike` interface instead of requiring a specific `ZipkitBrowser` instance:

```typescript
// Works with neozipkit's ZipkitBrowser
import ZipkitBrowser from '@neozip/neozipkit/browser';
import { TokenVerifierBrowser } from 'neozip-blockchain/browser';

const zipkit = new ZipkitBrowser();
const verifier = new TokenVerifierBrowser(zipkit);
```

### 3. Types

All blockchain-related types are now exported directly from `neozip-blockchain`:

```typescript
import type {
  TokenMetadata,
  MintingOptions,
  MintingResult,
  VerificationResult,
  NetworkConfig,
  WalletSetupResult,
  // ... and more
} from 'neozip-blockchain';
```

## Using Both Packages Together

For full functionality (ZIP processing + blockchain), use both packages:

```typescript
import ZipkitNode from '@neozip/neozipkit/node';
import { ZipkitMinter, ZipkitVerifier } from 'neozip-blockchain';

// Create and process ZIP
const zipkit = new ZipkitNode();
await zipkit.createZipFromFiles(files, 'archive.zip', { useSHA256: true });
const merkleRoot = zipkit.getMerkleRoot();

// Mint as NFT
const minter = new ZipkitMinter(merkleRoot, {
  walletPrivateKey: process.env.WALLET_KEY,
  network: 'base-sepolia'
});
const result = await minter.mintToken();
```

## Contract Configurations

Contract addresses and network configurations are identical between packages:

```typescript
import { CONTRACT_CONFIGS, getContractConfig } from 'neozip-blockchain';

// Same configurations as neozipkit
const baseSepolia = getContractConfig(84532);
console.log(baseSepolia.address); // Contract address
console.log(baseSepolia.version); // "2.11"
```

## Peer Dependency

If you use neozip-blockchain features that require ZIP operations, install neozipkit as well:

```json
{
  "dependencies": {
    "@neozip/neozipkit": "^0.3.0",
    "neozip-blockchain": "^0.6.0"
  }
}
```

## Backward Compatibility

The `neozipkit` package continues to include all blockchain functionality for backward compatibility. Existing code using `@neozip/neozipkit/blockchain` will continue to work.

In a future version, `neozipkit` may re-export from `neozip-blockchain` internally, providing seamless migration.

## Questions?

If you encounter issues during migration, please:

1. Check this guide for common patterns
2. Review the [neozip-blockchain README](../README.md)
3. Open an issue on GitHub

---

*Last updated: December 2025*

