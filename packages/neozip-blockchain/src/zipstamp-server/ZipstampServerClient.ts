/**
 * Zipstamp Server API Client
 * 
 * Client for interacting with the Zipstamp server API endpoints.
 * Provides methods for timestamping, verification, batch processing, and token transfers.
 * 
 * **Authentication:**
 * - Verification endpoints are PUBLIC (no API key required)
 * - Stamping requires a verified email in the request body (no API key)
 * 
 * @example
 * ```typescript
 * const client = new ZipstampServerClient({ serverUrl: 'https://calendar.neozip.io' });
 * const result = await client.verify({ digest: '...' });
 * const stamp = await client.stamp({ digest: '...', email: 'user@example.com' });
 * ```
 */

import { getZipStampServerUrl } from '../constants/servers';

export interface ZipstampServerOptions {
  serverUrl?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

// ============================================================================
// Authentication Types
// ============================================================================

/** Request to register an email for verification */
export interface RegisterRequest {
  email: string;
}

/** Response from email registration */
export interface RegisterResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/** Request to verify email with code */
export interface VerifyEmailRequest {
  email: string;
  code: string;
}

/** Response from email verification */
export interface VerifyEmailResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// Calendar Discovery Types
// ============================================================================

/** Information about a chain supported by the calendar */
export interface CalendarChainInfo {
  chainId: number;
  network: string;
  contractAddress: string;
  registryAddress?: string;
}

/** Calendar server identity and capabilities */
export interface CalendarIdentity {
  /** Unique calendar identifier (e.g., "neozip-alpha") */
  id: string;
  /** Base URI of this calendar */
  uri: string;
  /** Server version */
  version: string;
  /** Optional donation address */
  donationAddress?: string;
  /** Supported blockchain chains */
  chains: CalendarChainInfo[];
  /** Server capabilities (e.g., ['stamp', 'verify', 'nft']) */
  capabilities: string[];
  /** Current server status */
  status: 'healthy' | 'degraded' | 'maintenance';
}

/** Component health check result */
export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
}

/** Health check response */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version?: string;
  checks?: {
    database?: ComponentHealth;
    scheduler?: ComponentHealth & { isRunning?: boolean };
    coordination?: ComponentHealth;
    auth?: ComponentHealth;
    chains?: Record<string, ComponentHealth & { blockNumber?: number; walletBalance?: string }>;
  };
}

export interface StampRequest {
  digest: string; // 64-character hex string (SHA-256)
  /**
   * Optional chainId hint. Some Zipstamp server deployments accept this to select network.
   */
  chainId?: number;
  /**
   * Email address associated with this stamp request.
   * (Zipstamp server API expects `email`.)
   */
  email?: string;
  /**
   * Backward-compat alias (older clients used `recipientEmail`).
   */
  recipientEmail?: string;
  /**
   * Backward-compat (some older clients used `mode`/metadata/etc).
   * Current Zipstamp server API ignores these, but we MUST NOT send unknown keys
   * to strict request validators. These are kept only to avoid breaking callers,
   * and will be stripped before sending.
   */
  mode?: 'immediate' | 'batched' | 'transferable';
  recipientAddress?: string;
  metadata?: {
    filename?: string;
    fileSize?: number;
    fileCount?: number;
  };
}

export interface StampResponse {
  success: boolean;
  digest: string;
  tokenId?: string;
  transactionHash?: string;
  contractAddress?: string;
  network?: string;
  chainId?: number;
  status: 'pending' | 'minting' | 'confirmed';
  estimatedConfirmationTime?: number;
  batchId?: string;
  batchNumber?: number;
  error?: string;
}

export interface VerifyRequest {
  digest: string;
  /**
   * Optional chainId hint. Some Zipstamp server deployments accept this to select network.
   */
  chainId?: number;
  /**
   * Optional batchId hint to help the server disambiguate duplicates.
   */
  batchId?: string;
  /**
   * Backward-compat (older clients used tokenId-based verification).
   * Zipstamp server API does not accept this field on POST /verify.
   */
  tokenId?: string;
}

export interface VerifyResponse {
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
  owner?: string;
  merkleRoot?: string;
  merkleProof?: string[];
  batchId?: string;
  batchNumber?: number;
  status?: 'pending' | 'confirmed';
  error?: string;
}

export interface BatchQueueRequest {
  digest: string;
  metadata?: {
    filename?: string;
    fileSize?: number;
    fileCount?: number;
  };
}

