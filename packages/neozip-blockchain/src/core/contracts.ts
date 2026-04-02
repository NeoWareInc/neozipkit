// Contract addresses and configurations for different networks

import { TOKEN_NZIP, TOKEN_NZIP_LEGACY } from '../constants/metadata';

// Re-export token metadata filenames (used by ZipkitVerifier, TokenVerifierBrowser)
// Standard: TOKEN.NZIP. Legacy NZIP.TOKEN accepted for reading only.
export const TOKENIZED_METADATA = TOKEN_NZIP;
export const TOKENIZED_METADATA_LEGACY = TOKEN_NZIP_LEGACY;

// Import ethers for address validation
import { ethers } from 'ethers';

export interface ContractConfig {
  address: string
  network: string
  chainId: number
  explorerUrl: string
  rpcUrls: string[]
  version: string  // NFT/Unified contract version (e.g., "2.11", "2.10", "2.50")
  registryAddress?: string  // NZIPTimestampReg address (for v2.50+ with timestamp proof support)
  registryVersion?: string  // TimestampRegistry contract version when registryAddress is set (e.g., "0.90")
  nameAliases?: string[]  // Alternative network name formats (e.g., ["base-sepolia", "base sepolia"])
}

// NZIP NFT Contract configurations by network
export const CONTRACT_CONFIGS: Record<number, ContractConfig> = {
  // Base Sepolia (Primary testnet)
  84532: {
    address: '0xe4ee4f36CBAF2Bf2959740F6A0B326Acd175Ce77', // NZIP-NFT v2.51
    network: 'Base Sepolia',
    chainId: 84532,
    explorerUrl: 'https://sepolia.basescan.org',
    rpcUrls: [
      'https://sepolia.base.org',
      'https://base-sepolia-rpc.publicnode.com',
      'https://base-sepolia.gateway.tenderly.co'
    ],
    version: '2.51',
    registryAddress: '0x3CFc4E3886839dC859f611887660783a3EE241b4', // NZIPTimestampReg v0.90
    registryVersion: '0.90',
    nameAliases: ['base-sepolia', 'base sepolia', 'basesepolia', 'base-sepolia-testnet']
  },
  
  // Base Mainnet (Production)
  8453: {
    address: '0xd871Fba59F85108aF29299786DD8243B38dD9686',  // Production contract v2.10
    network: 'Base Mainnet',
    chainId: 8453,
    explorerUrl: 'https://basescan.org',
    rpcUrls: [
      'https://mainnet.base.org',
      'https://base.drpc.org',
      'https://base.gateway.tenderly.co'
    ],
    version: '2.10',
    nameAliases: ['base-mainnet', 'base mainnet', 'basemainnet', 'base']
  },
  
  // Ethereum Sepolia (Testnet)
  11155111: {
    address: '0x007e8888D976b0b9B6073694Da32B7b6e393f890', // Production contract v2.11
    network: 'Sepolia Testnet',
    chainId: 11155111,
    explorerUrl: 'https://sepolia.etherscan.io',
    rpcUrls: [
      'https://rpc.sepolia.ethpandaops.io',
      'https://eth-sepolia.public.blastapi.io',
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://sepolia.drpc.org',
      'https://1rpc.io/sepolia',
    ],
    version: '2.11',
    nameAliases: ['sepolia-testnet', 'sepolia testnet', 'sepoliatestnet', 'sepolia', 'ethereum-sepolia', 'ethereum sepolia']
  },
  
  // Arbitrum Sepolia (Testnet)
  421614: {
    address: '0x3b99a72cCAc108037741cacb0D60d5571CF6412C', // Production contract v2.11
    network: 'Arbitrum Sepolia',
    chainId: 421614,
    explorerUrl: 'https://sepolia.arbiscan.io',
    rpcUrls: [
      'https://sepolia-rollup.arbitrum.io/rpc',
      'https://arbitrum-sepolia-rpc.publicnode.com'
    ],
    version: '2.11',
    nameAliases: ['arbitrum-sepolia', 'arbitrum sepolia', 'arbitrumsepolia', 'arbitrum-sepolia-testnet']
  },
  
  // Arbitrum One (Production)
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
    version: '2.10',
    nameAliases: ['arbitrum-one', 'arbitrum one', 'arbitrumone', 'arbitrum', 'arbitrum-mainnet', 'arbitrum mainnet']
  },
}

