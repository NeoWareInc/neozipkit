## Blockchain Module APIs

This directory provides all blockchain-related functionality for NeoZipKit, including:
- OpenTimestamps utilities
- NFT contract interactions (verification, querying, minting)
- Wallet utilities and token processing
- Network constants and contract ABI

## 📁 Module Structure

```
src/blockchain/
├── core/                    # Core blockchain functionality
│   ├── WalletManager.ts     # CoreWalletManager - platform-agnostic wallet operations
│   ├── ZipkitMinter.ts      # Core minting functionality
│   ├── ZipkitVerifier.ts    # Core verification functionality
│   ├── ZipkitOTS.ts         # OpenTimestamps utilities
│   ├── contracts.ts         # Contract ABI + network configs + addresses
│   ├── types.ts             # Shared blockchain types
│   └── index.ts             # Core exports
├── browser/                 # Browser-specific implementations
│   ├── WalletManagerBrowser.ts    # Browser wallet management
│   ├── ZipkitMinterBrowser.ts     # Browser minting
│   ├── TokenVerifierBrowser.ts    # Browser token verification
│   └── index.ts             # Browser exports
├── server/                  # Server-specific implementations
│   ├── WalletManagerServer.ts     # Server wallet management with file system
│   ├── ZipkitMinterServer.ts      # Server minting
│   ├── ZipkitVerifierServer.ts    # Server verification
│   └── index.ts             # Server exports
└── index.ts                 # Main module exports
```

### Package Entry
Import from the package root or from `src/blockchain` directly:

```ts
// Yes! You can import directly from the blockchain directory
import { 
  ZipkitMinter,
  ZipkitVerifier,
  CoreWalletManager,
  WalletManagerServer,
  WalletManagerBrowser,
  WalletAnalyzer,
  CONTRACT_CONFIGS,
  NZIP_CONTRACT_ABI,
  CURRENT_DEPLOYMENT
} from 'neozipkit/blockchain';

// Or from the main package (re-exports everything from blockchain)
import { ZipkitMinter, ZipkitVerifier, CoreWalletManager, WalletAnalyzer } from 'neozipkit';

// From source (monorepo/local development)
import { ZipkitMinter, ZipkitVerifier, CoreWalletManager, WalletAnalyzer } from '../src/blockchain';
```

### Direct NFT APIs

Use the individual classes directly for minting and verification:

```ts
import { ZipkitMinter, ZipkitVerifier, CoreWalletManager } from 'neozipkit/blockchain';

// Use classes directly
const walletManager = new CoreWalletManager();
const minter = new ZipkitMinter('archive.zip', 'abc123...', { walletPrivateKey: '0x...', network: 'base-sepolia' });
const verifier = new ZipkitVerifier({ debug: false });
```

### OpenTimestamps (ZipKitOTS.ts)
Bitcoin blockchain timestamping utilities for ZIP file integrity verification.

#### Core Functions

**Timestamp Creation & Verification:**
- `createTimestamp(hashDigest: string, options?: { debug?: boolean }): Promise<Buffer | null>`
  - Creates an OpenTimestamps proof for a hash digest. Submits hash to OpenTimestamps servers for Bitcoin blockchain anchoring.
- `verifyOts(hashDigest: string | null, ots: ArrayBuffer | null, options?: { debug?: boolean }): Promise<TimestampResult | { error: string } | null>`
  - Verifies an OpenTimestamps proof against a hash digest. Returns verification result, error object, or null if inputs invalid.
- `verifyOtsZip(zip: any): Promise<OtsVerifyResult>`
  - Verifies OpenTimestamps proof within a ZIP file. Extracts merkle root and OTS proof, then verifies against Bitcoin blockchain.

**ZIP Integration:**
- `getOtsEntry(zip: any): any | null`
  - Finds the OpenTimestamps entry in a ZIP file. Searches for TIMESTAMP_METADATA first, then TIMESTAMP_SUBMITTED.
- `getOtsBuffer(zip: any, otsEntry: any): Promise<Buffer | null>`
  - Extracts OTS proof data from a ZIP entry.
- `getMerkleRootSafe(zip: any): string | null`
  - Safely extracts merkle root from a ZIP file.

**Data Processing:**
- `deserializeOts(tsResult: TimestampResult, options?: { debug?: boolean }): Promise<string | null>`
  - Deserializes OpenTimestamps verification result into JSON format. Extracts blockchain attestation data and transaction details.
- `parseVerifyResult(verifyResult: TimestampResult): Promise<TimestampInfo>`
  - Parses timestamp verification result into readable information. Formats blockchain attestation data with human-readable messages and dates.

**Upgrade:**
- `upgradeOTS(zipFilePath: string, upgradedOts: Buffer): Promise<void>`
  - Upgrades OpenTimestamps proof in an existing ZIP file. Replaces old timestamp metadata with upgraded OTS proof data.
