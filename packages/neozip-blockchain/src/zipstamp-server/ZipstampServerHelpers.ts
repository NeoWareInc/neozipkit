/**
 * Zipstamp Server Helpers
 * 
 * High-level convenience functions for interacting with the Zipstamp server API.
 * These functions provide a simplified interface for common operations like
 * submitting digests, verifying timestamps, polling for confirmation, and NFT operations.
 * 
 * This module wraps the core ZipstampServerClient with convenience functions
 * and response type transformations for easier use in applications.
 */

import { ZipstampServerClient, type PrepareMintResponse, type NFTStatusResponse, type NFTContractInfoResponse } from './ZipstampServerClient';
import { getZipStampServerUrl } from '../constants/servers';

// ============================================================================
// Types
// ============================================================================

/**
 * Response from submitting a digest to the Zipstamp server.
 * 
 * Returned by `submitDigest` function after submitting a digest for timestamping.
 */
export interface SubmitDigestResponse {
  success: boolean;
  digest: string;
  batchId?: string | null;
  batchNumber?: number;
  chainId?: number;
  network?: string;
  status: 'pending' | 'minting' | 'confirmed';
  error?: string;
}

/**
 * Response from verifying a digest with the Zipstamp server.
 * 
 * Returned by `verifyDigest` and `pollForConfirmation` functions after checking
 * timestamp status. Contains detailed blockchain information if confirmed.
 */
export interface VerifyDigestResponse {
  success: boolean;
  verified: boolean;
  digest: string;
  tokenId?: string;
  contractAddress?: string;
  network?: string;
  chainId?: number;
  transactionHash?: string;
  blockNumber?: number;
  timestamp?: number;
  merkleRoot?: string;
  merkleProof?: string[];  // Proof path for direct blockchain verification
  batchId?: string;
  batchNumber?: number;
  status?: 'pending' | 'confirmed';
  error?: string;
}

/**
 * Timestamp metadata format stored in ZIP files
 * Extended version with all fields needed for examples and verification
 */
export interface TimestampMetadata {
  digest: string;
  batchId?: string | null;
  batchNumber?: number;
  chainId?: number;
  network?: string;
  status?: 'pending' | 'confirmed'; // Optional: only present in TIMESTAMP.NZIP (confirmed), not in TS-SUBMIT.NZIP
  serverUrl: string;
  submittedAt: string;
  // Fields populated after upgrade (for direct blockchain verification)
  merkleProof?: string[];      // Proof path for direct blockchain verification
  merkleRoot?: string;
  transactionHash?: string;
  blockNumber?: number;
  timestamp?: number;          // Blockchain confirmation timestamp
  contractAddress?: string;
  tokenId?: string;
  confirmedAt?: string;
}

/**
 * Extended Token Metadata (compatible with neozipkit TokenMetadata)
 * 
 * This interface extends the base TokenMetadata with timestamp proof information
 * for NFTs minted from timestamped ZIP files via the Zipstamp server.
 * 
 * The timestampProof section links the NFT to the original timestamp batch,
 * proving both NFT ownership AND timestamp verification.
 */
export interface ExtendedTokenMetadata {
  // Standard neozipkit fields
  tokenId: string;
  contractAddress: string;       // TimestampProofNFT address
  network: string;
  merkleRoot: string;            // ZIP file's merkle root (= digest)
  networkChainId: number;
  contractVersion: string;
  transactionHash?: string;      // NFT mint transaction
  blockNumber?: number;          // NFT mint block
  owner?: string;
  mintedAt?: string;
  
  // Extended timestamp proof fields
  timestampProof: {
    digest: string;              // SHA-256 of ZIP = ZIP's merkleRoot
    merkleProof: string[];       // Proof path from digest to batchMerkleRoot
    batchMerkleRoot: string;     // Root of batch tree (stored on NZIPTimestampReg)
    batchNumber: number;
    batchTransactionHash: string;
    batchBlockNumber: number;
    batchTimestamp: number;
    registryAddress: string;
    nftContractAddress: string;
    serverUrl: string;
  };
}

