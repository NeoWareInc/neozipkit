# Contract Verification Guide

This guide explains how to verify your deployed NeoZip NFT contract on blockchain scanners using Hardhat and Etherscan API V2.

## Overview

Contract verification makes your contract's source code publicly visible on block explorers, allowing users to:
- View and audit the contract source code
- Interact with the contract through the explorer's UI
- Verify that the deployed bytecode matches the source code

All verification uses **Etherscan API V2**, which is the unified API for Etherscan and its family of block explorers (Arbiscan, Basescan, Polygonscan, etc.).

## Prerequisites

1. **Etherscan API Key**: Get a free API key from [Etherscan](https://etherscan.io/apis)
   - This single API key works for all Etherscan-based explorers (Etherscan, Arbiscan, Basescan, Polygonscan)
   - No need for separate API keys per network

2. **Hardhat Setup**: Ensure you've installed dependencies:
   ```bash
   cd contracts
   yarn install
   ```

3. **Environment Variable**: Set your Etherscan API key:
   ```bash
   export ETHERSCAN_API_KEY=your_api_key_here
   ```
   
   Or add it to `hardhat.config.js`:
   ```javascript
   etherscan: {
     apiKey: {
       mainnet: "your_api_key_here",
       // ... other networks
     }
   }
   ```

## Quick Start

### Step 1: Compile the Contract

Before deploying, compile the contract to generate compiled ABI and bytecode:

```bash
cd contracts
yarn compile:extract
```

This will:
- Compile `src/NZIP-NFT.sol` using Hardhat
- Extract the ABI and write it to `ABI-compiled.txt`
- Extract the bytecode and write it to `Bytecode-compiled.txt`

**⚠️ IMPORTANT:** The compilation script does NOT overwrite `ABI.txt` and `Bytecode.txt` (these are the deployed versions that match contracts already on-chain). The compiled files are written to `ABI-compiled.txt` and `Bytecode-compiled.txt` for review. Only manually copy them to `ABI.txt` and `Bytecode.txt` if you want to use the new compilation for deployment.

### Step 2: Deploy the Contract

Deploy using the interactive deployment script:

```bash
cd contracts
node deploy-interactive.js
```

Or use any other deployment method. Make sure to save the contract address.

### Step 3: Verify the Contract

After deployment, verify the contract:

```bash
cd contracts
yarn verify <contractAddress> <network>
```

**Examples:**
```bash
# Verify on Arbitrum Sepolia
yarn verify 0x2716c4609fD97DaEdF429BC4B4Ec2faa81e2cC60 arbitrumSepolia

# Verify on Ethereum Sepolia
yarn verify 0x2716c4609fD97DaEdF429BC4B4Ec2faa81e2cC60 sepolia

# Verify on Base Sepolia
yarn verify 0x2716c4609fD97DaEdF429BC4B4Ec2faa81e2cC60 baseSepolia
```

## Supported Networks

The verification script supports the following networks:

| Network Name | Hardhat Config Name | Explorer |
|-------------|---------------------|----------|
| Ethereum Mainnet | `ethereum` | [Etherscan](https://etherscan.io) |
| Ethereum Sepolia | `sepolia` | [Sepolia Etherscan](https://sepolia.etherscan.io) |
| Base Mainnet | `base` | [Basescan](https://basescan.org) |
| Base Sepolia | `baseSepolia` | [Base Sepolia Explorer](https://sepolia.basescan.org) |
| Arbitrum One | `arbitrum` | [Arbiscan](https://arbiscan.io) |
| Arbitrum Sepolia | `arbitrumSepolia` | [Arbitrum Sepolia Explorer](https://sepolia.arbiscan.io) |
| Polygon Mainnet | `polygon` | [Polygonscan](https://polygonscan.com) |
| Polygon Sepolia (Amoy) | `polygonSepolia` | [Amoy Polygonscan](https://amoy.polygonscan.com) |

### Network Name Aliases

You can use any of these names when verifying:
- `sepolia`, `eth-sepolia`, `ethereum-sepolia`
- `baseSepolia`, `base-sepolia`
- `arbitrumSepolia`, `arbitrum-sepolia`
- `polygonSepolia`, `polygon-sepolia`, `amoy`

## Detailed Verification Steps

### 1. Get Your Etherscan API Key

1. Visit [Etherscan API](https://etherscan.io/apis)
2. Sign up or log in to your Etherscan account
3. Create a new API key
4. Copy the API key

### 2. Set the API Key

**Option A: Environment Variable (Recommended)**
```bash
export ETHERSCAN_API_KEY=your_api_key_here
```

**Option B: hardhat.config.js**
```javascript
etherscan: {
  apiKey: {
    mainnet: "your_api_key_here",
    sepolia: "your_api_key_here",
    // ... same key for all networks
  }
}
```

### 3. Verify the Contract

```bash
cd contracts
yarn verify <contractAddress> <network>
```

The script will:
1. Validate the contract address
2. Check network configuration
3. Verify the API key is set
4. Submit verification request to the appropriate explorer
5. Display the explorer URL once verified

## Troubleshooting

### Error: "Etherscan API key not found"

**Solution:**
- Set the `ETHERSCAN_API_KEY` environment variable
- Or add it to `hardhat.config.js` in the `etherscan.apiKey` section

### Error: "Bytecode mismatch"

This error means the deployed bytecode doesn't match the compiled source code.

**Common Causes:**
1. Contract was compiled with different compiler settings
2. Source code has changed since deployment
3. Different Solidity version was used

**Solutions:**
1. **Recompile and redeploy:**
   ```bash
   cd contracts
   yarn compile:extract
   # Redeploy with new bytecode
   node deploy-interactive.js
   # Verify again
   yarn verify <address> <network>
   ```

2. **Match exact compiler settings:**
   - Check the deployed contract's compiler version on the explorer
   - Update `hardhat.config.js` to match:
     ```javascript
     solidity: {
       version: "0.8.19", // Match deployed version
       settings: {
         optimizer: {
           enabled: true,
           runs: 200 // Match deployed settings
         }
       }
     }
     ```

### Error: "Already Verified"

This is not an error! The contract is already verified on the explorer. You can view it on the explorer's website.

### Error: "Network not configured"

**Solution:**
- Check that the network name matches one in `hardhat.config.js`
- Use the exact network name from the config (e.g., `arbitrumSepolia`, not `arbitrum-sepolia`)

### Verification Takes Too Long

Verification can take 30 seconds to several minutes depending on:
- Network congestion
- Explorer API response time
- Contract complexity

Wait for the process to complete. If it times out, try again after a few minutes.

## Compiler Settings

The contract is compiled with these settings (defined in `hardhat.config.js`):

```javascript
solidity: {
  version: "0.8.20",
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
    evmVersion: "paris"
  }
}
```

**Important:** When deploying, ensure these settings match. If you deploy with different settings, verification will fail with a bytecode mismatch.

## Manual Verification (Alternative)

If automatic verification fails, you can verify manually on the explorer:

1. Visit the contract address on the appropriate explorer
2. Click "Contract" tab
3. Click "Verify and Publish"
4. Select "Via Standard JSON Input" (recommended) or "Via Solidity (Single file)"
5. Fill in the required information:
   - Compiler version: `0.8.20`
   - Optimization: `Yes` (200 runs)
   - EVM Version: `Paris`
6. Upload the Standard JSON Input or flattened contract source

## Best Practices

1. **Always compile before deploying:**
   ```bash
   yarn compile:extract
   ```

2. **Verify immediately after deployment:**
   - Verification is easier when done right after deployment
   - The contract is fresh in the explorer's cache

3. **Keep compiler settings consistent:**
   - Use the same settings for compilation and deployment
   - Document any changes to compiler settings

4. **Test on testnets first:**
   - Verify on testnets (Sepolia, Base Sepolia, Arbitrum Sepolia) before mainnet
   - Testnets are free and help catch issues early

5. **Save deployment information:**
   - Keep a record of deployed addresses and networks
   - Note the compiler settings used for each deployment

## Network-Specific Notes

### Arbitrum Sepolia

- Uses Etherscan API V2 (same as other networks)
- API endpoint: `https://api-sepolia.arbiscan.io/api`
- Explorer: `https://sepolia.arbiscan.io`

### Base Sepolia

- Uses Basescan (Etherscan-based)
- API endpoint: `https://api-sepolia.basescan.org/api`
- Explorer: `https://sepolia.basescan.org`

### Polygon Sepolia (Amoy)

- Uses Polygonscan (Etherscan-based)
- API endpoint: `https://api-amoy.polygonscan.com/api`
- Explorer: `https://amoy.polygonscan.com`

## Additional Resources

- [Etherscan API Documentation](https://docs.etherscan.io/)
- [Hardhat Verification Plugin](https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts) (used by NZIP-NFT.sol)

## Support

If you encounter issues not covered in this guide:

1. Check the error message carefully
2. Verify your API key is correct and active
3. Ensure the network is properly configured
4. Try recompiling and redeploying if bytecode mismatch occurs
5. Check the explorer's status page for API issues

