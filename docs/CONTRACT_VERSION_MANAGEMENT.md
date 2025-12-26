# Contract Version Management

This document describes the contract version management system in NeoZipKit, which provides a clean, maintainable way to handle different versions of the NZIP token contract.

## Overview

The version management system uses an **adapter pattern** to handle version-specific differences in contract function signatures, return types, and available fields. This allows the codebase to support multiple contract versions without scattered version-specific code.

## Architecture

### Components

1. **ContractVersionRegistry** (`src/blockchain/core/ContractVersionRegistry.ts`)
   - Central registry of contract versions and their capabilities
   - Defines what each version supports (e.g., `encryptedHash`, `fileName`)

2. **ContractVersionAdapter Interface** (`src/blockchain/core/adapters/ContractVersionAdapter.ts`)
   - Abstract interface for version-specific operations
   - Methods: `mintZipFile()`, `getZipFileInfo()`, `parseZipFileTokenizedEvent()`, `estimateGasForMint()`

3. **Version Adapters** (`src/blockchain/core/adapters/V2_10Adapter.ts`, `V2_11Adapter.ts`)
   - Concrete implementations for each contract version
   - Handle version-specific function signatures and data structures

4. **AdapterFactory** (`src/blockchain/core/adapters/AdapterFactory.ts`)
   - Factory to get the correct adapter based on version string
   - Normalizes version strings (e.g., "2.11.0" → "2.11")

5. **TOKEN File Format** (`META-INF/NZIP.TOKEN`)
   - Stores `contractVersion` and `networkChainId` as **required fields**
   - Enables adapter selection without on-chain queries

## Supported Versions

### v2.10
- **Features**: Basic tokenization, no `encryptedHash` support
- **Function Signature**: `publicMintZipFile(merkleRootHash, creationTimestamp, ipfsHash, metadataURI)`
- **getZipFileInfo Returns**: `(merkleRootHash, ipfsHash, creator, creationTimestamp, tokenizationTime, blockNumber)`

### v2.11
- **Features**: Adds `encryptedHash` support for encrypted ZIP files
- **Function Signature**: `publicMintZipFile(merkleRootHash, encryptedHash, creationTimestamp, ipfsHash, metadataURI)`
- **getZipFileInfo Returns**: `(merkleRootHash, encryptedHash, ipfsHash, creator, creationTimestamp, tokenizationTime, blockNumber)`

## Usage

### Getting an Adapter

```typescript
import { getContractAdapter, getContractAdapterByVersion } from './contracts';

// By chainId (uses version from CONTRACT_CONFIGS)
const adapter = getContractAdapter(84532); // Base Sepolia

// By version string
const adapter = getContractAdapterByVersion('2.11');
```

### Minting a Token

```typescript
const adapter = getContractAdapter(chainId);

const tx = await adapter.mintZipFile(
  contract,
  merkleRoot,
  encryptedHash,  // undefined for v2.10, optional for v2.11
  creationTimestamp,
  ipfsHash,
  metadataURI,
  { gasLimit, gasPrice }  // Optional gas options
);
```

### Reading Token Info

```typescript
const adapter = getContractAdapter(chainId);

const zipFileInfo = await adapter.getZipFileInfo(contract, tokenId);

// zipFileInfo includes all fields available for this version:
// - merkleRootHash (always)
// - encryptedHash (v2.11+)
// - ipfsHash, creator, creationTimestamp, tokenizationTime, blockNumber
```

### Parsing Events

```typescript
const adapter = getContractAdapter(chainId);

const event = adapter.parseZipFileTokenizedEvent({
  topics: log.topics,
  data: log.data
});

// event includes version-specific fields
```

## TOKEN File Format

The `META-INF/NZIP.TOKEN` file in tokenized ZIP archives now includes **required** version information:

```json
{
  "tokenId": "123",
  "contractAddress": "0x...",
  "network": "Base Sepolia",
  "networkChainId": 84532,      // REQUIRED
  "contractVersion": "2.11",     // REQUIRED
  "merkleRoot": "...",
  ...
}
```

### Migration

Existing TOKEN files without `contractVersion` or `networkChainId` are automatically migrated:
- Missing `networkChainId`: Inferred from network name
- Missing `contractVersion`: Inferred from network config
- Warnings are logged when migration occurs

## Adding a New Contract Version

To add support for a new contract version (e.g., v2.12):

### 1. Update Version Registry

Add the new version to `ContractVersionRegistry.ts`:

```typescript
export type ContractVersion = '2.0' | '2.10' | '2.11' | '2.12';

export const VERSION_REGISTRY: Record<ContractVersion, VersionCapabilities> = {
  // ... existing versions ...
  '2.12': {
    supportsEncryptedHash: true,
    supportsFileName: false,
    getZipFileInfoFields: [...],
    publicMintZipFileSignature: 'v2.12',
    hasGetVersion: true,
    additionalFunctions: ['newFunction']
  }
};
```

### 2. Create Adapter Implementation

Create `src/blockchain/core/adapters/V2_12Adapter.ts`:

```typescript
import type { ContractVersionAdapter } from './ContractVersionAdapter';

export class V2_12Adapter implements ContractVersionAdapter {
  readonly version = '2.12';
  
  async mintZipFile(...) { /* implementation */ }
  async getZipFileInfo(...) { /* implementation */ }
  // ... other methods
}
```

### 3. Update Adapter Factory

Add case to `AdapterFactory.ts`:

```typescript
switch (normalized) {
  case '2.10': return new V2_10Adapter();
  case '2.11': return new V2_11Adapter();
  case '2.12': return new V2_12Adapter();  // Add this
  // ...
}
```

### 4. Update Contract Configs

Add the new version to `CONTRACT_CONFIGS` in `contracts.ts`:

```typescript
84532: {
  address: '0x...',  // New contract address
  version: '2.12',   // Update version
  // ...
}
```

### 5. Update Documentation

- Document changes in `contracts/CONTRACT_CHANGES_v2.11_to_v2.12.md`
- Update this file with new version details

## Benefits

1. **Maintainability**: Version-specific code is isolated in adapters
2. **Type Safety**: Adapters provide type-safe interfaces
3. **Testability**: Each adapter can be tested independently
4. **Clarity**: No scattered version checks throughout the codebase
5. **Future-Proof**: Easy to add new versions without modifying existing code
6. **Backward Compatible**: Existing code continues to work

## Testing

When adding a new version:

1. Test adapter with actual contract on testnet
2. Verify TOKEN file format includes required fields
3. Test migration logic with old TOKEN files
4. Verify all minting/verification flows work

## Related Files

- `src/blockchain/core/ContractVersionRegistry.ts` - Version capabilities
- `src/blockchain/core/adapters/` - Adapter implementations
- `src/blockchain/core/contracts.ts` - Contract configurations
- `src/types/index.ts` - `TokenMetadata` interface
- `contracts/CONTRACT_CHANGES_v2.10_to_v2.11.md` - Version change documentation

