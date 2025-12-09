// Contract addresses and configurations for different networks

export interface ContractConfig {
  address: string
  network: string
  chainId: number
  explorerUrl: string
  rpcUrls: string[]
  nameAliases?: string[]  // Alternative network name formats (e.g., ["base-sepolia", "base sepolia"])
}

// NZIP NFT Contract configurations by network
export const CONTRACT_CONFIGS: Record<number, ContractConfig> = {
  // Base Sepolia (Primary testnet)
  84532: {
    // address: '0xFD76a5d420704F34d84b0767961835c43D7b30a8', // Production contract v2.0
    // address: '0xdAe9D83d7AC62197fAE7704abc66b13DA28D3143', // Production contract v2.10
    address: '0xD9f88AaD2f27262D6808358B796Da8F1b9694c18', // Production contract v2.11
    network: 'Base Sepolia',
    chainId: 84532,
    explorerUrl: 'https://sepolia.basescan.org',
    rpcUrls: [
      'https://sepolia.base.org',
      'https://base-sepolia-rpc.publicnode.com',
      'https://base-sepolia.gateway.tenderly.co'
    ],
    nameAliases: ['base-sepolia', 'base sepolia', 'basesepolia', 'base-sepolia-testnet']
  },
  
  // Base Mainnet (Production)
  8453: {
    // address: '0x2716c4609fD97DaEdF429BC4B4Ec2faa81e2cC60',  // Production contract v2.0
    address: '0xd871Fba59F85108aF29299786DD8243B38dD9686',  // Production contract v2.10
    network: 'Base Mainnet',
    chainId: 8453,
    explorerUrl: 'https://basescan.org',
    rpcUrls: [
      'https://mainnet.base.org',
      'https://base.drpc.org',
      'https://base.gateway.tenderly.co'
    ],
    nameAliases: ['base-mainnet', 'base mainnet', 'basemainnet', 'base']
  },
  
  // Ethereum Sepolia (Testnet)
  // WARNING: Sepolia testnet has been experiencing instability since the Pectra upgrade (March 2025)
  // Network issues include transaction processing failures and RPC timeouts
  // Consider using Base Sepolia (84532) for more reliable testing
  11155111: {
    // address: '0x2716c4609fD97DaEdF429BC4B4Ec2faa81e2cC60', // Production contract v2.10
    address: '0x3b99a72cCAc108037741cacb0D60d5571CF6412C', // Production contract v2.11
    network: 'Sepolia Testnet',
    chainId: 11155111,
    explorerUrl: 'https://sepolia.etherscan.io',
    rpcUrls: [
      // Official Sepolia RPC endpoints (most reliable)
      'https://rpc.sepolia.ethpandaops.io',
      
      // Popular public RPC providers
      'https://eth-sepolia.public.blastapi.io',
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://sepolia.drpc.org',
      'https://1rpc.io/sepolia',
    ],
    nameAliases: ['sepolia-testnet', 'sepolia testnet', 'sepoliatestnet', 'sepolia', 'ethereum-sepolia', 'ethereum sepolia']
  },
  
  // Arbitrum Sepolia (Testnet)
  421614: {
    // address: '0x2716c4609fD97DaEdF429BC4B4Ec2faa81e2cC60', // Production contract v2.10
    address: '0x243cDc963b80E539723e526F4Fc16FA254725Ccd', // Production contract v2.11
    network: 'Arbitrum Sepolia',
    chainId: 421614,
    explorerUrl: 'https://sepolia.arbiscan.io',
    rpcUrls: [
      'https://sepolia-rollup.arbitrum.io/rpc',
      'https://arbitrum-sepolia-rpc.publicnode.com'
    ],
    nameAliases: ['arbitrum-sepolia', 'arbitrum sepolia', 'arbitrumsepolia', 'arbitrum-sepolia-testnet']
  },
  
  // Arbitrum One (Production)
  // Note: Same contract address as Arbitrum Sepolia due to deterministic deployment
  // (same deployer address + same nonce = same contract address on both networks)
  42161: {
    address: '0x2716c4609fD97DaEdF429BC4B4Ec2faa81e2cC60', // Production contract v2.10
    network: 'Arbitrum One',
    chainId: 42161,
    explorerUrl: 'https://arbiscan.io',
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.llamarpc.com',
      'https://arbitrum.publicnode.com'
    ],
    nameAliases: ['arbitrum-one', 'arbitrum one', 'arbitrumone', 'arbitrum', 'arbitrum-mainnet', 'arbitrum mainnet']
  },
  
  // Ethereum Mainnet (Production) - disabled until NZIP is deployed
  // 1: {
  //   address: '0x0000000000000000000000000000000000000000',
  //   network: 'Ethereum Mainnet',
  //   chainId: 1,
  //   explorerUrl: 'https://etherscan.io',
  //   rpcUrls: []
  // }
}

