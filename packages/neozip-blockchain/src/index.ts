/**
 * neozip-blockchain
 * Blockchain functionality for NeoZip - NFT minting, verification, and wallet management
 * 
 * This package provides standalone blockchain operations that work with neozipkit or independently.
 */

// Export core blockchain functionality (platform-agnostic)
export * from './core';

// Export browser-specific blockchain functionality
export * from './browser';

// Export Node.js-specific blockchain functionality (only WalletManagerNode is Node-specific)
export { 
  WalletManagerNode, 
  ZipkitWallet 
} from './node';

// Export enhanced verification types from core
export type { 
  EnhancedVerificationResult, 
  BatchVerificationResult, 
  VerificationJob 
} from './core/ZipkitVerifier';

// Export Logger utility for console control
export { Logger, configureLoggerFromEnvironment } from './utils/Logger';
export type { LogLevel, LoggerConfig } from './utils/Logger';

// Export NeoZip Token Service (TokenService) API functionality
export * from './token-service';

// Archive-agnostic sidecar builders (pure; no ZIP I/O).
// The flows that touch archives (stampArchive, upgradeTimestamp, mintTimestampProof,
// mintDirect, verifyArchive, writeSidecars) live in `neozip-blockchain/archive`
// so the root entry does not load `neozipkit/node` for them.
export {
  buildSubmitSidecar,
  buildTimestampSidecar,
  buildTokenSidecar,
  type Sidecar,
} from './sidecars/builders';
export type {
  StampArchiveOptions,
  StampArchiveResult,
  UpgradeTimestampOptions,
  UpgradeTimestampResult,
  UpgradeTimestampStatus,
  MintTimestampProofOptions,
  MintTimestampProofResult,
  MintDirectOptions,
  MintDirectResult,
  VerifyArchiveOptions,
  VerifyArchiveResult,
  VerifyArchiveStatus,
} from './archive';

// Export package version (keep in sync with package.json version)
export { VERSION } from './version';

