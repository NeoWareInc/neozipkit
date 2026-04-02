/**
 * Core Blockchain Module Exports
 * Platform-agnostic blockchain functionality for ZIP file tokenization
 */

// Export all types from types location
export * from '../types';

export {
  ZipkitMinter,
  validatePrivateKey
} from './ZipkitMinter';
export type {
  MintingOptions,
  MintingResult,
  DuplicateCheckResult,
  WalletInfo,
  TokenInfo
} from './ZipkitMinter';

export {
  ZipkitVerifier,
} from './ZipkitVerifier';
export type {
  VerificationOptions,
  VerificationResult,
  EnhancedVerificationResult,
  BatchVerificationResult,
  VerificationJob
} from './ZipkitVerifier';

export type { TokenMetadata } from '../types';

// Export core wallet functionality
export {
  CoreWalletManager,
  WalletAnalyzer,
} from './WalletManager';
export type {
  CommonTokenConfig,
  TokenInfo as WalletTokenInfo,
  WalletBasicInfo,
  TokenScanResult,
  NZipTokenDetails
} from './WalletManager';

export { 
  NZIP_CONTRACT_ABI, 
  NZIP_CONTRACT_ABI_WEB3,
  NZIP_CONTRACT_ABI_V250,
  NZIP_TIMESTAMP_REG_ABI,
  TIMESTAMP_PROOF_NFT_ABI,
  UNIFIED_NFT_VERIFY_ABI,
  CONTRACT_CONFIGS,
  CURRENT_DEPLOYMENT,
  DEFAULT_CONTRACT_VERSION,
  DEFAULT_NETWORK,
  TOKENIZED_METADATA,
  TOKENIZED_METADATA_LEGACY,
  getContractConfig,
  getSupportedNetworks,
  isNetworkSupported,
  getChainIdByName,
  getSupportedNetworkNames,
  getNetworkByName,
  normalizeNetworkName,
  getContractAdapter,
  getContractAdapterByVersion,
  validateContractAddress,
  validateTokenId,
  validateEthereumAddress,
  sanitizeNetworkName,
  validateMerkleRootFormat
} from './contracts';
export type { ContractConfig } from './contracts';

// Export contract version registry
export {
  VERSION_REGISTRY,
  IMPLEMENTED_VERSIONS,
  getVersionCapabilities,
  isVersionSupported,
  normalizeVersion,
  getSupportedVersions
} from './ContractVersionRegistry';
export type {
  ContractVersion,
  VersionCapabilities
} from './ContractVersionRegistry';

// Export adapters
export { getAdapter, getAdapterByChainId } from './adapters/AdapterFactory';
export { V2_10Adapter } from './adapters/V2_10Adapter';
export { V2_11Adapter } from './adapters/V2_11Adapter';
export { V2_50Adapter } from './adapters/V2_50Adapter';
export type {
  ContractVersionAdapter,
  ZipFileInfo,
  ZipFileTokenizedEvent,
  TimestampProofData
} from './adapters/ContractVersionAdapter';

// Export Logger utility
export { Logger, configureLoggerFromEnvironment } from '../utils/Logger';
export type { LogLevel, LoggerConfig } from '../utils/Logger';
