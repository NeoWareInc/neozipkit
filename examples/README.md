# NeoZipKit Examples

Basic examples demonstrating core ZipkitNode functionality for file-based ZIP operations.

## Overview

These examples provide simple, focused demonstrations of ZipkitNode's core features. They are designed to be minimal and easy to understand, focusing on the essential API usage patterns.

For more advanced examples including full CLI tools, interactive prompts, and comprehensive error handling, see the [neozipkit-examples](https://github.com/NeoWareInc/neozipkit-examples) package.

## Prerequisites

- Node.js 16+ 
- TypeScript (for running with ts-node)
- NeoZipKit installed: `yarn add neozipkit`

## Running Examples

### Option 1: Using ts-node (Recommended)

```bash
# Install ts-node globally or use npx
npm install -g ts-node

# Run an example
ts-node examples/create-zip.ts
```

### Option 2: Compile and Run

```bash
# Compile TypeScript
cd examples
tsc

# Run compiled JavaScript
node dist/create-zip.js
```

## Available Examples

### 1. Create ZIP (`create-zip.ts`)

Demonstrates creating a ZIP archive from multiple files using `ZipkitNode.createZipFromFiles()`.

**Usage:**
```bash
ts-node examples/create-zip.ts
```

**What it does:**
- Creates a ZIP file from multiple source files
- Uses simple compression options
- Shows basic error handling

### 2. Extract ZIP (`extract-zip.ts`)

Demonstrates extracting all files from a ZIP archive using `ZipkitNode.extractZipFile()`.

**Usage:**
```bash
ts-node examples/extract-zip.ts
```

**What it does:**
- Loads a ZIP file from disk
- Extracts all entries to a destination directory
- Preserves directory structure
- **Automatically validates CRC-32 and SHA-256 checksums** during extraction
- If extraction completes without errors, all files have been validated

**Test Mode:**
You can also test ZIP integrity without extracting files by using the `testOnly` option:
```typescript
await zip.extractZipFile(archivePath, destination, {
  testOnly: true,          // Validate without extracting
  skipHashCheck: false     // Verify file integrity (CRC-32/SHA-256 checks)
});
```

**Note:** CRC-32 and SHA-256 validation happens automatically during extraction. If `skipHashCheck: false` (the default), the library will validate each file's checksum and throw an error if validation fails. You don't need to manually calculate checksums - the library handles this for you.

### 3. List ZIP (`list-zip.ts`)

Demonstrates listing ZIP archive contents using `ZipkitNode.getDirectory()`.

**Usage:**
```bash
ts-node examples/list-zip.ts
```

**What it does:**
- Loads a ZIP file
- Lists all entries with basic metadata
- Displays file sizes and compression information

### 4. Blockchain Tokenization (`blockchain-tokenize.ts`)

Demonstrates creating a tokenized ZIP file with blockchain NFT minting.

**Usage:**
```bash
# Set your wallet private key
export NEOZIP_WALLET_PASSKEY="0x..."

# Run the example
ts-node examples/blockchain-tokenize.ts
```

**What it does:**
- Creates a ZIP file with files
- Calculates merkle root for integrity verification
- Mints an NFT token on the blockchain
- Embeds token metadata in the ZIP file

**Note:** This example requires:
- A wallet private key with testnet ETH
- Network configuration (defaults to Base Sepolia testnet)
- Gas fees for minting

### 6. Verify Tokenized ZIP (`verify-tokenized-zip.ts`)

Demonstrates verifying a tokenized ZIP file:
- Loads a tokenized ZIP file
- Extracts token metadata from `META-INF/NZIP.TOKEN`
- Calculates merkle root from ZIP contents
- Verifies the token on the blockchain
- Displays verification results

**Usage:**
```bash
ts-node examples/verify-tokenized-zip.ts [path-to-tokenized.zip]
```

**Example:**
```bash
ts-node examples/verify-tokenized-zip.ts examples/output/tokenized.zip
```

## Example File Structure

Each example is self-contained and includes:
- Clear comments explaining each step
- Basic error handling
- Minimal dependencies (just ZipkitNode)
- Hardcoded example paths (modify as needed)

## Advanced Examples

For production-ready CLI tools with:
- Full argument parsing
- Interactive prompts
- Comprehensive error handling
- Multiple compression methods
- Advanced blockchain features

See the [neozipkit-examples](https://github.com/NeoWareInc/neozipkit-examples) package which includes:
- `neozip` - Full-featured ZIP creation tool
- `neozip-legacy` - Legacy format support
- `neozip-ots` - OpenTimestamps integration

## Modifying Examples

To use these examples with your own files:

1. **Create ZIP Example**: Edit the `filePaths` array to point to your files
2. **Extract ZIP Example**: Change `archivePath` and `destination` variables
3. **List ZIP Example**: Update the `archivePath` variable
4. **Blockchain Example**: Set your wallet key and network in environment variables

## Security Best Practices

### Private Key Handling

**CRITICAL**: Never commit private keys to version control or include them in your code.

#### Environment Variables

Always use environment variables for private keys:

```bash
# Create .env file from template
cp .env.example .env

# Edit .env and add your testnet private key
# NEOZIP_WALLET_PASSKEY=0x...

# Load environment variables
export $(cat .env | xargs)
```

#### Testnet vs Mainnet

- **Examples**: ONLY use testnet keys (Base Sepolia, Arbitrum Sepolia, Ethereum Sepolia)
- **Development**: Use testnet keys with minimal test funds
- **Production**: Use secure key management (HSMs, KMS) - see [SECURITY.md](../SECURITY.md)

#### Wallet Files

If `WalletManagerNode` creates wallet files (`wallet/neozip-wallet.json`):
- These files are automatically excluded from git (via `.gitignore`)
- They are also excluded from NPM packages (via `.npmignore`)
- Never commit these files to version control
- Delete wallet files if accidentally committed

#### What to Do If Keys Are Exposed

If you accidentally commit a private key:

1. **Immediately rotate the key** - Generate a new key and transfer any funds
2. **Remove from git history** - Use `git filter-branch` or BFG Repo-Cleaner
3. **Check for unauthorized access** - Monitor the wallet address for transactions
4. **Update all systems** - Replace the key in all environments

#### Best Practices Checklist

- [ ] Use `.env` file for private keys (excluded from git)
- [ ] Only use testnet keys for examples
- [ ] Never hardcode private keys in source code
- [ ] Verify `.gitignore` excludes wallet files
- [ ] Use secure key management for production
- [ ] Rotate keys regularly
- [ ] Monitor for exposed secrets

For complete security guidelines, see [SECURITY.md](../SECURITY.md).

## Troubleshooting

### TypeScript Errors

If you see TypeScript errors, ensure:
- NeoZipKit is installed: `yarn add neozipkit`
- TypeScript types are available: `yarn add -D @types/node`
- tsconfig.json is properly configured

### Module Resolution Errors

If you see "Cannot find module" errors:
- Ensure you're running from the project root
- Check that `neozipkit` is in `node_modules`
- Try using absolute imports if relative imports fail

### Blockchain Example Errors

If the blockchain example fails:
- Verify your wallet has testnet ETH
- Check network connectivity
- Ensure `NEOZIP_WALLET_PASSKEY` is set correctly
- See [contracts/README.md](../contracts/README.md) for testnet faucet information

## Next Steps

1. **Understand the API**: Read the [main README](../README.md) for detailed API documentation
2. **Explore Advanced Features**: Check out the blockchain integration examples
3. **Build Your Own Tools**: Use these examples as a starting point for your own applications
4. **Check Advanced Examples**: See neozipkit-examples for production-ready implementations

## License

These examples are part of the NeoZipKit package and are licensed under the same license as NeoZipKit.