// Contract ABI (ethers.js human-readable format)
// Minimal ABI that works with v2.10, v2.11, and v2.50 contracts
export const NZIP_CONTRACT_ABI = [
  // Minting function (v2.11/v2.50 signature with encryptedHash for new mints)
  "function publicMintZipFile(string memory merkleRootHash, string memory encryptedHash, uint256 creationTimestamp, string memory ipfsHash, string memory metadataURI) public payable returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function getTokensByMerkleRoot(string memory merkleRoot) external view returns (uint256[])",
  "function getTokensByOwner(address owner) external view returns (uint256[])",
  "function getZipFileInfo(uint256 tokenId) external view returns (tuple(string merkleRootHash, string encryptedHash, string ipfsHash, address creator, uint256 creationTimestamp, uint256 tokenizationTime, uint256 blockNumber))",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function isZipFileTokenized(string memory merkleRootHash, uint256 creationTimestamp) external view returns (bool exists, uint256 tokenId)",
  "function verifyZipFile(uint256 tokenId, string memory providedMerkleRoot) external view returns (bool isValid)",
  "function getVersion() external pure returns (string memory)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event ZipFileTokenized(uint256 indexed tokenId, address indexed creator, string merkleRootHash, string encryptedHash, uint256 creationTimestamp, string ipfsHash, uint256 tokenizationTime, uint256 blockNumber)"
]

// NZIP NFT v2.50 Contract ABI (full ABI with timestamp proof support)
export const NZIP_CONTRACT_ABI_V250 = [
  // v2.11 compatible functions
  "function publicMintZipFile(string memory merkleRootHash, string memory encryptedHash, uint256 creationTimestamp, string memory ipfsHash, string memory metadataURI) public payable returns (uint256)",
  "function publicMintZipFile(string memory merkleRootHash, uint256 creationTimestamp, string memory ipfsHash, string memory metadataURI) public payable returns (uint256)",
  "function getZipFileInfo(uint256 tokenId) external view returns (tuple(string merkleRootHash, string encryptedHash, string ipfsHash, address creator, uint256 creationTimestamp, uint256 tokenizationTime, uint256 blockNumber))",
  "function getEncryptedHash(uint256 tokenId) external view returns (string memory)",
  "function isZipFileTokenized(string memory merkleRootHash, uint256 creationTimestamp) external view returns (bool exists, uint256 tokenId)",
  "function verifyZipFile(uint256 tokenId, string memory providedMerkleRoot) external view returns (bool isValid)",
  "function verifyEncryptedZipFile(uint256 tokenId, string memory providedEncryptedHash) external view returns (bool isValid)",
  "function getBlockchainMetadata(uint256 tokenId) public view returns (uint256 blockNumber, uint256 tokenizationTime)",
  "function generateCompositeKey(string memory merkleRootHash, uint256 creationTimestamp) public pure returns (bytes32)",
  "function totalSupply() public view returns (uint256)",
  "function getVersion() external pure returns (string memory)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)",
  
  // v2.50 timestamp proof functions
  "function mintWithTimestampProof(string memory merkleRootHash, bytes32[] calldata proof, bytes32 batchMerkleRoot) external payable returns (uint256)",
  "function hasTimestampProof(uint256 tokenId) external view returns (bool)",
  "function getTimestampProof(uint256 tokenId) external view returns (tuple(bool hasTimestampProof, bytes32 batchMerkleRoot, uint256 batchTimestamp, uint256 batchBlockNumber) data, bytes32[] memory merkleProof)",
  "function getTokenData(uint256 tokenId) external view returns (bytes32 merkleRoot, uint256 mintedAt, uint256 mintBlockNumber, address originalOwner, bool hasProof, bytes32 batchMerkleRoot, uint256 batchTimestamp, uint256 batchBlockNumber)",
  "function verifyToken(uint256 tokenId) external view returns (bool isValid)",
  "function getRegistry() external view returns (address)",
  
  // v2.50 admin functions
  "function mintFee() public view returns (uint256)",
  "function mintFeeRequired() public view returns (bool)",
  "function setMintFee(uint256 newFee) external",
  "function setMintFeeRequired(bool required) external",
  "function withdrawFees(address payable to) external",
  "function authorizeMinter(address minter) external",
  "function deauthorizeMinter(address minter) external",
  "function isAuthorizedMinter(address minter) external view returns (bool)",
  
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event ZipFileTokenized(uint256 indexed tokenId, address indexed creator, string merkleRootHash, string encryptedHash, uint256 creationTimestamp, string ipfsHash, uint256 tokenizationTime, uint256 blockNumber)",
  "event TimestampProofMinted(uint256 indexed tokenId, address indexed creator, bytes32 indexed batchMerkleRoot, string merkleRootHash, uint256 batchTimestamp, uint256 tokenizationTime, uint256 blockNumber)",
  "event FeeUpdated(uint256 oldFee, uint256 newFee)",
  "event MinterAuthorized(address indexed minter, address indexed authorizedBy)",
  "event MinterDeauthorized(address indexed minter, address indexed deauthorizedBy)"
]