export interface BatchQueueResponse {
  success: boolean;
  digest: string;
  batchId?: string;
  message?: string;
  error?: string;
}

export interface BatchStatusResponse {
  success: boolean;
  batch?: {
    id: string;
    merkleRoot: string;
    tokenId?: string;
    status: 'pending' | 'processing' | 'completed';
    hashCount: number;
    createdAt: string | Date;
    processedAt?: string | Date;
    transactionHash?: string;
    contractAddress?: string;
    network?: string;
  };
  hashes?: Array<{
    id: string;
    merkleRoot: string;
    tokenId?: string;
    merkleProof?: string[];
    filename: string;
    createdAt: string | Date;
  }>;
  error?: string;
}

export interface TransferRequest {
  tokenId?: string;
  digest?: string;
  recipientAddress: string;
}

export interface TransferResponse {
  success: boolean;
  tokenId?: string;
  transactionHash?: string;
  status?: 'pending' | 'completed' | 'failed';
  error?: string;
}

export interface CalendarInfo {
  uri: string;
  donationAddress?: string;
  version: string;
  network: string;
  contractAddress: string;
}

export interface ServerStatus {
  status: string;
  network: string;
  contractAddress: string;
  serverWallet: string;
  balance: string;
  timestamp: string;
}

// ============================================================================
// NFT Proof Minting (Zipstamp server /nft/* endpoints)
// ============================================================================

export interface PrepareMintResponse {
  success: boolean;
  mintData?: {
    // Contract call parameters for mintProof(digest, proof[], merkleRoot)
    digest: string; // bytes32
    merkleProof: string[]; // bytes32[]
    batchMerkleRoot: string; // bytes32

    // Contract addresses
    nftContractAddress: string;
    registryAddress: string;

    // Minting fee
    mintFee: string; // ETH (human readable)
    mintFeeWei: string; // Wei (for transaction)

    // Network info
    chainId: number;
    network: string;
    contractVersion: string;

    // Batch info
    batchId: string;
    batchNumber: number;
    batchTransactionHash: string;
    batchBlockNumber: number;
    batchTimestamp: number;
  };
  error?: string;
}

export interface NFTStatusResponse {
  success: boolean;
  isMinted: boolean;
  tokenId?: string;
  owner?: string;
  proofData?: {
    digest: string;
    batchMerkleRoot: string;
    batchTimestamp: number;
    batchBlockNumber: number;
    mintedAt: number;
    originalOwner: string;
    merkleProof: string[];
  };
  error?: string;
}

export interface NFTContractInfoResponse {
  success: boolean;
  contractAddress?: string;
  registryAddress?: string;
  mintFee?: string;
  mintFeeWei?: string;
  contractVersion?: string;
  totalSupply?: number;
  error?: string;
}

/**
 * Client for interacting with the Zipstamp server API.
 * 
 * Provides low-level methods for all Zipstamp server endpoints including timestamping,
 * verification, batch operations, transfers, and NFT proof minting. This is the
 * base client that higher-level convenience functions (in ZipstampServerHelpers) wrap.
 * 
 * **Features:**
 * - Automatic retry with exponential backoff
 * - Configurable timeouts
 * - Type-safe request/response handling
 * - Support for all Zipstamp server endpoints
 * 
 * @example
 * ```typescript
 * // Create client with custom settings
 * const client = new ZipstampServerClient({
 *   serverUrl: 'https://Zipstamp server.example.com',
 *   timeout: 60000, // 60 seconds
 *   retries: 5,
 *   retryDelay: 2000 // 2 seconds
 * });
 * 
 * // Submit a digest
 * const response = await client.stamp({
 *   digest: 'a1b2c3d4e5f6...',
 *   email: 'user@example.com',
 *   chainId: 84532
 * });
 * ```
 */
export class ZipstampServerClient {
  private serverUrl: string;
  private timeout: number;
  private retries: number;
  private retryDelay: number;

  constructor(options: ZipstampServerOptions = {}) {
    this.serverUrl = getZipStampServerUrl({ serverUrl: options.serverUrl });
    this.timeout = options.timeout || 30000; // 30 seconds
    this.retries = options.retries || 3;
    this.retryDelay = options.retryDelay || 1000; // 1 second
  }