// Re-export NFT response types from ZipstampServerClient (source of truth)
export type { PrepareMintResponse, NFTStatusResponse, NFTContractInfoResponse } from './ZipstampServerClient';

// ============================================================================
// Options
// ============================================================================

/**
 * Options for Zipstamp server helper functions.
 * 
 * Common configuration options used across helper functions in ZipstampServerHelpers.
 * Stamping requires a verified email in the request (no API key).
 */
export interface ZipstampServerHelperOptions {
  /** Zipstamp server URL (defaults to library constant / ZIPSTAMP_SERVER_URL or TOKEN_SERVER_URL env) */
  serverUrl?: string;
  /** Key into ZIPSTAMP_SERVER_URLS (e.g. "default", "staging") */
  serverKey?: string;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Re-export for callers that need to resolve server URL (single source: constants/servers.ts) */
export { getZipStampServerUrl };

function getClient(options?: ZipstampServerHelperOptions): ZipstampServerClient {
  return new ZipstampServerClient({ 
    serverUrl: getZipStampServerUrl(options),
  });
}

function shouldDebug(options?: ZipstampServerHelperOptions): boolean {
  if (options?.debug !== undefined) {
    return options.debug;
  }
  return process.env.ZIPSTAMP_DEBUG === 'true' || process.env.DEBUG === 'true';
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Submits a digest to the Zipstamp server for blockchain timestamping.
 * 
 * Sends a SHA-256 digest (merkle root) to the Zipstamp server API to be included
 * in the next batch for blockchain timestamping. The digest is typically the
 * merkle root of a ZIP file's contents.
 * 
 * Stamping requires a verified email (include email in the request; user must
 * have verified via POST /auth/register and POST /auth/verify first).
 * 
 * @param digest - SHA-256 hash as a 64-character hexadecimal string (no '0x' prefix)
 * @param email - Email address (must be verified on the server)
 * @param chainId - Optional chain ID hint (server may use this to select the network)
 * @param options - Optional configuration
 * @param options.serverUrl - Zipstamp server URL (defaults to `ZIPSTAMP_SERVER_URL` env var or `https://zipstamp-dev.neozip.io`)
 * @param options.debug - Enable debug logging (defaults to `false`)
 * @returns Promise resolving to response containing batch information and status
 * 
 * @example
 * ```typescript
 * const response = await submitDigest(
 *   'a1b2c3d4e5f6...', // 64-char hex string
 *   'user@example.com',
 *   undefined, // Let server choose chain
 *   { debug: true }
 * );
 * 
 * if (response.success) {
 *   console.log('Submitted to batch:', response.batchId);
 *   console.log('Status:', response.status); // 'pending' | 'minting' | 'confirmed'
 * }
 * ```
 */
export async function submitDigest(
  digest: string,
  email?: string,
  chainId?: number,
  options?: ZipstampServerHelperOptions
): Promise<SubmitDigestResponse> {
  const client = getClient(options);
  const reqBody = { digest, chainId, email };
  if (shouldDebug(options)) {
    console.log('[Zipstamp Server API] POST /stamp request:', JSON.stringify(reqBody, null, 2));
  }
  const res = await client.stamp(reqBody);
  if (shouldDebug(options)) {
    console.log('[Zipstamp Server API] POST /stamp response:', JSON.stringify(res, null, 2));
  }

  return {
    success: res.success,
    digest: res.digest,
    batchId: res.batchId ?? null,
    batchNumber: res.batchNumber,
    chainId: res.chainId,
    network: res.network,
    status: res.status,
    error: res.error,
  };
}

/**
 * Verifies a digest using the Zipstamp server API.
 * 
 * Checks with the Zipstamp server whether a digest has been confirmed on the blockchain.
 * Returns detailed verification information including transaction hash, block number,
 * and merkle proof data if the timestamp is confirmed.
 * 
 * @param digest - The SHA-256 digest (64-character hex string) to verify
 * @param chainId - Optional chain ID hint to help server select the correct network
 * @param batchId - Optional batch ID hint to help server disambiguate if digest appears in multiple batches
 * @param client - Optional pre-configured ZipstampServerClient instance (useful for polling with custom timeout/retry settings)
 * @param options - Optional configuration
 * @param options.serverUrl - Zipstamp server URL (defaults to `ZIPSTAMP_SERVER_URL` env var or `https://zipstamp-dev.neozip.io`)
 * @param options.debug - Enable debug logging (defaults to `false`)
 * @returns Promise resolving to verification response with status and blockchain details
 * 
 * @example
 * ```typescript
 * const response = await verifyDigest(
 *   'a1b2c3d4e5f6...',
 *   84532, // Base Sepolia
 *   'base-sep-v0.90-n7', // Batch ID from metadata
 *   undefined, // Use default client
 *   { debug: true }
 * );
 * 
 * if (response.verified) {
 *   console.log('✅ Confirmed on blockchain');
 *   console.log('Transaction:', response.transactionHash);
 *   console.log('Block:', response.blockNumber);
 *   console.log('Merkle proof available:', !!response.merkleProof);
 * } else {
 *   console.log('⏳ Pending confirmation');
 * }
 * ```
 */
export async function verifyDigest(
  digest: string,
  chainId?: number,
  batchId?: string,
  client?: ZipstampServerClient,
  options?: ZipstampServerHelperOptions
): Promise<VerifyDigestResponse> {
  const c = client ?? getClient(options);
  const reqBody = { digest, chainId, batchId };
  if (shouldDebug(options)) {
    console.log('[Zipstamp Server API] POST /verify request:', JSON.stringify(reqBody, null, 2));
  }
  const res = await c.verify(reqBody);
  if (shouldDebug(options)) {
    console.log('[Zipstamp Server API] POST /verify response:', JSON.stringify(res, null, 2));
  }

  return {
    success: res.success,
    verified: res.verified,
    digest: res.digest,
    tokenId: res.tokenId,
    contractAddress: res.contractAddress,
    network: res.network,
    chainId: res.chainId,
    transactionHash: res.transactionHash,
    blockNumber: res.blockNumber,
    timestamp: res.timestamp,
    merkleRoot: res.merkleRoot,
    merkleProof: res.merkleProof,
    batchId: res.batchId,
    batchNumber: res.batchNumber,
    status: res.status,
    error: res.error,
  };
}

/**
 * Polls the Zipstamp server for confirmation of a digest.
 * 
 * Continuously checks the Zipstamp server API until the digest is confirmed on the
 * blockchain or the timeout is reached. Uses deadline-aware polling with per-request
 * timeouts to ensure proper exit behavior.
 * 
 * **Use cases:**
 * - Wait for batch confirmation after submitting a digest
 * - Upgrade pending timestamps to confirmed status
 * - Monitor timestamp status in real-time
 * 
 * @param digest - The SHA-256 digest (64-character hex string) to poll for
 * @param chainId - Optional chain ID hint
 * @param batchId - Optional batch ID hint to help server disambiguate
 * @param timeout - Maximum time to poll in milliseconds (default: 300000 = 5 minutes)
 * @param interval - Time between polling attempts in milliseconds (default: 5000 = 5 seconds)
 * @param options - Optional configuration
 * @param options.serverUrl - Zipstamp server URL (defaults to `ZIPSTAMP_SERVER_URL` env var or `https://zipstamp-dev.neozip.io`)
 * @param options.debug - Enable debug logging (defaults to `false`)
 * @returns Promise resolving to verification response if confirmed, or `null` if timeout reached
 * 
 * @example
 * ```typescript
 * // Submit digest
 * const submitResponse = await submitDigest(digest, email);
 * 
 * // Poll until confirmed (or 5 minutes timeout)
 * const confirmed = await pollForConfirmation(
 *   digest,
 *   undefined, // chainId
 *   submitResponse.batchId,
 *   300000, // 5 minutes
 *   5000,   // Check every 5 seconds
 *   { debug: true }
 * );
 * 
 * if (confirmed && confirmed.verified) {
 *   console.log('✅ Confirmed! Transaction:', confirmed.transactionHash);
 * } else {
 *   console.log('⏰ Timeout - batch not yet confirmed');
 * }
 * ```
 */
export async function pollForConfirmation(
  digest: string,
  chainId?: number,
  batchId?: string,
  timeout: number = 300000, // 5 minutes default
  interval: number = 5000, // 5 seconds default
  options?: ZipstampServerHelperOptions
): Promise<VerifyDigestResponse | null> {
  const serverUrl = getZipStampServerUrl(options);
  let attempts = 0;

  const startTime = Date.now();
  const deadline = startTime + timeout;

  while (true) {
    const now = Date.now();
    const remaining = deadline - now;
    if (remaining <= 0) {
      break;
    }

    attempts++;
    const elapsed = now - startTime;
    if (shouldDebug(options)) {
      console.log(`[Zipstamp Server API] pollForConfirmation attempt=${attempts} elapsedMs=${elapsed} remainingMs=${remaining}`);
    }
    try {
      // Ensure a single /verify call cannot exceed the overall poll timeout.
      // Also disable retries during polling so the deadline is honored.
      const perRequestTimeoutMs = Math.max(1000, Math.min(30000, remaining));
      const client = new ZipstampServerClient({
        serverUrl,
        timeout: perRequestTimeoutMs,
        retries: 0,
        retryDelay: 0,
      });

      const result = await verifyDigest(digest, chainId, batchId, client, options);
      
      // Confirmed if we have an on-chain tx hash (or server explicitly says confirmed).
      if (
        result.success &&
        (result.status === 'confirmed' || (result.verified && !!result.transactionHash))
      ) {
        return result;
      }

      // If the server returned a non-successful response, surface it immediately.
      if (!result.success) {
        return result;
      }

      // Pending: wait and retry, but never sleep past the deadline.
      if (result.status === 'pending' || !result.transactionHash) {
        const sleepMs = Math.min(interval, Math.max(0, deadline - Date.now()));
        if (sleepMs <= 0) break;
        await new Promise(resolve => setTimeout(resolve, sleepMs));
        continue;
      }

      // If verified but no transaction hash, return anyway
      return result;
    } catch (error) {
      if (shouldDebug(options)) {
        console.log(`[Zipstamp Server API] pollForConfirmation verify error: ${error instanceof Error ? error.message : String(error)}`);
      }
      // On error, wait and retry
      const sleepMs = Math.min(interval, Math.max(0, deadline - Date.now()));
      if (sleepMs <= 0) break;
      await new Promise(resolve => setTimeout(resolve, sleepMs));
    }
  }

  // Timeout reached
  return null;
}

/**
 * Prepares mint data for NFT proof token minting.
 * 
 * Retrieves all data needed to call `mintProof()` on the TimestampProofNFT contract.
 * This includes the merkle proof, batch information, contract addresses, and minting fee.
 * 
 * **Use this before minting an NFT:**
 * 1. Call `prepareMint()` to get mint data
 * 2. Check `mintData.mintFeeWei` to ensure user has enough ETH
 * 3. Call `mintProof(digest, merkleProof, batchMerkleRoot)` on the contract with the returned data
 * 
 * @param digest - The SHA-256 digest (64-character hex string) to prepare mint data for
 * @param chainId - Optional chain ID hint
 * @param batchId - Optional batch ID from TIMESTAMP.NZIP metadata to ensure the correct batch is used
 * @param options - Optional configuration
 * @param options.serverUrl - Zipstamp server URL (defaults to `ZIPSTAMP_SERVER_URL` env var or `https://zipstamp-dev.neozip.io`)
 * @param options.debug - Enable debug logging (defaults to `false`)
 * @returns Promise resolving to mint data response containing all parameters needed for contract call
 * 
 * @example
 * ```typescript
 * const mintData = await prepareMint(
 *   digest,
 *   84532, // Base Sepolia
 *   'base-sep-v0.90-n7'
 * );
 * 
 * if (mintData.success && mintData.mintData) {
 *   const { digest, merkleProof, batchMerkleRoot, mintFeeWei, nftContractAddress } = mintData.mintData;
 *   
 *   // Call contract
 *   const tx = await contract.mintProof(digest, merkleProof, batchMerkleRoot, {
 *     value: mintFeeWei
 *   });
 *   await tx.wait();
 * }
 * ```
 */
export async function prepareMint(
  digest: string,
  chainId?: number,
  batchId?: string,
  options?: ZipstampServerHelperOptions
): Promise<PrepareMintResponse> {
  const client = getClient(options);
  return client.prepareMint(digest, chainId, batchId);
}

/**
 * Checks if a digest has already been minted as an NFT proof token.
 * 
 * Queries the Zipstamp server to determine if a digest has been minted as an NFT
 * on the TimestampProofNFT contract. Returns token information if minted, including
 * token ID, owner, and proof data.
 * 
 * @param digest - The SHA-256 digest (64-character hex string) to check
 * @param chainId - Optional chain ID hint
 * @param options - Optional configuration
 * @param options.serverUrl - Zipstamp server URL (defaults to `ZIPSTAMP_SERVER_URL` env var or `https://zipstamp-dev.neozip.io`)
 * @param options.debug - Enable debug logging (defaults to `false`)
 * @returns Promise resolving to NFT status response indicating if minted and token details
 * 
 * @example
 * ```typescript
 * const status = await checkNFTStatus(digest, 84532);
 * 
 * if (status.isMinted) {
 *   console.log('✅ Already minted as NFT');
 *   console.log('Token ID:', status.tokenId);
 *   console.log('Owner:', status.owner);
 * } else {
 *   console.log('Not yet minted - can proceed with minting');
 * }
 * ```
 */
export async function checkNFTStatus(
  digest: string,
  chainId?: number,
  options?: ZipstampServerHelperOptions
): Promise<NFTStatusResponse> {
  const client = getClient(options);
  return client.checkNFTStatus(digest, chainId);
}

/**
 * Retrieves NFT contract information from the Zipstamp server.
 * 
 * Gets details about the TimestampProofNFT contract for a given network,
 * including contract address, registry address, minting fee, and version.
 * 
 * @param chainId - Optional chain ID hint (if not provided, server uses default network)
 * @param options - Optional configuration
 * @param options.serverUrl - Zipstamp server URL (defaults to `ZIPSTAMP_SERVER_URL` env var or `https://zipstamp-dev.neozip.io`)
 * @param options.debug - Enable debug logging (defaults to `false`)
 * @returns Promise resolving to contract information response
 * 
 * @example
 * ```typescript
 * const info = await getNFTContractInfo(84532); // Base Sepolia
 * 
 * if (info.success) {
 *   console.log('NFT Contract:', info.contractAddress);
 *   console.log('Registry:', info.registryAddress);
 *   console.log('Mint Fee:', info.mintFee, 'ETH');
 *   console.log('Version:', info.contractVersion);
 * }
 * ```
 */
export async function getNFTContractInfo(
  chainId?: number,
  options?: ZipstampServerHelperOptions
): Promise<NFTContractInfoResponse> {
  const client = getClient(options);
  return client.getNFTContractInfo(chainId);
}

// ============================================================================
// Authentication Helper Functions
// ============================================================================

import type {
  RegisterResponse,
  VerifyEmailResponse,
  CalendarIdentity,
  HealthCheckResponse,
} from './ZipstampServerClient';

// Re-export auth types from ZipstampServerClient
export type {
  RegisterRequest,
  RegisterResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
  CalendarIdentity,
  CalendarChainInfo,
  HealthCheckResponse,
  ComponentHealth,
} from './ZipstampServerClient';

/**
 * Register an email address with a calendar server.
 * 
 * This is the first step of the authentication flow. After calling this,
 * the user will receive an email with a verification code. Use `verifyEmailCode`
 * to complete registration.
 * 
 * PUBLIC: No API key required.
 * 
 * @param email - Email address to register
 * @param options - Optional configuration
 * @param options.serverUrl - Zipstamp server URL
 * @returns Promise resolving to registration response
 * 
 * @example
 * ```typescript
 * const result = await registerEmail('user@example.com', {
 *   serverUrl: 'https://calendar.neozip.io'
 * });
 * 
 * if (result.success) {
 *   console.log('Check your email for the verification code');
 * }
 * ```
 */
export async function registerEmail(
  email: string,
  options?: ZipstampServerHelperOptions
): Promise<RegisterResponse> {
  const client = getClient(options);
  if (shouldDebug(options)) {
    console.log('[Zipstamp Server API] POST /auth/register request:', { email });
  }
  const result = await client.register({ email });
  if (shouldDebug(options)) {
    console.log('[Zipstamp Server API] POST /auth/register response:', JSON.stringify(result, null, 2));
  }
  return result;
}

/**
 * Verify email with code.
 * 
 * This is the second step of the authentication flow. After calling `registerEmail`,
 * the user receives a verification code via email. Submit that code here to complete
 * registration. After verification, the user can submit digests by including their
 * email in stamp requests.
 * 
 * PUBLIC: No API key required.
 * 
 * @param email - Email address that was registered
 * @param code - Verification code from email
 * @param options - Optional configuration
 * @param options.serverUrl - Zipstamp server URL
 * @returns Promise resolving to verification response
 */
export async function verifyEmailCode(
  email: string,
  code: string,
  options?: ZipstampServerHelperOptions
): Promise<VerifyEmailResponse> {
  const client = getClient(options);
  if (shouldDebug(options)) {
    console.log('[Zipstamp Server API] POST /auth/verify request:', { email, code: '***' });
  }
  const result = await client.verifyEmail({ email, code });
  if (shouldDebug(options)) {
    console.log('[Zipstamp Server API] POST /auth/verify response:', JSON.stringify(result, null, 2));
  }
  return result;
}

/**
 * Get calendar server identity and capabilities.
 * 
 * Returns information about the calendar server including its unique ID,
 * supported chains, capabilities, and current status.
 * 
 * PUBLIC: No API key required.
 * 
 * @param options - Optional configuration
 * @param options.serverUrl - Zipstamp server URL
 * @returns Promise resolving to calendar identity information
 * 
 * @example
 * ```typescript
 * const calendar = await getCalendarIdentity({
 *   serverUrl: 'https://calendar.neozip.io'
 * });
 * 
 * console.log('Calendar ID:', calendar.id);
 * console.log('Status:', calendar.status);
 * console.log('Chains:', calendar.chains.map(c => c.network).join(', '));
 * ```
 */
export async function getCalendarIdentity(
  options?: ZipstampServerHelperOptions
): Promise<CalendarIdentity> {
  const client = getClient(options);
  if (shouldDebug(options)) {
    console.log('[Zipstamp Server API] GET /calendar');
  }
  const result = await client.getCalendar();
  if (shouldDebug(options)) {
    console.log('[Zipstamp Server API] GET /calendar response:', JSON.stringify(result, null, 2));
  }
  return result;
}

/**
 * Check health of a calendar server.
 * 
 * Returns the current health status of the calendar server.
 * Use this to check if a server is available before submitting timestamps.
 * 
 * PUBLIC: No API key required.
 * 
 * @param options - Optional configuration
 * @param options.serverUrl - Zipstamp server URL
 * @param full - If true, returns detailed component health (default: false)
 * @returns Promise resolving to health check response
 * 
 * @example
 * ```typescript
 * const health = await checkCalendarHealth({
 *   serverUrl: 'https://calendar.neozip.io'
 * });
 * 
 * if (health.status === 'healthy') {
 *   console.log('Calendar is available');
 * } else {
 *   console.log('Calendar status:', health.status);
 * }
 * ```
 */
export async function checkCalendarHealth(
  options?: ZipstampServerHelperOptions,
  full: boolean = false
): Promise<HealthCheckResponse> {
  const client = getClient(options);
  const endpoint = full ? '/health/full' : '/health';
  if (shouldDebug(options)) {
    console.log(`[Zipstamp Server API] GET ${endpoint}`);
  }
  const result = full ? await client.healthCheckFull() : await client.healthCheck();
  if (shouldDebug(options)) {
    console.log(`[Zipstamp Server API] GET ${endpoint} response:`, JSON.stringify(result, null, 2));
  }
  return result;
}
