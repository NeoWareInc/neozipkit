/**
 * Browser Blockchain Module Exports
 * Browser-specific blockchain functionality for ZIP file tokenization
 */

export { WalletManagerBrowser } from './WalletManagerBrowser';
export type { WalletConfigBrowser } from './WalletManagerBrowser';

export { ZipkitMinterBrowser } from './ZipkitMinterBrowser';
export type { TokenizationResult, ExistingToken } from './ZipkitMinterBrowser';

export { TokenVerifierBrowser, createTokenVerifier, checkForTokenization } from './TokenVerifierBrowser';
export { TOKENIZED_METADATA, TOKENIZED_METADATA_LEGACY } from '../core/contracts';
export type { TokenVerificationResult, TokenVerificationOptions, BlockchainVerification } from './TokenVerifierBrowser';