- `createOtsMetadataEntry(zipKit: any, ots: Buffer | null): any | null`
  - Creates a ZIP metadata entry containing OpenTimestamps proof. Creates a special ZIP entry marked as metadata that stores OTS proof data.

**Utility Functions:**
- `bufferToArrayBuffer(buf: Buffer): ArrayBuffer`
  - Converts a Node.js Buffer to an ArrayBuffer.

#### Types & Interfaces

```typescript
export interface TimestampResult {
  merkleRoot: string | null;
  ots: ArrayBuffer | null;
  verified: boolean;
  results: any | null;
  error: string | null;
  attestations: any | null;
  upgradedOts: ArrayBuffer | null;
}

export interface TimestampInfo {
  message: string;
  results: string[];
  attestDate: Date | null;
  attestHeight: number | null;
  submittedUri: string | null;
  otsUpgraded: boolean;
}

export interface OtsVerifyResult {
  status: 'none' | 'valid' | 'pending' | 'error';
  message?: string;
  blockHeight?: number;
  attestedAt?: Date;
  upgraded?: boolean;
  upgradedOts?: Buffer;
}

export interface DeserializeOtsResult {
  attestStr: string | null;
  needsUpdateMsg: string | null;
  attestationValues: any[];
}
```

#### Usage Example

```typescript
import { createTimestamp, verifyOtsZip, upgradeOTS } from 'neozipkit/blockchain';

// Create timestamp for a file's hash
const otsProof = await createTimestamp(merkleRoot);

// Verify a loaded ZIP file
const result = await verifyOtsZip(zipInstance);
if (result.status === 'valid') {
  console.log(`Verified! Block: ${result.blockHeight}`);
  
  // Upgrade proof if available
  if (result.upgradedOts) {
    await upgradeOTS(zipPath, result.upgradedOts);
  }
}
```

### Contract Configuration (contracts.ts)
All contract-related constants and configurations in one place:

- `CONTRACT_CONFIGS`: Network configurations with contract addresses, RPC URLs, and explorer URLs
- `NZIP_CONTRACT_ABI`: Full ABI for the NZIP‑NFT contract
- `CURRENT_DEPLOYMENT`: Current default deployment (Base Sepolia)
- `DEFAULT_NETWORK`: Default network chain ID (84532)
- Helper functions: `getContractConfig()`, `getSupportedNetworks()`, `isNetworkSupported()`

**Supported Networks**:
- Base Sepolia (84532) - Primary testnet
- Base Mainnet (8453) - Production

### Token Verification (ZipKitVerifier.ts)
- High-level verification API for NZIP‑NFT contract and on-chain checks.

### Token Query
Token querying functionality is integrated into the core wallet and verification classes:
- `CoreWalletManager.queryWalletTokens()` - Query tokens for a wallet address
- `ZipkitVerifier.queryBlockchainForExistingToken()` - Query for existing tokens by merkle root

### Wallet Management
- `class CoreWalletManager`: Platform-agnostic wallet operations (core functionality)
- `class WalletManagerServer`: Server-specific wallet management with file system operations
- `class WalletManagerBrowser`: Browser-specific wallet management with provider connections
- `class WalletAnalyzer`: Analyze balances, scan NZIP tokens, ERC‑20s and NFTs.
- Types re‑exported: `TokenInfo`, `NZipTokenDetails`, `WalletBasicInfo`, `TokenScanResult`, `CommonTokenConfig`.

### NFT Minting (ZipkitMinter.ts)
- High‑level minting API for NZIP‑NFT contract.
- Core functionality in `core/ZipkitMinter.ts`
- Browser-specific implementation in `browser/ZipkitMinterBrowser.ts`
- Server-specific implementation in `server/ZipkitMinterServer.ts`

### NFT Verification (ZipkitVerifier.ts)
- High‑level verification API for NZIP‑NFT contract.
- Core functionality in `core/ZipkitVerifier.ts`
- Browser token verification in `browser/TokenVerifierBrowser.ts`
- Server-specific implementation in `server/ZipkitVerifierServer.ts`

  - Helpers to format token and wallet data for display.

Re‑exports (index.ts):
Wallet formatting helpers have been removed. Use your app's UI layer for presentation formatting.

### ZIP Metadata Helpers
ZIP metadata functionality is integrated into the core ZIP handling classes:
- Token metadata validation and processing is handled by `ZipkitMinter` and `ZipkitVerifier`
- Metadata entries are managed through the core ZIP utilities

### Module Types (types.ts)
Exports shared types used across blockchain operations, including:
- `NZipTokenInfo`, `NZipTokenDetails`, `ZipFileInfo`, `WalletInfo`, `BlockchainVerification`, and others used by certificate/token helpers.

### Notes
- All OTS utilities suppress verbose logs by default. Pass `{ debug: true }` to see OpenTimestamps logs.
- Contract addresses vary per network; see `CONTRACT_CONFIGS` and keep them updated after deployments.
