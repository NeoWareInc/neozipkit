# NZIP Smart Contracts

Smart contracts for NeoZip tokenized ZIP files and timestamp verification.

## Directory Structure

```
contracts/
├── src/                         # Solidity source files
│   ├── NZIP-NFT-v2.50.sol       # Current NFT contract (v2.50)
│   ├── NZIP-TimestampReg-v0.90.sol # Timestamp registry (v0.90)
│   └── legacy/                  # Previous versions (reference only)
├── abi/                         # Contract ABIs
│   ├── NZIP-NFT-v2.50.json
│   ├── NZIP-TimestampReg-v0.90.json
│   └── legacy/                  # Old ABIs
├── deployments/            # Deployment records by network
│   └── base-sepolia/
├── scripts/                # Deployment & utility scripts
│   ├── deploy.js           # Unified deployment script
│   └── ...
└── docs/                   # Documentation
```

## Contracts

### NZIP-NFT-v2.50 (NZIPNFT)

ERC-721 NFT contract for tokenizing ZIP files with optional timestamp proof support.

**Features:**
- Simple tokenization (v2.11 compatible API)
- Timestamp proof minting (links to NZIPTimestampReg)
- Optional minting fees
- Authorized minters support

### NZIP-TimestampReg (NZIPTimestampReg)

Gas-efficient registry for batch merkle roots (inspired by OpenTimestamps).

**Features:**
- Batch merkle root storage
- Free proof verification (view function)
- Multi-server support (authorized submitters)

## Deployment

### Prerequisites

```bash
cd contracts
yarn install
npx hardhat compile
```

### Deploy Contracts

```bash
# Set your private key
export PRIVATE_KEY=0x...

# Deploy timestamp registry first
node scripts/deploy.js registry --network base-sepolia

# Deploy NFT contract (optionally link to registry)
node scripts/deploy.js nft --version 2.50 --network base-sepolia --registry <registry-address>
```

### Available Networks

- `base-sepolia` - Base Sepolia testnet
- `arbitrum-sepolia` - Arbitrum Sepolia testnet
- `base` - Base mainnet
- `arbitrum` - Arbitrum One mainnet

### Verify Contracts

```bash
npx hardhat verify --network base-sepolia <contract-address> <constructor-args>
```

## Development

### Compile

```bash
npx hardhat compile
```

### Test

```bash
npx hardhat test
```

## Version History

| Version | Contract | Description |
|---------|----------|-------------|
| v2.50 | NZIPNFT | Timestamp proof support, optimized gas |
| v2.11 | ZipFileNFTPublic | Encrypted hash support |
| v2.10 | ZipFileNFTPublic | Composite key deduplication |
| v2.0 | ZipFileNFTPublic | Initial public minting |

## License

MIT
