// =============================================================================
// NeoZipkit - Unified Package Exports
// =============================================================================

// Core shared exports (from core module)
export * from './core';
import Zipkit from './core';
export default Zipkit;

// Browser-only exports
export { default as ZipkitBrowser } from './browser/ZipkitBrowser';

// Node.js-only exports (now included in main build)
export { verifyOts as verifyTimestamp } from './blockchain/core/ZipkitOTS';

// Blockchain exports - be specific to avoid duplicates
export { 
  ZipkitMinter,
  ZipkitVerifier,
  CoreWalletManager,
  WalletAnalyzer,
  createTimestamp,
  verifyOts,
  verifyOtsZip,
  WalletManagerBrowser,
  ZipkitMinterBrowser,
  TokenVerifierBrowser,
  createTokenVerifier,
  checkForTokenization,
  WalletManagerNode,
  ZipkitWallet
} from './blockchain';
export type {
  MintingOptions,
  MintingResult,
  VerificationOptions,
  VerificationResult,
  EnhancedVerificationResult,
  WalletInfo,
  NetworkConfig,
  TokenMetadata,
  WalletSetupResult,
  CommonTokenConfig,
  TokenInfo,
  WalletBasicInfo,
  TokenScanResult,
  NZipTokenDetails,
  TimestampResult,
  TimestampInfo,
  DeserializeOtsResult,
  OtsVerifyResult,
  WalletConfigBrowser,
  TokenizationResult,
  ExistingToken,
  TokenVerificationResult,
  TokenVerificationOptions,
  BlockchainVerification,
  BatchVerificationResult,
  VerificationJob
} from './blockchain';

// All core functionality is exported from './core' above

// Platform-specific conditional exports
export const PlatformUtils = {
  // Browser detection
  isBrowser: typeof window !== 'undefined' && typeof document !== 'undefined',
  // Node.js detection  
  isNode: typeof process !== 'undefined' && process.versions && process.versions.node,
};