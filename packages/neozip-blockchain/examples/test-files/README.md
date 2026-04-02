# NeoZip Timestamping Examples

Examples demonstrating timestamping ZIP files using the Zipstamp server API with `neozipkit` for ZIP operations.

## Overview

These examples demonstrate how to:
- Create timestamped ZIP files using the Zipstamp server API
- Verify timestamped ZIP files against the Zipstamp server
- Integrate ZIP operations (via neozipkit) with timestamping operations (via Zipstamp server API)

## Prerequisites

### Required Packages

The `neozipkit` package must be installed:

```bash
npm install neozipkit
# or
yarn add neozipkit
```

**Note**: 
- `neozipkit` must be installed as a package: `npm install neozipkit`
- These examples use:
  - Installed `neozipkit` package for ZIP file operations
  - Zipstamp server API for timestamping (no direct blockchain access required)

### Zipstamp Server

The Zipstamp server (default: `https://zipstamp-dev.neozip.io`) must be available.

To start the Zipstamp server:
```bash
cd /path/to/zipstamp
yarn dev
```

### Development Tools

- Node.js 16+
- TypeScript (for running with tsx)
- tsx (for running examples directly)

```bash
npm install -g tsx
# or use npx
npx tsx stamp-zip/stamp-zip.ts
```

## Running Examples

### Option 1: Using tsx (Recommended)

```bash
# Run timestamping example
tsx stamp-zip/stamp-zip.ts

# Run verification example
tsx stamp-zip/verify-zip.ts [path-to-stamped.zip]
```

### Option 2: Using npm scripts

```bash
# Run timestamping example
yarn stamp:zip

# Run verification example
yarn verify:zip [path-to-stamped.zip]
```

### Option 3: Compile and Run

```bash
# Compile TypeScript
cd stamp-zip
tsc

# Run compiled JavaScript
node stamp-zip.js
node verify-zip.js [path-to-stamped.zip]
```

## Available Examples

### 1. Stamp ZIP (`stamp-zip.ts`)

Demonstrates creating a timestamped ZIP file using the Zipstamp server API.

**What it does:**
- Creates a ZIP file from test files
- Calculates merkle root for integrity verification
- Submits digest to Zipstamp server for timestamping
- Embeds submission metadata in the ZIP file (`META-INF/TS-SUBMIT.NZIP`)
- Optionally waits for confirmation and adds timestamp metadata (`META-INF/TIMESTAMP.NZIP`)

**Usage:**
```bash
# Set Zipstamp server URL (optional, defaults to https://zipstamp-dev.neozip.io)
export ZIPSTAMP_SERVER_URL="https://zipstamp-dev.neozip.io"

# Optional: Set email for notifications
export ZIPSTAMP_EMAIL="user@example.com"

# Optional: Set chain ID
export ZIPSTAMP_CHAIN_ID="84532"

# Optional: Wait for confirmation (default: false)
export WAIT_FOR_CONFIRMATION="true"

# Run with default test files
tsx stamp-zip/stamp-zip.ts

# Run with specific files
tsx stamp-zip/stamp-zip.ts file1.txt file2.txt
```

**Requirements:**
- Zipstamp server must be running
- No wallet private keys required
- No gas fees (handled by the Zipstamp server)

**Output:**
- Creates `stamp-zip/output/stamped.zip` with embedded timestamp metadata
- Displays digest, batch ID, and status

**Metadata Files:**
- `META-INF/TS-SUBMIT.NZIP` - Added when digest is submitted (pending state)
- `META-INF/TIMESTAMP.NZIP` - Added when batch is confirmed on blockchain (if `WAIT_FOR_CONFIRMATION=true`)

### 2. Verify ZIP (`verify-zip.ts`)

Demonstrates verifying a timestamped ZIP file using the Zipstamp server API.

**What it does:**
- Loads a timestamped ZIP file
- Extracts timestamp metadata from `META-INF/TIMESTAMP.NZIP` or `META-INF/TS-SUBMIT.NZIP`
- Calculates merkle root from ZIP contents
- Verifies the timestamp via the Zipstamp server API
- Displays verification results

**Usage:**
```bash
# Verify a timestamped ZIP file
tsx stamp-zip/verify-zip.ts stamp-zip/output/stamped.zip

# Or use default path
tsx stamp-zip/verify-zip.ts
```

**Requirements:**
- A timestamped ZIP file (created with `stamp-zip.ts`)
- Zipstamp server must be running
- No private keys required (read-only operations)

**Output:**
- Verification status (success/failure)
- Merkle root comparison
- Blockchain data (if confirmed)
- Explorer link to view transaction on blockchain

## Example File Structure

```
stamp-zip/
├── stamp-zip.ts             # Timestamping example
├── verify-zip.ts             # Verification example
├── constants.ts              # Metadata file name constants
├── zipStampServerClient.ts   # ZipStamp server API client
├── README.md                 # This file
├── output/                   # Generated ZIP files
│   └── stamped.zip          # Timestamped ZIP output
└── test-files/               # Test data files
    ├── document.txt
    └── data.json
```

## Configuration

### Environment Variables

- `ZIPSTAMP_SERVER_URL` - Zipstamp server base URL (default: `https://zipstamp-dev.neozip.io`)
- `ZIPSTAMP_EMAIL` - Optional email for notifications
- `ZIPSTAMP_CHAIN_ID` - Optional chain ID override
- `WAIT_FOR_CONFIRMATION` - Wait for batch confirmation (default: `false`)

