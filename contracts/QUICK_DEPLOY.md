# 🚀 Quick Deployment Guide - Best Methods

**Skip Remix!** Here are the **BEST** ways to deploy your bytecode:

## 🔐 Security Warning

**CRITICAL**: Contract deployment requires a private key with sufficient funds for gas fees.

- ⚠️ **NEVER** hardcode private keys in deployment scripts or command lines
- ⚠️ **NEVER** commit private keys to version control
- ✅ Use interactive prompts (recommended) or environment variables for private keys
- ✅ Use testnet keys for development/testing
- ✅ Use secure key management (HSMs, KMS) for production deployments
- ✅ Double-check network selection before deployment (especially for mainnet)

For complete security guidelines, see [../SECURITY.md](../SECURITY.md).

## 🎯 NEW: Interactive Deployment (EASIEST!)

**Just run and follow the prompts!**

```bash
cd contracts
node deploy-interactive.js
```

This will:
- ✅ Prompt for your private key (securely)
- ✅ Let you choose from 8 networks (ETH, ETH Sepolia, Base, Base Sepolia, Arbitrum, Arbitrum Sepolia, Polygon, Polygon Sepolia)
- ✅ Show a summary with all details
- ✅ Ask for confirmation before deploying
- ✅ Deploy and save deployment info

**Perfect for quick deployments!**

---

## ⚡ Method 1: Ethers.js Script (Command Line - Non-Interactive)

**Already set up and ready to use!**

**SECURITY NOTE**: Using environment variables in command line can expose keys in shell history. Prefer interactive deployment for better security.

### One Command:

```bash
cd contracts
PRIVATE_KEY=your_private_key_here node deploy-sepolia.js
```

**⚠️ WARNING**: Command line environment variables may be visible in:
- Shell history files (`.bash_history`, `.zsh_history`)
- Process lists (`ps` command)
- System logs

For better security, use the interactive deployment script instead.

That's it! The script:
- ✅ Automatically adds `0x` prefix to bytecode
- ✅ Checks your balance
- ✅ Estimates gas
- ✅ Deploys the contract
- ✅ Saves deployment info to JSON
- ✅ Shows contract address and Etherscan link

### Example:

```bash
cd contracts
PRIVATE_KEY=0x1234567890abcdef... node deploy-sepolia.js
```

**Output:**
```
============================================================
NeoZip NFT Contract Deployment - Ethereum Sepolia
============================================================

📖 Reading contract files...
✅ Contract files loaded
   Bytecode length: 13123 characters

🔗 Connecting to Ethereum Sepolia...
Deployer address: 0xYourAddress...
Balance: 0.5 ETH

⛽ Estimating gas...
Estimated gas: 2500000
Estimated cost: 0.001 ETH

🏗️  Creating contract factory...
📤 Deploying contract...
✅ Deployment transaction sent!
Transaction hash: 0x...
   View on Etherscan: https://sepolia.etherscan.io/tx/0x...

⏳ Waiting for deployment confirmation...

============================================================
✅ DEPLOYMENT SUCCESSFUL!
============================================================

Contract Address: 0xYourContractAddress...
Transaction Hash: 0x...
Contract Version: 2.10.0
Deployed at Block: 12345678

📝 Deployment info saved to: contracts/deployment-sepolia.json

🔍 View contract on Etherscan:
   https://sepolia.etherscan.io/address/0xYourContractAddress...
```

---

## 🔥 Method 2: Foundry Cast (ONE LINER - Super Fast!)

If you have Foundry installed:

```bash
cast send --rpc-url https://rpc.sepolia.org \
  --private-key $PRIVATE_KEY \
  --create $(cat contracts/Bytecode.txt | sed 's/^/0x/') \
  --value 0
```

Or with explicit bytecode:

```bash
cast send --rpc-url https://rpc.sepolia.org \
  --private-key $PRIVATE_KEY \
  --create 0x$(cat contracts/Bytecode.txt) \
  --value 0
```

**Install Foundry:**
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

---

## 🛠️ Method 3: Hardhat (Most Professional)

### Setup (one time):

```bash
yarn add --dev hardhat @nomicfoundation/hardhat-toolbox
```

### Create `hardhat.config.js`:

```javascript
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.19",
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111
    }
  }
};
```

### Create `scripts/deploy-bytecode.js`:

```javascript
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  let bytecode = fs.readFileSync("contracts/Bytecode.txt", "utf8").trim();
  if (!bytecode.startsWith("0x")) bytecode = "0x" + bytecode;
  const abi = JSON.parse(fs.readFileSync("contracts/ABI.txt", "utf8"));

  const ContractFactory = await ethers.getContractFactory(abi, bytecode);
  const contract = await ContractFactory.deploy();
  await contract.waitForDeployment();
  
  console.log("Deployed to:", await contract.getAddress());
}

main().catch(console.error);
```

### Deploy:

```bash
PRIVATE_KEY=your_key npx hardhat run scripts/deploy-bytecode.js --network sepolia
```

---

## 📋 Method 4: Direct Web3/Ethers.js (Programmatic)

If you want to integrate into your own code:

```javascript
const { ethers } = require("ethers");
const fs = require("fs");

async function deploy() {
  const provider = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  let bytecode = fs.readFileSync("contracts/Bytecode.txt", "utf8").trim();
  if (!bytecode.startsWith("0x")) bytecode = "0x" + bytecode;
  const abi = JSON.parse(fs.readFileSync("contracts/ABI.txt", "utf8"));
  
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  
  console.log("Address:", await contract.getAddress());
}

deploy();
```

---

## 🎯 Which Method Should You Use?

| Method | Speed | Setup | Reliability | Best For |
|--------|-------|-------|-------------|----------|
| **Ethers.js Script** | ⚡⚡⚡ | ✅ Ready | ⭐⭐⭐⭐⭐ | **Quick deployment** |
| **Foundry Cast** | ⚡⚡⚡⚡ | Install Foundry | ⭐⭐⭐⭐⭐ | One-liner fans |
| **Hardhat** | ⚡⚡ | Some setup | ⭐⭐⭐⭐⭐ | Professional projects |
| **Direct Code** | ⚡⚡ | Custom code | ⭐⭐⭐⭐ | Integration |

## 🏆 RECOMMENDATION: Use Method 1 (Ethers.js Script)

**Why?**
- ✅ Already created and tested
- ✅ Zero setup required
- ✅ Handles all edge cases (0x prefix, gas estimation, etc.)
- ✅ Saves deployment info automatically
- ✅ Clear, helpful output

**Just run:**
```bash
cd contracts
PRIVATE_KEY=your_key node deploy-sepolia.js
```

---

## 🔐 Security Notes

1. **Never commit your private key** to git
2. **Use environment variables** or pass directly (not saved in history)
3. **Double-check the network** - make sure you're on Sepolia, not mainnet!
4. **Verify gas costs** before confirming

## 📝 After Deployment

1. **Save the contract address** from the output
2. **Verify on Etherscan** (optional but recommended)
3. **Update** `src/blockchain/core/contracts.ts` with the new address
4. **Test** the deployed contract

---

## 🆘 Troubleshooting

### "Insufficient funds"
- Get Sepolia ETH from: https://sepoliafaucet.com/

### "Invalid bytecode"
- The script automatically adds `0x` prefix - you shouldn't see this

### "Network error"
- Try a different RPC: `https://ethereum-sepolia-rpc.publicnode.com`

### "Transaction failed"
- Check you're on Sepolia network (Chain ID: 11155111)
- Verify you have enough ETH for gas

---

**That's it! The ethers.js script is the simplest and most reliable method. Just run it and you're done!** 🎉