// NZIP NFT v2.51 Contract ABI (digest-only identity; getTokensByMerkleRoot; no composite key)
export const NZIP_CONTRACT_ABI_V251 = [
  "function publicMintZipFile(string memory merkleRootHash, string memory encryptedHash, uint256 creationTimestamp, string memory ipfsHash, string memory metadataURI) public payable returns (uint256)",
  "function publicMintZipFile(string memory merkleRootHash, uint256 creationTimestamp, string memory ipfsHash, string memory metadataURI) public payable returns (uint256)",
  "function getZipFileInfo(uint256 tokenId) external view returns (tuple(string merkleRootHash, string encryptedHash, string ipfsHash, address creator, uint256 creationTimestamp, uint256 tokenizationTime, uint256 blockNumber))",
  "function getEncryptedHash(uint256 tokenId) external view returns (string memory)",
  "function getTokensByMerkleRoot(string memory merkleRootHash) external view returns (uint256[] memory tokenIds)",
  "function isZipFileTokenized(string memory merkleRootHash, uint256 creationTimestamp) external view returns (bool exists, uint256 tokenId)",
  "function verifyZipFile(uint256 tokenId, string memory providedMerkleRoot) external view returns (bool isValid)",
  "function verifyEncryptedZipFile(uint256 tokenId, string memory providedEncryptedHash) external view returns (bool isValid)",
  "function getBlockchainMetadata(uint256 tokenId) public view returns (uint256 blockNumber, uint256 tokenizationTime)",
  "function totalSupply() public view returns (uint256)",
  "function getVersion() external pure returns (string memory)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function mintWithTimestampProof(string memory merkleRootHash, bytes32[] calldata proof, bytes32 batchMerkleRoot) external payable returns (uint256)",
  "function hasTimestampProof(uint256 tokenId) external view returns (bool)",
  "function getTimestampProof(uint256 tokenId) external view returns (tuple(bool hasTimestampProof, bytes32 batchMerkleRoot, uint256 batchTimestamp, uint256 batchBlockNumber) data, bytes32[] memory merkleProof)",
  "function getTokenData(uint256 tokenId) external view returns (bytes32 merkleRoot, uint256 mintedAt, uint256 mintBlockNumber, address originalOwner, bool hasProof, bytes32 batchMerkleRoot, uint256 batchTimestamp, uint256 batchBlockNumber)",
  "function verifyToken(uint256 tokenId) external view returns (bool isValid)",
  "function getRegistry() external view returns (address)",
  "function mintFee() public view returns (uint256)",
  "function mintFeeRequired() public view returns (bool)",
  "function isAuthorizedMinter(address minter) external view returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event ZipFileTokenized(uint256 indexed tokenId, address indexed creator, string merkleRootHash, string encryptedHash, uint256 creationTimestamp, string ipfsHash, uint256 tokenizationTime, uint256 blockNumber)",
  "event TimestampProofMinted(uint256 indexed tokenId, address indexed creator, bytes32 indexed batchMerkleRoot, string merkleRootHash, uint256 batchTimestamp, uint256 tokenizationTime, uint256 blockNumber)"
]

