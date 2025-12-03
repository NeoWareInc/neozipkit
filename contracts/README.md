# Smart Contracts

This directory contains the smart contracts and related data for the NeoZipKit library.

## Contract Files

- **`src/NZIP-NFT.sol`** - Main production contract for ZIP file tokenization
- **`src/NZIP-NFT-v2.0.sol`** - Version 2.0 contract implementation
- **`ABI.txt`** - Contract ABI (Application Binary Interface)
- **`Bytecode.txt`** - Contract bytecode for deployment

## Contract Information

### Current Production Contract
- **Address**: `0x6313074922717351986929879903441992482216`
- **Network**: Base Sepolia (Chain ID: 84532)
- **Version**: 2.10.0
- **Status**: ✅ Active

### Contract Features
- ZIP file tokenization as ERC-721 NFTs
- Merkle root verification for file integrity
- Duplicate prevention via composite key system
- Blockchain metadata storage
- Universal verification (anyone can verify tokens)

## Compilation and Deployment

### Compiling the Contract

To compile the contract and generate compiled ABI and bytecode:

```bash
cd contracts
yarn install          # First time only
yarn compile:extract  # Compile and extract ABI/bytecode
```

This will:
- Compile `src/NZIP-NFT.sol` using Hardhat
- Extract the ABI and write it to `ABI-compiled.txt`
- Extract the bytecode and write it to `Bytecode-compiled.txt`

**⚠️ IMPORTANT:** The compilation script does NOT overwrite `ABI.txt` and `Bytecode.txt` (these are the deployed versions). The compiled files are written to `ABI-compiled.txt` and `Bytecode-compiled.txt` for review. Only manually copy them to `ABI.txt` and `Bytecode.txt` if you want to use the new compilation for deployment.

### Deploying the Contract

**SECURITY WARNING**: Contract deployment requires a private key with sufficient funds for gas fees.

- ⚠️ **NEVER** hardcode private keys in deployment scripts
- ⚠️ **NEVER** commit private keys to version control
- ✅ Use environment variables or interactive prompts for private keys
- ✅ Use testnet keys for development/testing
- ✅ Use secure key management (HSMs, KMS) for production deployments
- ✅ Verify network selection before deployment (especially for mainnet)

For complete security guidelines, see [../SECURITY.md](../SECURITY.md).

Deploy to any supported network using the interactive deployment script:

```bash
cd contracts
node deploy-interactive.js
```

The script will prompt you for:
- Private key (not saved, entered securely)
- Network selection (ETH, ETH Sepolia, Base, Base Sepolia, Arbitrum, Arbitrum Sepolia, Polygon, Polygon Sepolia)
- Confirmation before deployment

**Note**: The interactive deployment script does not save your private key. It is only used during the deployment process and never stored.

### Verifying the Contract

After deployment, verify the contract on the blockchain scanner:

```bash
cd contracts
yarn verify <contractAddress> <network>
```

Example:
```bash
yarn verify 0x2716c4609fD97DaEdF429BC4B4Ec2faa81e2cC60 arbitrumSepolia
```

For detailed verification instructions, see [VERIFICATION.md](./VERIFICATION.md).

## Integration

The contract ABI and bytecode are automatically imported by the NeoZipKit library for blockchain operations. No manual configuration is required for basic usage.

For advanced deployment and configuration, refer to the main project documentation.

## Testnet Faucets

**Testnets are recommended for early release versions of NeoZipKit.** Testnet tokens have no real-world value and are intended solely for development and testing purposes. Before requesting tokens, ensure your wallet is configured to connect to the appropriate testnet network. Most faucets have daily limits and rate restrictions to prevent abuse.

### Ethereum Sepolia

Ethereum Sepolia is the primary Ethereum testnet. **Note:** Sepolia testnet has been experiencing instability since the Pectra upgrade (March 2025), including transaction processing failures and RPC timeouts. Consider using Base Sepolia for more reliable testing.

#### Alchemy Faucet
- **URL**: https://sepoliafaucet.com/
- **Daily Limit**: Up to 0.5 Sepolia ETH per day
- **Requirements**: 
  - Alchemy account (free registration)
  - Sign in required
- **Steps**:
  1. Visit https://sepoliafaucet.com/
  2. Sign in with your Alchemy account (create one if needed)
  3. Enter your Ethereum wallet address
  4. Click "Send Me ETH"
  5. Wait for tokens to arrive (usually within minutes)

#### Chainlink Faucet
- **URL**: https://faucets.chain.link/sepolia
- **Daily Limit**: 0.5 ETH per request
- **Requirements**: 
  - Wallet connection (MetaMask, WalletConnect, etc.)
- **Steps**:
  1. Visit https://faucets.chain.link/sepolia
  2. Connect your wallet
  3. Ensure your wallet is set to Sepolia network
  4. Select "0.5 ETH" from the token options
  5. Click "Drip" to receive tokens

#### QuickNode Faucet
- **URL**: https://faucet.quicknode.com/ethereum/sepolia
- **Daily Limit**: 0.01 ETH per 24 hours
- **Requirements**: 
  - MetaMask wallet
  - Optional: Share a tweet about QuickNode to double your daily limit