### Command Line Arguments

- `stamp-zip.ts [files...]` - Files to include in ZIP (defaults to test files if not provided)
- `verify-zip.ts [zip-file]` - ZIP file to verify (defaults to `output/stamped.zip`)

## Metadata Format

### TS-SUBMIT.NZIP (Submission Metadata)

**Why Two Metadata Files?**

The system uses two separate metadata files (TS-SUBMIT.NZIP and TIMESTAMP.NZIP) to provide clear visual distinction between pending and confirmed timestamps. This approach:

- **Clear state indication**: The filename immediately shows whether a timestamp is pending or confirmed
- **External tool compatibility**: Tools like neolist can determine state without parsing JSON
- **Immutable submission record**: Original TS-SUBMIT.NZIP is preserved in the original file
- **Industry standard**: Follows the OpenTimestamps pattern
- **Backward compatibility**: Easy to detect old vs new format

When a batch is confirmed on the blockchain, `upgrade-zip.ts` creates a new ZIP file with TIMESTAMP.NZIP (replacing TS-SUBMIT.NZIP), preserving the original file with its submission metadata.

---

Added when digest is submitted to the Zipstamp server (pending state):

```json
{
  "digest": "0x...",
  "batchId": "base-sep-v0.90-n42",
  "chainId": 84532,
  "network": "base-sepolia",
  "status": "pending",
  "serverUrl": "https://zipstamp-dev.neozip.io",
  "submittedAt": "2025-01-04T20:30:00.000Z"
}
```

### TIMESTAMP.NZIP (Confirmed Timestamp Metadata)

Added when batch is confirmed on blockchain:

```json
{
  "digest": "0x...",
  "batchId": "base-sep-v0.90-n42",
  "batchNumber": 42,
  "chainId": 84532,
  "network": "base-sepolia",
  "status": "confirmed",
  "transactionHash": "0x...",
  "blockNumber": 12345678,
  "timestamp": 1704398400,
  "merkleRoot": "0x...",
  "contractAddress": "0x...",
  "serverUrl": "https://zipstamp-dev.neozip.io",
  "submittedAt": "2025-01-04T20:30:00.000Z",
  "confirmedAt": "2025-01-04T20:35:00.000Z"
}
```

## Integration Guide

### Using in Your Own Projects

These examples demonstrate the integration pattern:

1. **ZIP Operations** → Use installed neozipkit package
   ```typescript
   import { ZipkitNode } from 'neozipkit/node';
   ```

2. **Zipstamp Server API** → Use Zipstamp server library
   ```typescript
   import { submitDigest, verifyDigest } from '../src/zipstamp-server';
   ```

3. **Metadata** → Use constants from Zipstamp server library
   ```typescript
   import { SUBMIT_METADATA, TIMESTAMP_METADATA } from '../src/zipstamp-server';
   ```

### Example Integration

```typescript
// Create ZIP with neozipkit (installed package)
import { ZipkitNode } from 'neozipkit/node';
const zip = new ZipkitNode();
await zip.createZipFromFiles(files, outputPath, { useSHA256: true });

// Submit digest to Zipstamp server
import { submitDigest } from '../src/zipstamp-server';
const result = await submitDigest(merkleRoot, email, chainId);

// Verify with Zipstamp server
import { verifyDigest } from '../src/zipstamp-server';
const verification = await verifyDigest(merkleRoot, chainId);
```

## Troubleshooting

### Zipstamp Server Connection Errors

If you see connection errors:

```bash
# Verify Zipstamp server is running
curl https://zipstamp-dev.neozip.io/chains

# Check ZIPSTAMP_SERVER_URL environment variable
echo $ZIPSTAMP_SERVER_URL
```

### Module Resolution Errors

If you see "Cannot find module" errors:

```bash
# Ensure neozipkit is installed
npm install neozipkit

# Verify installation
npm list neozipkit
```

### TypeScript Errors

If you see TypeScript errors:

```bash
# Install TypeScript types
npm install -D @types/node typescript tsx

# Verify tsconfig.json is properly configured
```

### ZIP File Errors

If ZIP operations fail:

- **Verify neozipkit is installed**: `npm list neozipkit`
- **Check file permissions**: Ensure read/write access to example directories
- **Verify ZIP file structure**: Use `verify-zip.ts` to check file integrity

## Supported Networks

The Zipstamp server supports multiple networks. Check available chains:

```bash
curl https://zipstamp-dev.neozip.io/chains
```

Common networks:
- Base Sepolia (Chain ID: 84532) - Testnet
- Base Mainnet (Chain ID: 8453) - Production
- Arbitrum Sepolia (Chain ID: 421614) - Testnet
- Ethereum Sepolia (Chain ID: 11155111) - Testnet

## Next Steps

1. **Understand the API**: Read the [main README](../README.md) for detailed API documentation
2. **Explore Advanced Features**: Check out the Zipstamp server admin panel
3. **Build Your Own Tools**: Use these examples as a starting point for your own applications
4. **Check Documentation**: See [API_REQUIREMENTS.md](../docs/API_REQUIREMENTS.md) for API details

## License

These examples are part of the Zipstamp project and are licensed under the same license as the project.