// NZIPTimestampReg Contract ABI (for batch timestamp verification)
export const NZIP_TIMESTAMP_REG_ABI = [
  'function verifyProof(bytes32 digest, bytes32[] calldata proof, bytes32 merkleRoot) external view returns (bool isValid, uint256 batchNumber, uint256 timestamp, uint256 blockNumber)',
  'function getBatch(bytes32 merkleRoot) external view returns (bool exists, uint256 batchNumber, uint256 timestamp, uint256 blockNumber, uint256 hashCount)',
  'function getBatchByNumber(uint256 batchNumber) external view returns (bool exists, bytes32 merkleRoot, uint256 timestamp, uint256 blockNumber, uint256 hashCount)',
  'function batchExists(bytes32 merkleRoot) external view returns (bool)',
  'function totalBatches() public view returns (uint256)',
  'function totalDigests() public view returns (uint256)',
  'function getStats() external view returns (uint256 _totalBatches, uint256 _totalDigests)',
  'function getVersion() external pure returns (string memory)',
  'function submitBatch(bytes32 merkleRoot, uint64 hashCount) external',
  'function addAuthorizedSubmitter(address submitter) external',
  'function removeAuthorizedSubmitter(address submitter) external',
  'function isAuthorizedSubmitter(address submitter) external view returns (bool)',
  'event BatchSubmitted(bytes32 indexed merkleRoot, uint256 indexed batchNumber, address indexed submitter, uint256 timestamp, uint256 blockNumber, uint256 hashCount)',
  'event SubmitterAdded(address indexed submitter, address indexed addedBy)',
  'event SubmitterRemoved(address indexed submitter, address indexed removedBy)',
];

// TimestampProofNFT ABI (minimal - for verification of v0.90-style timestamp proof NFT)
// Used by verify-zip when contract exposes getProof(uint256) with legacy tuple shape.
export const TIMESTAMP_PROOF_NFT_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getProof(uint256 tokenId) view returns (tuple(bytes32 digest, bytes32 merkleRoot, uint256 batchTimestamp, uint256 batchBlockNumber, uint256 mintedAt, address originalOwner), bytes32[])',
  'function getTokenByDigest(bytes32 digest) view returns (uint256)',
  'function isDigestMinted(bytes32 digest) view returns (bool)',
  'function verifyToken(uint256 tokenId) view returns (bool)',
  'function getVersion() pure returns (string)',
  'function registry() view returns (address)',
];

// UnifiedNFT verification ABI (minimal - for verify-zip and token-create; v2.50 getTokenData/getTimestampProof)
// Subset of NZIP_CONTRACT_ABI_V250 used when only reading token/proof data.
export const UNIFIED_NFT_VERIFY_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getTokenData(uint256 tokenId) view returns (tuple(bytes32 merkleRoot, uint256 mintedAt, uint256 mintBlockNumber, address originalOwner, bool hasTimestampProof, bytes32 batchMerkleRoot, uint256 batchTimestamp, uint256 batchBlockNumber))',
  'function getTimestampProof(uint256 tokenId) view returns (bytes32 digest, bytes32[] proof, bytes32 batchMerkleRoot, uint256 batchTimestamp, uint256 batchBlockNumber)',
  'function getTokenByMerkleRoot(bytes32 merkleRoot) view returns (uint256)',
  'function isMinted(bytes32 merkleRoot) view returns (bool)',
  'function hasTimestampProof(uint256 tokenId) view returns (bool)',
  'function verifyToken(uint256 tokenId) view returns (bool)',
  'function getVersion() pure returns (string)',
  'function getRegistry() view returns (address)',
];

