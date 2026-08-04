# Deploy NZIP-NFT v2.51

Deploy the v2.51 contract (digest-only identity, no composite key) and TimestampReg v0.90.

## Prerequisites

- Node.js (LTS 20 or 22)
- Deployer wallet with gas on the target chain
- `PRIVATE_KEY` for that wallet (full 32-byte hex; not a placeholder)
- Optional: `ETHERSCAN_API_KEY` (Basescan), `BASE_RPC_URL` / `BASE_SEPOLIA_RPC_URL`

Hardhat config ignores invalid/placeholder `PRIVATE_KEY` values so compile still works without a real key.

---

## Base Sepolia (testnet, already live)

Existing registry: `0x3CFc4E3886839dC859f611887660783a3EE241b4`  
Existing NFT v2.51: `0xe4ee4f36CBAF2Bf2959740F6A0B326Acd175Ce77`

### Compile

From `packages/neozip-blockchain/contracts` (with hardhat available via that package’s deps—do **not** create a local `.pnpm-store` under the monorepo root):

```bash
pnpm compile
```

### Deploy v2.51 (if re-deploying)

```bash
export PRIVATE_KEY=0x...   # deployer key
node scripts/deploy.js nft --version 2.51 --network base-sepolia --registry 0x3CFc4E3886839dC859f611887660783a3EE241b4 --non-interactive
```

Artifacts: `deployments/base-sepolia/NZIP-NFT-v2.51.json`

### Verify

```bash
npx hardhat verify --network baseSepolia <DEPLOYED_ADDRESS> 0x3CFc4E3886839dC859f611887660783a3EE241b4
```

---

## Base Mainnet (production)

Deploy registry **first**, then NFT with that registry address. Then update `src/core/contracts.ts` `CONTRACT_CONFIGS[8453]`.

### 1. Deploy TimestampReg v0.90

```bash
cd packages/neozip-blockchain/contracts
export PRIVATE_KEY=0x...          # funded Base Mainnet wallet
# optional: export BASE_RPC_URL=...
# optional: authorize Token Service submitter:
#   --authorize <TOKEN_SERVICE_SUBMITTER_ADDRESS>
node scripts/deploy.js registry --version 0.90 --network base --non-interactive
```

Saves: `deployments/base/NZIP-TimestampReg-v0.90.json`

### 2. Deploy NFT v2.51

```bash
node scripts/deploy.js nft --version 2.51 --network base --registry <MAINNET_REGISTRY_ADDRESS> --non-interactive
```

Saves: `deployments/base/NZIP-NFT-v2.51.json`

### 3. Verify on Basescan

```bash
npx hardhat verify --network base <REGISTRY_ADDRESS>
npx hardhat verify --network base <NFT_ADDRESS> <REGISTRY_ADDRESS>
```

### 4. Wire the client (`neozip-blockchain`)

In `packages/neozip-blockchain/src/core/contracts.ts`:

1. Keep **legacy** mainnet v2.10 as `LEGACY_BASE_MAINNET_NFT_V210` (historic tokens).
2. Set `CONTRACT_CONFIGS[8453]`:
   - `address` → new v2.51 NFT
   - `version: '2.51'`
   - `registryAddress` / `registryVersion: '0.90'`
3. Update `tests/unit/contracts.test.ts` Mainnet expectations.

Point production Token Service (`token-service.neozip.io`) at the new NFT and authorize batch submitters on the registry.

---

## Other networks

Same script: `--network` is `base-sepolia` | `base` | `arbitrum-sepolia` | `arbitrum`.

```bash
node scripts/deploy.js nft --version 2.51 --network base --registry <MAINNET_REGISTRY_ADDRESS>
```
