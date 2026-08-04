require("@nomicfoundation/hardhat-verify");

/**
 * Only inject PRIVATE_KEY when it is a valid 32-byte hex key.
 * Rejects placeholders (e.g. "0x...") so hardhat can still compile.
 */
function deployerAccounts() {
  const key = process.env.PRIVATE_KEY?.trim();
  if (!key) return [];
  const normalized = key.startsWith("0x") ? key.slice(2) : key;
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) return [];
  return [`0x${normalized}`];
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "cancun"
    }
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    ethereum: {
      url: process.env.ETH_RPC_URL || "https://eth.llamarpc.com",
      chainId: 1,
      accounts: deployerAccounts()
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts: deployerAccounts()
    },
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts: deployerAccounts()
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: deployerAccounts()
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      accounts: deployerAccounts()
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: deployerAccounts()
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon.llamarpc.com",
      chainId: 137,
      accounts: deployerAccounts()
    },
    polygonSepolia: {
      url: process.env.POLYGON_SEPOLIA_RPC_URL || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts: deployerAccounts()
    }
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      base: process.env.ETHERSCAN_API_KEY || "",
      baseSepolia: process.env.ETHERSCAN_API_KEY || "",
      arbitrumOne: process.env.ETHERSCAN_API_KEY || "",
      arbitrumSepolia: process.env.ETHERSCAN_API_KEY || "",
      polygon: process.env.ETHERSCAN_API_KEY || "",
      polygonMumbai: process.env.ETHERSCAN_API_KEY || ""
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      },
      {
        network: "arbitrumSepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia.arbiscan.io"
        }
      },
      {
        network: "polygonSepolia",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com"
        }
      }
    ]
  },
  sourcify: {
    enabled: false
  }
};