// Contract ABI (ethers.js human-readable format)
// Supports both v2.0 (without encryptedHash) and v3.0 (with encryptedHash)
export const NZIP_CONTRACT_ABI = [
  // v3.0 function signature (with encryptedHash)
  "function publicMintZipFile(string memory fileName, string memory merkleRootHash, string memory encryptedHash, uint256 creationTimestamp, string memory ipfsHash, string memory metadataURI) public returns (uint256)",
  // v2.0 function signature (backward compatibility - will fail on v3.0 contracts)
  "function publicMintZipFile(string memory merkleRootHash, uint256 creationTimestamp, string memory ipfsHash, string memory metadataURI) public returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function getTokensByMerkleRoot(string memory merkleRoot) external view returns (uint256[])",
  "function getTokensByOwner(address owner) external view returns (uint256[])",
  // v3.0 getZipFileInfo (with encryptedHash)
  "function getZipFileInfo(uint256 tokenId) external view returns (tuple(string fileName, string merkleRootHash, string encryptedHash, string ipfsHash, address creator, uint256 creationTimestamp, uint256 tokenizationTime, uint256 blockNumber))",
  // v2.0 getZipFileInfo (backward compatibility)
  "function getZipFileInfo(uint256 tokenId) external view returns (tuple(string merkleRootHash, string ipfsHash, address creator, uint256 creationTimestamp, uint256 tokenizationTime, uint256 blockNumber))",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function isZipFileTokenized(string memory merkleRootHash, uint256 creationTimestamp) external view returns (bool exists, uint256 tokenId)",
  "function verifyZipFile(uint256 tokenId, string memory providedMerkleRoot) external view returns (bool isValid)",
  "function verifyEncryptedZipFile(uint256 tokenId, string memory providedEncryptedHash) external view returns (bool isValid)",
  "function getVersion() external pure returns (string memory)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  // v3.0 event (with encryptedHash)
  "event ZipFileTokenized(uint256 indexed tokenId, address indexed creator, string fileName, string merkleRootHash, string encryptedHash, uint256 creationTimestamp, string ipfsHash, uint256 tokenizationTime, uint256 blockNumber)",
  // v2.0 event (backward compatibility)
  "event ZipFileTokenized(uint256 indexed tokenId, address indexed creator, string merkleRootHash, uint256 creationTimestamp, string ipfsHash, uint256 tokenizationTime, uint256 blockNumber)"
]

// Contract ABI (Web3.js JSON format)
// Supports both v2.0 (without encryptedHash) and v3.0 (with encryptedHash)
export const NZIP_CONTRACT_ABI_WEB3 = [
  {
    inputs: [
      { name: "fileName", type: "string" },
      { name: "merkleRootHash", type: "string" },
      { name: "encryptedHash", type: "string" },
      { name: "creationTimestamp", type: "uint256" },
      { name: "ipfsHash", type: "string" },
      { name: "metadataURI", type: "string" }
    ],
    name: "publicMintZipFile",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "merkleRoot", type: "string" }],
    name: "getTokensByMerkleRoot",
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "getZipFileInfo",
    outputs: [
      {
        components: [
          { name: "fileName", type: "string" },
          { name: "merkleRootHash", type: "string" },
          { name: "encryptedHash", type: "string" },
          { name: "ipfsHash", type: "string" },
          { name: "creator", type: "address" },
          { name: "creationTimestamp", type: "uint256" },
          { name: "tokenizationTime", type: "uint256" },
          { name: "blockNumber", type: "uint256" }
        ],
        name: "",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "merkleRootHash", type: "string" },
      { name: "creationTimestamp", type: "uint256" }
    ],
    name: "isZipFileTokenized",
    outputs: [
      { name: "exists", type: "bool" },
      { name: "tokenId", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "providedMerkleRoot", type: "string" }
    ],
    name: "verifyZipFile",
    outputs: [{ name: "isValid", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "providedEncryptedHash", type: "string" }
    ],
    name: "verifyEncryptedZipFile",
    outputs: [{ name: "isValid", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getVersion",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "pure",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: true, name: "tokenId", type: "uint256" }
    ],
    name: "Transfer",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: true, name: "creator", type: "address" },
      { indexed: false, name: "fileName", type: "string" },
      { indexed: false, name: "merkleRootHash", type: "string" },
      { indexed: false, name: "encryptedHash", type: "string" },
      { indexed: false, name: "creationTimestamp", type: "uint256" },
      { indexed: false, name: "ipfsHash", type: "string" },
      { indexed: false, name: "tokenizationTime", type: "uint256" },
      { indexed: false, name: "blockNumber", type: "uint256" }
    ],
    name: "ZipFileTokenized",
    type: "event"
  }
]

