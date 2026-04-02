# Deploy NZIP-NFT v2.51

Deploy the v2.51 contract (digest-only identity, no composite key) to Base Sepolia using the existing deploy script.

## Prerequisites

- Node.js (LTS 20 or 22)
- Deployer wallet with Base Sepolia ETH (e.g. [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet))
- Existing NZIP Timestamp Registry on Base Sepolia: `0x3CFc4E3886839dC859f611887660783a3EE241b4`

## Steps

### 1. Install and compile (in repo root or contracts)

From the **repository root** (so the lockfile is used):

```bash
cd contracts
yarn install   # or: npm install (if lockfile allows)
yarn compile   # compiles NZIP-NFT-v2.51.sol and others
```

If you use a different package manager or need to update the lockfile, run the equivalent of `npm install` / `yarn install` in `contracts`, then:

```bash
npx hardhat compile
```

### 2. Set deployer key

Export the private key of the wallet that will pay gas and own the contract:

```bash
export PRIVATE_KEY=0x...   # your deployer private key
```

Or create a `.env` in `contracts` (do not commit):

```
PRIVATE_KEY=0x...
```

Load it before deploying: `source .env` or use `dotenv` if you have it.

### 3. Deploy v2.51 to Base Sepolia

Using the **same registry** as v2.50:

```bash
cd contracts
node scripts/deploy.js nft --version 2.51 --network base-sepolia --registry 0x3CFc4E3886839dC859f611887660783a3EE241b4
```

Interactive: the script will print a summary and ask “Proceed with deployment? (y/n)”.

Non-interactive (e.g. CI):

```bash
node scripts/deploy.js nft --version 2.51 --network base-sepolia --registry 0x3CFc4E3886839dC859f611887660783a3EE241b4 --non-interactive
```

`PRIVATE_KEY` must be set in the environment.

### 4. Note the contract address

The script prints the deployed address and writes:

- `contracts/deployments/base-sepolia/NZIP-NFT-v2.51.json`
- `contracts/abi/NZIP-NFT-v2.51.json`

Example output:

```
✓ NZIPNFT deployed at: 0x...
  Transaction: 0x...
```

### 5. Point the app at v2.51

In **src/core/contracts.ts**, update Base Sepolia (chainId 84532):

1. Set `address` to the new v2.51 contract address.
2. Set `version` to `'2.51'`.

Example:

```ts
84532: {
  address: '0xYourNewV251Address',  // v2.51
  // ...
  version: '2.51',
  // ...
}
```

Optionally set `DEFAULT_CONTRACT_VERSION` to `'2.51'` so the library defaults to v2.51.

### 6. (Optional) Verify on Basescan

Constructor has one argument (registry address). From `contracts`:

```bash
npx hardhat verify --network baseSepolia <DEPLOYED_ADDRESS> 0x3CFc4E3886839dC859f611887660783a3EE241b4
```

Set `ETHERSCAN_API_KEY` (Basescan uses the same API key) if required.

## Other networks

Use the same script and pass the desired `--network` and, for NFT, the `--registry` address for that chain:

- `base-sepolia` (default)
- `base`
- `arbitrum-sepolia`
- `arbitrum`

Example for Base Mainnet (use the mainnet registry address):

```bash
node scripts/deploy.js nft --version 2.51 --network base --registry <MAINNET_REGISTRY_ADDRESS>
```
