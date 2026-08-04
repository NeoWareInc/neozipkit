/**
 * NeoZip Token Service (TokenService) module
 *
 * Provides timestamping functionality using the NeoZip Token Service API,
 * similar to OpenTimestamps but using Ethereum blockchain.
 * 
 * **Authentication:**
 * - Verification endpoints are PUBLIC (no API key required)
 * - Stamping requires a verified email in the request (no API key)
 * 
 * **Multi-Calendar Support:**
 * - Use `CalendarManager` to submit to multiple calendars for redundancy
 * - Similar to OpenTimestamps' approach of using multiple calendar servers
 */

import {
  TS_SUBMIT_NZIP,
  TIMESTAMP_NZIP,
  TOKEN_NZIP,
  TOKEN_NZIP_LEGACY,
} from '../constants/metadata';

// Re-export metadata filenames (single source: src/constants/metadata.ts)
export const SUBMIT_METADATA = TS_SUBMIT_NZIP;
export const TIMESTAMP_METADATA = TIMESTAMP_NZIP;
export const NFT_METADATA = TOKEN_NZIP;
export const NFT_METADATA_LEGACY = TOKEN_NZIP_LEGACY;

export {
  CMP_METHOD,
  createTimestamp,
  verifyTimestamp,
  verifyTimestampedZip,
  createTimestampedZip,
  createTimestampMetadataEntry,
  getEthTimestampEntry,
  extractTimestampData,
  type EthTimestampVerifyResult,
  type CreateTimestampOptions,
  type VerifyTimestampOptions,
  // Metadata utilities
  findMetadataEntry,
  getMetadataType,
  shouldUpgrade,
  getMetadataFileNames,
  type ZipEntry,
  type MetadataType,
  type MetadataEntryResult,
  // Proof verification utilities
  verifyMerkleProofLocal,
} from './TokenServiceAPI';

// TokenServiceClient and core types
export {
  TokenServiceClient,
  type TokenServiceClientOptions,
  type StampRequest,
  type StampResponse,
  type VerifyRequest,
  type VerifyResponse,
  type BatchQueueRequest,
  type BatchQueueResponse,
  type BatchStatusResponse,
  type TransferRequest,
  type TransferResponse,
  type CalendarInfo,
  type ServerStatus,
  type PrepareMintResponse,
  type NFTStatusResponse,
  type NFTContractInfoResponse,
  // Authentication types
  type RegisterRequest,
  type RegisterResponse,
  type VerificationDelivery,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
  // Calendar discovery types
  type CalendarIdentity,
  type CalendarChainInfo,
  type HealthCheckResponse,
  type ComponentHealth,
} from './TokenServiceClient';

// High-level convenience functions for NeoZip Token Service operations
export {
  // Core operations
  submitDigest,
  verifyDigest,
  pollForConfirmation,
  prepareMint,
  checkNFTStatus,
  getNFTContractInfo,
  getTokenServiceUrl,
  // Authentication helpers
  registerEmail,
  verifyEmailCode,
  parseVerificationDeliveryInput,
  // Calendar discovery helpers
  getCalendarIdentity,
  checkCalendarHealth,
  // Types
  type SubmitDigestResponse,
  type VerifyDigestResponse,
  type TimestampMetadata,
  type ExtendedTokenMetadata,
  type TokenServiceHelperOptions,
} from './TokenServiceHelpers';

// Server URL + network profiles (single source: src/constants/servers.ts)
export {
  DEFAULT_TOKEN_SERVICE_URL,
  PRODUCTION_TOKEN_SERVICE_URL,
  TOKEN_SERVICE_URLS,
  NETWORK_PROFILES,
  DEFAULT_NETWORK_PROFILE_KEY,
  getDefaultTokenServiceUrls,
  getTokenServiceUrlForNetwork,
  resolveNetworkProfile,
  isTokenPurchaseAvailable,
  type GetTokenServiceUrlOptions,
  type NetworkProfile,
  type NetworkProfileKey,
  type ResolveNetworkProfileOptions,
} from '../constants/servers';

// Multi-calendar support
export {
  CalendarManager,
  type CalendarConfig,
  type CalendarStatus,
  type SubmitResult,
  type MultiSubmitResult,
  type VerifyResult,
  type MultiCalendarOptions,
} from './CalendarManager';

// Low-level HTTP utilities shared by the account/funding/identity clients.
// Applications own token storage and may map auth failures to their own guidance.
export {
  normalizeServerUrl,
  safeJson,
  pickString,
  genericAuthErrorMessage,
  extractError,
  parseAccessTokenExpiry,
  formatTokenServiceFetchError,
} from './http';

// Account authentication: email/code, magic link, silent wallet-login, phone OTP.
export {
  registerEmailWithDelivery,
  registerEmailApp,
  registerEmailCli,
  verifyEmailAndExtractToken,
  exchangeMagicLinkToken,
  WalletLoginUnavailableError,
  requestWalletLoginChallenge,
  walletLogin,
  requestPhoneOtp,
  verifyPhoneOtp,
  type AccountVerificationDelivery,
  type RegisterEmailResult,
  type AccessTokenResult,
} from './TokenServiceAccountAuth';

// Native-gas funding for the user's primary Data Wallet.
export {
  FundingUnavailableError,
  getFundingPolicy,
  getFundingStatus,
  requestFundingGrant,
  type FundingPolicy,
  type FundingPolicyResult,
  type FundingGrantSummary,
  type FundingStatusResult,
  type FundingRequestResult,
} from './TokenServiceFunding';

// Wallet linking and encrypted identity-key registration (HTTP primitives).
export {
  DEFAULT_RECIPIENT_SUITE,
  IdentityKeyConflictError,
  fetchCoordinatorConfig,
  requestWalletEnsureChallenge,
  completeWalletEnsure,
  requestWalletAttachChallenge,
  completeWalletAttach,
  getIdentityKeyBundle,
  requestIdentityKeyInitChallenge,
  completeIdentityKeyInit,
  type WrapBundle,
  type IdentityKeyBundleBody,
} from './TokenServiceIdentity';