// Default configuration (Base Sepolia for development)
export const DEFAULT_NETWORK = 84532
export const CURRENT_DEPLOYMENT = CONTRACT_CONFIGS[DEFAULT_NETWORK]

// Helper functions
export const getContractConfig = (chainId: number): ContractConfig => {
  return CONTRACT_CONFIGS[chainId] || CURRENT_DEPLOYMENT
}

export const getSupportedNetworks = (): number[] => {
  return Object.keys(CONTRACT_CONFIGS).map(Number)
}

export const isNetworkSupported = (chainId: number): boolean => {
  return chainId in CONTRACT_CONFIGS
}

/**
 * Normalize network name for matching (lowercase, trim, replace spaces with hyphens)
 */
export function normalizeNetworkName(networkName: string): string {
  return networkName.toLowerCase().trim().replace(/\s+/g, '-').replace(/_/g, '-')
}

/**
 * Get chain ID by network name (supports aliases)
 * Returns chain ID if found, null otherwise
 */
export function getChainIdByName(networkName: string): number | null {
  const normalized = normalizeNetworkName(networkName)
  
  // Search through all configs
  for (const [chainIdStr, config] of Object.entries(CONTRACT_CONFIGS)) {
    const chainId = Number(chainIdStr)
    
    // Check primary network name
    if (normalizeNetworkName(config.network) === normalized) {
      return chainId
    }
    
    // Check name aliases
    if (config.nameAliases) {
      for (const alias of config.nameAliases) {
        if (normalizeNetworkName(alias) === normalized) {
          return chainId
        }
      }
    }
  }
  
  return null
}

/**
 * Get network configuration by network name (supports aliases)
 * Returns ContractConfig if found, null otherwise
 */
export function getNetworkByName(networkName: string): ContractConfig | null {
  const chainId = getChainIdByName(networkName)
  if (chainId === null) {
    return null
  }
  return getContractConfig(chainId)
}

/**
 * Get all supported network name aliases
 * Returns array of all supported network names (primary + aliases)
 */
export function getSupportedNetworkNames(): string[] {
  const names: string[] = []
  
  for (const config of Object.values(CONTRACT_CONFIGS)) {
    // Add primary network name
    names.push(config.network)
    
    // Add aliases
    if (config.nameAliases) {
      names.push(...config.nameAliases)
    }
  }
  
  return names
}

/**
 * Fuzzy match network name (for backward compatibility)
 * Handles partial matches like "sepolia" matching "Base Sepolia" or "Arbitrum Sepolia"
 * Returns best match or null
 */
export function fuzzyMatchNetworkName(networkName: string): ContractConfig | null {
  const normalized = normalizeNetworkName(networkName)
  
  // First try exact match
  const exactMatch = getNetworkByName(networkName)
  if (exactMatch) {
    return exactMatch
  }
  
  // Try partial matching
  const matches: Array<{ config: ContractConfig; score: number }> = []
  
  for (const config of Object.values(CONTRACT_CONFIGS)) {
    const configNormalized = normalizeNetworkName(config.network)
    let score = 0
    
    // Check if normalized input is contained in config name or vice versa
    if (configNormalized.includes(normalized) || normalized.includes(configNormalized)) {
      score = Math.max(configNormalized.length, normalized.length) / Math.min(configNormalized.length, normalized.length)
      matches.push({ config, score })
    }
    
    // Check aliases
    if (config.nameAliases) {
      for (const alias of config.nameAliases) {
        const aliasNormalized = normalizeNetworkName(alias)
        if (aliasNormalized.includes(normalized) || normalized.includes(aliasNormalized)) {
          score = Math.max(aliasNormalized.length, normalized.length) / Math.min(aliasNormalized.length, normalized.length)
          matches.push({ config, score })
        }
      }
    }
  }
  
  // Return best match (highest score)
  if (matches.length > 0) {
    matches.sort((a, b) => b.score - a.score)
    return matches[0].config
  }
  
  return null
}