// Contract ABI (Web3.js JSON format)
export const NZIP_CONTRACT_ABI_WEB3 = [
  {
    inputs: [
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

// Default configuration (Base Sepolia for development; v2.51 contract)
export const DEFAULT_NETWORK = 84532
export const CURRENT_DEPLOYMENT = CONTRACT_CONFIGS[DEFAULT_NETWORK]
/** Default contract version used when version is unspecified (e.g. legacy metadata). Prefer v2.50. */
export const DEFAULT_CONTRACT_VERSION = '2.50'

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
 * Get contract adapter for a given chain ID
 * Uses the version from CONTRACT_CONFIGS to select the appropriate adapter
 * @param chainId Chain ID
 * @returns ContractVersionAdapter instance
 * @throws Error if chainId not found or version not supported
 */
export function getContractAdapter(chainId: number): import('./adapters/ContractVersionAdapter').ContractVersionAdapter {
  const config = getContractConfig(chainId);
  
  if (!config) {
    throw new Error(`No contract config found for chainId: ${chainId}`);
  }
  
  if (!config.version) {
    throw new Error(`Contract version not specified for chainId: ${chainId}`);
  }
  
  // Import here to avoid circular dependency
  const { getAdapter } = require('./adapters/AdapterFactory');
  return getAdapter(config.version);
}

/**
 * Get contract adapter by version string
 * @param version Contract version (e.g., "2.11", "2.10")
 * @returns ContractVersionAdapter instance
 * @throws Error if version not supported
 */
export function getContractAdapterByVersion(version: string): import('./adapters/ContractVersionAdapter').ContractVersionAdapter {
  // Import here to avoid circular dependency
  const { getAdapter } = require('./adapters/AdapterFactory');
  return getAdapter(version);
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

/**
 * Validate that a token ID is a valid uint256 format
 * Token IDs must be numeric strings that can be converted to BigInt and be within uint256 bounds
 * 
 * @param tokenId Token ID string to validate
 * @returns Validation result with success status and error message if failed
 */
export function validateTokenId(tokenId: string): { success: boolean; error?: string } {
  if (!tokenId || typeof tokenId !== 'string') {
    return {
      success: false,
      error: 'Token ID must be a non-empty string'
    };
  }

  // Trim whitespace
  const trimmed = tokenId.trim();
  if (trimmed.length === 0) {
    return {
      success: false,
      error: 'Token ID cannot be empty or whitespace only'
    };
  }

  // Check if it's a valid numeric string (allows decimal, hex with 0x prefix, or plain numeric)
  // Remove 0x prefix if present for validation
  const normalized = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  
  // Must contain only hexadecimal digits (0-9, a-f, A-F)
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    return {
      success: false,
      error: `Token ID must be a valid numeric string (hexadecimal). Got: ${tokenId}`
    };
  }

  // Check if it can be converted to BigInt (uint256)
  try {
    const bigIntValue = BigInt(trimmed.startsWith('0x') ? trimmed : `0x${normalized}`);
    
    // uint256 max value: 2^256 - 1
    const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    
    if (bigIntValue < 0n || bigIntValue > maxUint256) {
      return {
        success: false,
        error: `Token ID out of uint256 bounds (0 to 2^256-1). Got: ${tokenId}`
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `Token ID validation failed: ${errorMessage}. Token ID: ${tokenId}`
    };
  }

  return { success: true };
}

/**
 * Validate that an Ethereum address is in the correct format
 * Uses ethers.js validation to ensure proper format and checksum
 * 
 * @param address Ethereum address to validate
 * @returns Validation result with success status and error message if failed
 */
export function validateEthereumAddress(address: string): { success: boolean; error?: string; normalizedAddress?: string } {
  if (!address || typeof address !== 'string') {
    return {
      success: false,
      error: 'Address must be a non-empty string'
    };
  }

  // Trim whitespace
  const trimmed = address.trim();
  if (trimmed.length === 0) {
    return {
      success: false,
      error: 'Address cannot be empty or whitespace only'
    };
  }

  // Validate address format using ethers.js
  if (!ethers.isAddress(trimmed)) {
    return {
      success: false,
      error: `Invalid Ethereum address format: ${trimmed}`
    };
  }

  // Normalize to checksum format
  try {
    const normalized = ethers.getAddress(trimmed);
    return {
      success: true,
      normalizedAddress: normalized
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown address normalization error';
    return {
      success: false,
      error: `Address normalization failed: ${errorMessage}`
    };
  }
}

/**
 * Sanitize and validate network name
 * Removes leading/trailing whitespace, validates length, and removes potentially dangerous characters
 * 
 * @param networkName Network name to sanitize
 * @returns Validation result with success status, sanitized name, and error message if failed
 */
export function sanitizeNetworkName(networkName: string): { success: boolean; sanitized?: string; error?: string } {
  if (!networkName || typeof networkName !== 'string') {
    return {
      success: false,
      error: 'Network name must be a non-empty string'
    };
  }

  // Trim whitespace
  const trimmed = networkName.trim();
  if (trimmed.length === 0) {
    return {
      success: false,
      error: 'Network name cannot be empty or whitespace only'
    };
  }

  // Validate length (reasonable limit to prevent DoS)
  const MAX_NETWORK_NAME_LENGTH = 100;
  if (trimmed.length > MAX_NETWORK_NAME_LENGTH) {
    return {
      success: false,
      error: `Network name too long (max ${MAX_NETWORK_NAME_LENGTH} characters). Got: ${trimmed.length}`
    };
  }

  // Remove control characters and validate basic character set
  // Allow alphanumeric, spaces, hyphens, underscores, and common punctuation
  const sanitized = trimmed.replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Remove control characters
  
  // Check for potentially dangerous patterns (script tags, etc.)
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // Event handlers like onclick=
    /data:text\/html/i
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(sanitized)) {
      return {
        success: false,
        error: `Network name contains potentially dangerous content: ${sanitized}`
      };
    }
  }

  return {
    success: true,
    sanitized
  };
}

/**
 * Validate that a merkle root is in the correct format
 * Merkle roots should be valid hexadecimal strings of 64 characters (SHA-256 hash)
 * 
 * @param merkleRoot Merkle root string to validate
 * @returns Validation result with success status and error message if failed
 */
export function validateMerkleRootFormat(merkleRoot: string): { success: boolean; error?: string; normalized?: string } {
  if (!merkleRoot || typeof merkleRoot !== 'string') {
    return {
      success: false,
      error: 'Merkle root must be a non-empty string'
    };
  }

  // Trim whitespace
  const trimmed = merkleRoot.trim();
  if (trimmed.length === 0) {
    return {
      success: false,
      error: 'Merkle root cannot be empty or whitespace only'
    };
  }

  // Remove 0x prefix if present for validation
  const normalized = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  
  // Must be exactly 64 hexadecimal characters (SHA-256 hash)
  if (normalized.length !== 64) {
    return {
      success: false,
      error: `Merkle root must be exactly 64 hexadecimal characters (SHA-256). Got: ${normalized.length} characters`
    };
  }

  // Must contain only hexadecimal digits (0-9, a-f, A-F)
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    return {
      success: false,
      error: `Merkle root must be a valid hexadecimal string. Got: ${trimmed}`
    };
  }

  // Return normalized version (with 0x prefix for consistency)
  return {
    success: true,
    normalized: `0x${normalized.toLowerCase()}`
  };
}

/**
 * Validate that a contract address matches the expected contract address for a network
 * This prevents attackers from creating fake metadata pointing to malicious contracts
 * 
 * @param contractAddress Contract address to validate
 * @param networkChainId Chain ID of the network
 * @param debug Optional debug flag for logging
 * @returns Validation result with success status and error message if failed
 */
export function validateContractAddress(
  contractAddress: string,
  networkChainId: number,
  debug: boolean = false
): { success: boolean; error?: string } {
  if (debug) {
    console.log(`[DEBUG] Validating contract address: ${contractAddress} for chainId: ${networkChainId}`);
  }

  // Get expected contract address for this network
  const networkConfig = getContractConfig(networkChainId);
  if (!networkConfig) {
    return {
      success: false,
      error: `Network configuration not found for chainId: ${networkChainId}`
    };
  }

  const expectedAddress = networkConfig.address;

  // Normalize addresses for comparison (Ethereum addresses are case-insensitive)
  // Use ethers.js getAddress() to normalize both addresses to checksum format
  let normalizedProvided: string;
  let normalizedExpected: string;

  try {
    // Validate and normalize the provided address
    if (!ethers.isAddress(contractAddress)) {
      return {
        success: false,
        error: `Invalid contract address format: ${contractAddress}`
      };
    }
    normalizedProvided = ethers.getAddress(contractAddress);

    // Normalize the expected address
    normalizedExpected = ethers.getAddress(expectedAddress);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown address validation error';
    return {
      success: false,
      error: `Address validation failed: ${errorMessage}`
    };
  }

  // Compare normalized addresses
  if (normalizedProvided.toLowerCase() !== normalizedExpected.toLowerCase()) {
    if (debug) {
      console.log(`[DEBUG] Contract address mismatch:`);
      console.log(`[DEBUG]   Provided: ${normalizedProvided}`);
      console.log(`[DEBUG]   Expected: ${normalizedExpected}`);
    }
    return {
      success: false,
      error: `Contract address mismatch: provided address ${normalizedProvided} does not match expected address ${normalizedExpected} for network (chainId: ${networkChainId})`
    };
  }

  if (debug) {
    console.log(`[DEBUG] Contract address validation passed: ${normalizedProvided} matches expected address for network`);
  }

  return { success: true };
}