- **Steps**:
  1. Visit https://faucet.quicknode.com/ethereum/sepolia
  2. Connect your MetaMask wallet
  3. Ensure MetaMask is configured for Sepolia network (Chain ID: 11155111)
  4. Optionally share a tweet to increase your limit
  5. Click "Send Me ETH"

#### Stakely Faucet
- **URL**: https://stakely.io/faucet/ethereum-sepolia-testnet-eth
- **Daily Limit**: 0.5 ETH per request
- **Requirements**: 
  - Twitter account
  - Public tweet with request ID
- **Steps**:
  1. Visit https://stakely.io/faucet/ethereum-sepolia-testnet-eth
  2. Enter your Ethereum Sepolia wallet address
  3. Complete the captcha verification
  4. Copy the provided request ID
  5. Share a public tweet containing the request ID
  6. Wait for processing and token delivery

#### Tatum Faucet
- **URL**: https://tatum.io/faucets/sepolia
- **Daily Limit**: 0.002 Sepolia ETH every 24 hours
- **Requirements**: 
  - Tatum account (free registration)
  - Minimum 0.001 ETH in your mainnet wallet (for verification)
- **Steps**:
  1. Visit https://tatum.io/faucets/sepolia
  2. Sign up for a Tatum Dashboard account
  3. Ensure your mainnet wallet has at least 0.001 ETH
  4. Enter your Sepolia wallet address
  5. Request tokens (available once every 24 hours)

### Base Sepolia

Base Sepolia is the official testnet for Base (Coinbase's L2 network). It's generally more stable than Ethereum Sepolia and recommended for testing.

#### Alchemy Faucet
- **URL**: https://basefaucet.com/
- **Daily Limit**: Up to 0.5 Base Sepolia ETH per day
- **Requirements**: 
  - Alchemy account (free registration)
  - Sign in required
- **Steps**:
  1. Visit https://basefaucet.com/
  2. Sign in with your Alchemy account
  3. Enter your Base wallet address
  4. Click "Send Me ETH"
  5. Wait for tokens to arrive

#### Chainlink Faucet
- **URL**: https://faucets.chain.link/
- **Daily Limit**: 0.5 ETH per request
- **Requirements**: 
  - Wallet connection (MetaMask, WalletConnect, etc.)
- **Steps**:
  1. Visit https://faucets.chain.link/
  2. Connect your wallet
  3. Select "Base Sepolia" from the network dropdown
  4. Choose "0.5 ETH" from token options
  5. Click "Drip" to receive tokens

#### Coinbase Developer Platform Faucet
- **URL**: https://docs.base.org/tools/network-faucets
- **Daily Limit**: 1 claim per 24 hours
- **Requirements**: 
  - Access to Coinbase Developer Platform
- **Steps**:
  1. Visit https://docs.base.org/tools/network-faucets
  2. Navigate to the Base Sepolia faucet section
  3. Enter your Base Sepolia wallet address
  4. Request testnet tokens
  5. Wait for confirmation (usually within minutes)

#### thirdweb Faucet
- **URL**: Available via https://docs.base.org/tools/network-faucets
- **Daily Limit**: 1 claim per 24 hours
- **Requirements**: 
  - Wallet connection via EOA (Externally Owned Account) or social logins
- **Steps**:
  1. Visit the Base documentation faucet page
  2. Access the thirdweb faucet option
  3. Connect your wallet (EOA or social login)
  4. Ensure your wallet is set to Base Sepolia network
  5. Claim your testnet funds

### Arbitrum Sepolia

Arbitrum Sepolia is the testnet for Arbitrum One, an Ethereum Layer 2 scaling solution.

#### Chainlink Faucet
- **URL**: https://faucets.chain.link/
- **Daily Limit**: 0.5 ETH per request
- **Requirements**: 
  - Wallet connection (MetaMask, WalletConnect, etc.)
- **Steps**:
  1. Visit https://faucets.chain.link/
  2. Connect your wallet
  3. Select "Arbitrum Sepolia" from the network dropdown
  4. Choose "0.5 ETH" from token options
  5. Click "Drip" to receive tokens

#### QuickNode Faucet
- **URL**: https://faucet.quicknode.com/
- **Daily Limit**: Varies by network
- **Requirements**: 
  - MetaMask wallet
  - Network configuration for Arbitrum Sepolia
- **Steps**:
  1. Visit https://faucet.quicknode.com/
  2. Select "Arbitrum Sepolia" from available networks
  3. Connect your MetaMask wallet
  4. Ensure MetaMask is configured for Arbitrum Sepolia (Chain ID: 421614)
  5. Request testnet tokens

### General Tips

- **Wallet Configuration**: Always ensure your wallet is set to the correct testnet network before requesting tokens
- **Rate Limits**: Most faucets have daily limits; plan your testing activities accordingly
- **Network Congestion**: If you experience delays, try again later or use an alternative faucet
- **Multiple Faucets**: You can use multiple faucets to accumulate more testnet tokens if needed
- **No Real Value**: Remember that testnet tokens have no real-world value and cannot be converted to mainnet tokens
