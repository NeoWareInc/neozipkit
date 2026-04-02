/**
 * Zipstamp Server API Module
 * 
 * Provides timestamping functionality using Zipstamp server API,
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
} from './ZipstampServerAPI';

// ZipstampServerClient and core types
export {
  ZipstampServerClient,
  type ZipstampServerOptions,
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
  type VerifyEmailRequest,
  type VerifyEmailResponse,
  // Calendar discovery types
  type CalendarIdentity,
  type CalendarChainInfo,
  type HealthCheckResponse,
  type ComponentHealth,
} from './ZipstampServerClient';

// High-level convenience functions for Zipstamp server operations
export {
  // Core operations
  submitDigest,
  verifyDigest,
  pollForConfirmation,
  prepareMint,
  checkNFTStatus,
  getNFTContractInfo,
  getZipStampServerUrl,
  // Authentication helpers
  registerEmail,
  verifyEmailCode,
  // Calendar discovery helpers
  getCalendarIdentity,
  checkCalendarHealth,
  // Types
  type SubmitDigestResponse,
  type VerifyDigestResponse,
  type TimestampMetadata,
  type ExtendedTokenMetadata,
  type ZipstampServerHelperOptions,
} from './ZipstampServerHelpers';

// Server URL constants (single source: src/constants/servers.ts)
export {
  DEFAULT_ZIPSTAMP_SERVER_URL,
  ZIPSTAMP_SERVER_URLS,
  getDefaultZipStampServerUrls,
  type GetZipStampServerUrlOptions,
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