  /**
   * Get the current server URL
   */
  getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Make HTTP request with retry logic
   */
  private async request<T>(
    method: string,
    path: string,
    body?: any
  ): Promise<T> {
    const url = `${this.serverUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        const options: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (body) {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `HTTP ${response.status}: ${response.statusText}`
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on abort (timeout) or if it's the last attempt
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Request timeout after ${this.timeout}ms`);
        }

        if (attempt < this.retries) {
          // Exponential backoff
          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Retrieves calendar server information.
   * 
   * Gets metadata about the Zipstamp server calendar including URI, donation address,
   * version, network, and contract address.
   * 
   * @returns Promise resolving to calendar information
   */
  async getCalendarInfo(): Promise<CalendarInfo> {
    return this.request<CalendarInfo>('GET', '/calendar/info');
  }

  /**
   * Creates a timestamp by submitting a digest to the Zipstamp server.
   * 
   * Submits a SHA-256 digest (merkle root) to be included in the next batch for
   * blockchain timestamping. The digest is typically the merkle root of a ZIP file.
   * 
   * **Note:** Only `digest`, `chainId`, and `email` are sent to the API. Other
   * fields in `StampRequest` are for backward compatibility only.
   * 
   * @param request - Stamp request containing digest and optional metadata
   * @param request.digest - SHA-256 hash as 64-character hex string (required)
   * @param request.chainId - Optional chain ID hint
   * @param request.email - Optional email address for notifications
   * @returns Promise resolving to stamp response with batch information
   * @throws {Error} If request fails or server returns error
   */
  async stamp(request: StampRequest): Promise<StampResponse> {
    // Zipstamp server expects { digest, chainId, email } and rejects unknown fields in strict validators.
    const body = {
      digest: request.digest,
      chainId: request.chainId,
      email: request.email ?? request.recipientEmail,
    };
    return this.request<StampResponse>('POST', '/stamp', body);
  }

  /**
   * Gets the status of a pending stamp by digest.
   * 
   * Queries the Zipstamp server for the current status of a submitted digest,
   * including batch information and confirmation status.
   * 
   * @param digest - SHA-256 digest (64-character hex string) to check
   * @returns Promise resolving to stamp status response
   * @throws {Error} If digest format is invalid or request fails
   */
  async getStampStatus(digest: string): Promise<StampResponse> {
    if (!/^[a-f0-9]{64}$/i.test(digest)) {
      throw new Error('Invalid digest format. Must be a 64-character hex string (SHA-256)');
    }
    return this.request<StampResponse>('GET', `/stamp/${digest}`);
  }

  /**
   * Verifies a timestamp by checking with the Zipstamp server.
   * 
   * Verifies whether a digest has been confirmed on the blockchain. Returns
   * detailed information including transaction hash, block number, and merkle proof
   * if the timestamp is confirmed.
   * 
   * **Note:** Only `digest`, `chainId`, and `batchId` are sent to the API.
   * The `tokenId` field is for backward compatibility only.
   * 
   * @param request - Verify request containing digest and optional hints
   * @param request.digest - SHA-256 digest (64-character hex string) to verify (required)
   * @param request.chainId - Optional chain ID hint
   * @param request.batchId - Optional batch ID hint to help disambiguate
   * @returns Promise resolving to verification response with status and blockchain details
   * @throws {Error} If request fails or server returns error
   */
  async verify(request: VerifyRequest): Promise<VerifyResponse> {
    // Zipstamp server expects { digest, chainId, batchId } and rejects unknown fields in strict validators.
    const body = {
      digest: request.digest,
      chainId: request.chainId,
      batchId: request.batchId,
    };
    return this.request<VerifyResponse>('POST', '/verify', body);
  }

  /**
   * Verifies a Merkle proof directly on-chain via Zipstamp server (no database access).
   * 
   * Performs on-chain verification of a Merkle proof without requiring database
   * access. Useful for verifying proofs from confirmed timestamps that may have
   * been removed from the server's database.
   * 
   * Maps to `POST /verify-proof` endpoint.
   * 
   * @param request - Proof verification request
   * @param request.digest - Leaf digest (64-character hex string, bytes32)
   * @param request.merkleProof - Array of sibling hashes (each 64-character hex string, bytes32)
   * @param request.merkleRoot - Batch Merkle root (64-character hex string, bytes32)
   * @param request.chainId - Chain ID for the network (required)
   * @param request.contractAddress - Optional contract address hint
   * @param request.transactionHash - Optional transaction hash hint
   * @returns Promise resolving to proof verification result
   */
  async verifyProof(request: {
    digest: string;
    merkleProof: string[];
    merkleRoot: string;
    chainId: number;
    contractAddress?: string;
    transactionHash?: string;
  }): Promise<{
    verified: boolean;
    batchNumber?: number;
    timestamp?: number;
    blockNumber?: number;
    network?: string;
    contractAddress?: string;
    error?: string;
  }> {
    return this.request('POST', '/verify-proof', request);
  }

  /**
   * Verifies a timestamp by digest using GET method.
   * 
   * Alternative verification endpoint using HTTP GET instead of POST.
   * Useful for simple verification without needing to construct a request body.
   * 
   * @param digest - SHA-256 digest (64-character hex string) to verify
   * @returns Promise resolving to verification response
   * @throws {Error} If digest format is invalid or request fails
   */
  async verifyByDigest(digest: string): Promise<VerifyResponse> {
    if (!/^[a-f0-9]{64}$/i.test(digest)) {
      throw new Error('Invalid digest format. Must be a 64-character hex string (SHA-256)');
    }
    return this.request<VerifyResponse>('GET', `/verify/${digest}`);
  }

  /**
   * Queues a hash for batch processing.
   * 
   * Adds a digest to the batch queue for later processing. Batches are processed
   * periodically and submitted to the blockchain as a single transaction.
   * 
   * @param request - Batch queue request
   * @param request.digest - SHA-256 digest (64-character hex string) to queue
   * @param request.metadata - Optional metadata about the file being timestamped
   * @returns Promise resolving to batch queue response
   */
  async queueBatch(request: BatchQueueRequest): Promise<BatchQueueResponse> {
    return this.request<BatchQueueResponse>('POST', '/batch/queue', request);
  }

  /**
   * Gets batch status and included hashes.
   * 
   * Retrieves detailed information about a batch including its status, merkle root,
   * transaction hash (if confirmed), and all hashes included in the batch.
   * 
   * @param batchId - The batch ID to query (e.g., 'base-sep-v0.90-n7')
   * @returns Promise resolving to batch status response with batch details and included hashes
   */
  async getBatchStatus(batchId: string): Promise<BatchStatusResponse> {
    return this.request<BatchStatusResponse>('GET', `/batch/${batchId}`);
  }

  /**
   * Manually triggers batch processing (admin endpoint).
   * 
   * Forces the Zipstamp server to process pending batches immediately. This is
   * typically an admin-only operation and may require authentication.
   * 
   * @returns Promise resolving to batch status response
   */
  async processBatch(): Promise<BatchStatusResponse> {
    return this.request<BatchStatusResponse>('POST', '/batch/process', {});
  }

  /**
   * Transfers a token to a user address.
   * 
   * Transfers ownership of a timestamp token (NFT) to another address. Requires
   * either a `tokenId` or `digest` to identify the token.
   * 
   * @param request - Transfer request
   * @param request.tokenId - Token ID to transfer (optional if digest provided)
   * @param request.digest - Digest associated with token (optional if tokenId provided)
   * @param request.recipientAddress - Ethereum address to transfer token to (required)
   * @returns Promise resolving to transfer response with transaction hash
   */
  async transfer(request: TransferRequest): Promise<TransferResponse> {
    return this.request<TransferResponse>('POST', '/transfer', request);
  }

  /**
   * Gets server status and health check information.
   * 
   * Retrieves current server status including network, contract address, server
   * wallet address, balance, and timestamp. Useful for health checks and monitoring.
   * 
   * @returns Promise resolving to server status information
   */
  async getStatus(): Promise<ServerStatus> {
    return this.request<ServerStatus>('GET', '/status');
  }

  /**
   * Gets NFT contract information.
   * 
   * Retrieves details about the TimestampProofNFT contract for a given network,
   * including contract address, registry address, minting fee, version, and total supply.
   * 
   * Maps to `GET /nft/contract-info` endpoint.
   * 
   * @param chainId - Optional chain ID hint (if not provided, server uses default network)
   * @returns Promise resolving to NFT contract information response
   */
  async getNFTContractInfo(chainId?: number): Promise<NFTContractInfoResponse> {
    const qs = new URLSearchParams();
    if (chainId) qs.set('chainId', String(chainId));
    const path = qs.toString() ? `/nft/contract-info?${qs.toString()}` : '/nft/contract-info';
    return this.request<NFTContractInfoResponse>('GET', path);
  }

  /**
   * Checks if a digest has been minted as an NFT-proof token.
   * 
   * Queries the Zipstamp server to determine if a digest has been minted as an NFT
   * on the TimestampProofNFT contract. Returns token information if minted.
   * 
   * Maps to `GET /nft/status` endpoint.
   * 
   * @param digest - SHA-256 digest (64-character hex string) to check
   * @param chainId - Optional chain ID hint
   * @returns Promise resolving to NFT status response indicating if minted and token details
   */
  async checkNFTStatus(digest: string, chainId?: number): Promise<NFTStatusResponse> {
    const qs = new URLSearchParams({ digest });
    if (chainId) qs.set('chainId', String(chainId));
    return this.request<NFTStatusResponse>('GET', `/nft/status?${qs.toString()}`);
  }

  /**
   * Prepares mint data for NFT-proof token minting.
   * 
   * Retrieves all data needed to call `mintProof()` on the TimestampProofNFT contract,
   * including merkle proof, batch information, contract addresses, and minting fee.
   * 
   * Maps to `GET /nft/prepare-mint` endpoint.
   * 
   * @param digest - SHA-256 digest (64-character hex string) to prepare mint data for
   * @param chainId - Optional chain ID hint
   * @param batchId - Optional batch ID from TIMESTAMP.NZIP metadata to ensure correct batch
   * @returns Promise resolving to mint data response containing all parameters for contract call
   */
  async prepareMint(digest: string, chainId?: number, batchId?: string): Promise<PrepareMintResponse> {
    const qs = new URLSearchParams({ digest });
    if (chainId) qs.set('chainId', String(chainId));
    if (batchId) qs.set('batchId', batchId);
    return this.request<PrepareMintResponse>('GET', `/nft/prepare-mint?${qs.toString()}`);
  }

  // ==========================================================================
  // Authentication Methods (email verification only; no API keys)
  // ==========================================================================

  /**
   * Request email verification (first step of registration).
   * 
   * Sends a verification code to the provided email address. The user must
   * then call `verifyEmail` with the code to complete registration.
   * 
   * PUBLIC: No API key required.
   * 
   * @param request - Registration request with email address
   * @returns Promise resolving to registration response
   */
  async register(request: RegisterRequest): Promise<RegisterResponse> {
    return this.request<RegisterResponse>('POST', '/auth/register', request);
  }

  /**
   * Verify email with code.
   * 
   * Completes the registration process. After verification, the user can
   * submit digests by including their email in stamp requests.
   * 
   * PUBLIC: No API key required.
   * 
   * @param request - Verification request with email and code
   * @returns Promise resolving to verification response
   */
  async verifyEmail(request: VerifyEmailRequest): Promise<VerifyEmailResponse> {
    return this.request<VerifyEmailResponse>('POST', '/auth/verify', request);
  }

  // ==========================================================================
  // Calendar Discovery Methods
  // ==========================================================================

  /**
   * Get calendar server identity and capabilities.
   * 
   * Returns information about this calendar server including its unique ID,
   * supported chains, capabilities, and current status.
   * 
   * PUBLIC: No API key required.
   * 
   * @returns Promise resolving to calendar identity information
   */
  async getCalendar(): Promise<CalendarIdentity> {
    return this.request<CalendarIdentity>('GET', '/calendar');
  }

  /**
   * Get calendar discovery document (standard format).
   * 
   * Returns the same information as `getCalendar()` but at the standard
   * `.well-known` location for automated discovery.
   * 
   * PUBLIC: No API key required.
   * 
   * @returns Promise resolving to calendar identity information
   */
  async getCalendarDiscovery(): Promise<CalendarIdentity> {
    return this.request<CalendarIdentity>('GET', '/.well-known/calendar.json');
  }

  /**
   * Quick health check.
   * 
   * Returns basic health status of the calendar server.
   * Use `healthCheckFull()` for detailed component status.
   * 
   * PUBLIC: No API key required.
   * 
   * @returns Promise resolving to health check response
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    return this.request<HealthCheckResponse>('GET', '/health');
  }

  /**
   * Comprehensive health check with all component statuses.
   * 
   * Returns detailed health information including database, scheduler,
   * coordination service, and all configured blockchain chains.
   * 
   * PUBLIC: No API key required.
   * 
   * @returns Promise resolving to detailed health check response
   */
  async healthCheckFull(): Promise<HealthCheckResponse> {
    return this.request<HealthCheckResponse>('GET', '/health/full');
  }
}
