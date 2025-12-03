/**
 * Core Blockchain Module Exports
 * Platform-agnostic blockchain functionality for ZIP file tokenization
 */

// Export all types from consolidated types location
export * from '../../types';

export {
  ZipkitMinter,
  MintingOptions,
  MintingResult,
  DuplicateCheckResult,
  WalletInfo,
  validatePrivateKey
} from './ZipkitMinter';

export {
  ZipkitVerifier,
  VerificationOptions,
  VerificationResult
} from './ZipkitVerifier';

export { TokenMetadata } from '../../types';

// Export core wallet functionality
export {
  CoreWalletManager,
  WalletAnalyzer,
  CommonTokenConfig,
  TokenInfo,
  WalletBasicInfo,
  TokenScanResult,
  NZipTokenDetails
} from './WalletManager';

export { 
  NZIP_CONTRACT_ABI, 
  NZIP_CONTRACT_ABI_WEB3,
  CONTRACT_CONFIGS,
  CURRENT_DEPLOYMENT,
  DEFAULT_NETWORK,
  getContractConfig,
  getSupportedNetworks,
  isNetworkSupported,
  getChainIdByName,
  getSupportedNetworkNames,
  getNetworkByName,
  normalizeNetworkName,
  ContractConfig
} from './contracts';

// Export OpenTimestamps utilities
export { 
  createTimestamp,
  deserializeOts,
  parseVerifyResult,
  upgradeOTS,
  createOtsMetadataEntry,
  bufferToArrayBuffer,
  getOtsEntry,
  getOtsBuffer,
  getMerkleRootSafe,
  verifyOts,
  verifyOtsZip,
  // Export interfaces
  TimestampResult,
  TimestampInfo,
  DeserializeOtsResult,
  OtsVerifyResult
} from './ZipkitOTS';
