# Token Server API Update Plan

> **Note:** The codebase now uses a single server module: `src/zipstamp-server`. The former `src/token-server` has been removed; all callers use the Zipstamp server API. This document is kept for historical context.

This plan updates the `neozip-blockchain` library to support the new token-server APIs for authentication, calendar discovery, and multi-calendar redundancy.

## Background

The token-server has been updated with:
- **Email-based authentication** with API keys for stamping operations
- **Calendar identity & discovery** for server identification
- **Public verification endpoints** - no API key required to verify
- **Health monitoring** for calendar availability checks

**Key Principle**: Verification must remain public (anyone can verify a timestamp), while only stamping (creating timestamps) requires authentication.

---

## Phase 1: API Key Authentication Support

Update `TokenServerClient` to support API key authentication for protected endpoints.

### 1.1 Update TokenServerClient Options

**File**: `src/token-server/TokenServerClient.ts`

Add API key support to the client:

```typescript
export interface TokenServerOptions {
  serverUrl?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  apiKey?: string;  // NEW: API key for authenticated requests
}
```

Update the `request` method to include API key in headers when provided:

```typescript
private async request<T>(method: string, path: string, body?: any): Promise<T> {
  // ... existing code ...
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Add API key header if configured
  if (this.apiKey) {
    headers['X-API-Key'] = this.apiKey;
  }
  // ... rest of method
}
```

### 1.2 Update TokenServerHelperOptions

**File**: `src/token-server/TokenServerHelpers.ts`

```typescript
export interface TokenServerHelperOptions {
  serverUrl?: string;
  debug?: boolean;
  apiKey?: string;  // NEW: API key for authenticated requests
}
```

Update `getClient()` helper to pass API key:

```typescript
function getClient(options?: TokenServerHelperOptions): TokenServerClient {
  return new TokenServerClient({ 
    serverUrl: getTokenServerUrl(options),
    apiKey: options?.apiKey,
  });
}
```

### 1.3 Environment Variable Support

Support `NEOZIP_API_KEY` environment variable as default:

```typescript
function getApiKey(options?: TokenServerHelperOptions): string | undefined {
  return options?.apiKey || process.env.NEOZIP_API_KEY || undefined;
}
```

---

## Phase 2: Authentication Flow (Register/Verify)

Add methods for the user registration and API key management flow.

### 2.1 Add Auth Types

**File**: `src/token-server/TokenServerClient.ts`

```typescript
// === Authentication Types ===

export interface RegisterRequest {
  email: string;
}

export interface RegisterResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

export interface VerifyEmailResponse {
  success: boolean;
  apiKey?: string;      // First API key (only shown once!)
  keyPrefix?: string;   // e.g., "nz_abc123"
  message?: string;
  error?: string;
}

export interface ApiKeyInfo {
  id: number;
  keyPrefix: string;
  name?: string;
  permissions: string[];
  rateLimit: number;
  isActive: boolean;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

export interface ListApiKeysResponse {
  success: boolean;
  keys?: ApiKeyInfo[];
  error?: string;
}

export interface CreateApiKeyRequest {
  name?: string;
  permissions?: string[];
}

export interface CreateApiKeyResponse {
  success: boolean;
  apiKey?: string;      // Full key (only shown once!)
  keyPrefix?: string;
  id?: number;
  error?: string;
}

export interface RevokeApiKeyResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface UsageStats {
  totalRequests: number;
  requestsThisHour: number;
  rateLimit: number;
  rateLimitRemaining: number;
  endpoints: Record<string, number>;
}

export interface GetUsageResponse {
  success: boolean;
  usage?: UsageStats;
  error?: string;
}
```

### 2.2 Add Auth Methods to TokenServerClient

```typescript
// === Authentication Methods ===

/**
 * Request email verification (first step of registration).
 * Sends a verification code to the provided email address.
 */
async register(request: RegisterRequest): Promise<RegisterResponse> {
  return this.request<RegisterResponse>('POST', '/auth/register', request);
}

/**
 * Verify email with code and receive first API key.
 * The API key is only shown ONCE - user must save it!
 */
async verifyEmail(request: VerifyEmailRequest): Promise<VerifyEmailResponse> {
  return this.request<VerifyEmailResponse>('POST', '/auth/verify', request);
}

/**
 * List all API keys for the authenticated user.
 * Requires valid API key in headers.
 */
async listApiKeys(): Promise<ListApiKeysResponse> {
  return this.request<ListApiKeysResponse>('GET', '/auth/keys');
}

/**
 * Create a new API key.
 * Requires valid API key in headers.
 * The new key is only shown ONCE!
 */
async createApiKey(request?: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
  return this.request<CreateApiKeyResponse>('POST', '/auth/keys', request || {});
}

/**
 * Revoke an API key by ID.
 * Requires valid API key in headers.
 */
async revokeApiKey(keyId: number): Promise<RevokeApiKeyResponse> {
  return this.request<RevokeApiKeyResponse>('DELETE', `/auth/keys/${keyId}`);
}

/**
 * Get usage statistics for the authenticated user.
 * Requires valid API key in headers.
 */
async getUsage(): Promise<GetUsageResponse> {
  return this.request<GetUsageResponse>('GET', '/auth/usage');
}
```

### 2.3 Add Auth Helper Functions

**File**: `src/token-server/TokenServerHelpers.ts`

```typescript
/**
 * Register an email address with a calendar server.
 * This sends a verification code to the email.
 */
export async function registerEmail(
  email: string,
  options?: TokenServerHelperOptions
): Promise<RegisterResponse> {
  const client = getClient(options);
  return client.register({ email });
}

/**
 * Verify email and get first API key.
 * IMPORTANT: The API key is only shown ONCE - user must save it!
 */
export async function verifyEmailCode(
  email: string,
  code: string,
  options?: TokenServerHelperOptions
): Promise<VerifyEmailResponse> {
  const client = getClient(options);
  return client.verifyEmail({ email, code });
}
```

---

## Phase 3: Calendar Discovery

Add support for discovering calendar server identity and capabilities.

### 3.1 Add Calendar Types

**File**: `src/token-server/TokenServerClient.ts`

```typescript
// === Calendar Discovery Types ===

export interface CalendarIdentity {
  id: string;              // Unique calendar identifier (e.g., "neozip-alpha")
  uri: string;             // Base URI of this calendar
  version: string;         // Server version
  donationAddress?: string;
  chains: CalendarChainInfo[];
  capabilities: string[];  // e.g., ['stamp', 'verify', 'nft']
  status: 'healthy' | 'degraded' | 'maintenance';
}

export interface CalendarChainInfo {
  chainId: number;
  network: string;
  contractAddress: string;
  registryAddress?: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks?: {
    database?: { status: string; latencyMs?: number };
    scheduler?: { status: string; isRunning?: boolean };
    chains?: Record<string, { status: string; blockNumber?: number }>;
  };
}
```

### 3.2 Add Calendar Discovery Methods

```typescript
/**
 * Get calendar server identity and capabilities.
 * Public endpoint - no API key required.
 */
async getCalendar(): Promise<CalendarIdentity> {
  return this.request<CalendarIdentity>('GET', '/calendar');
}

/**
 * Get calendar discovery document (standard format).
 * Public endpoint - no API key required.
 */
async getCalendarDiscovery(): Promise<CalendarIdentity> {
  return this.request<CalendarIdentity>('GET', '/.well-known/calendar.json');
}

/**
 * Quick health check.
 * Public endpoint - no API key required.
 */
async healthCheck(): Promise<HealthCheckResponse> {
  return this.request<HealthCheckResponse>('GET', '/health');
}

/**
 * Comprehensive health check with all component statuses.
 * Public endpoint - no API key required.
 */
async healthCheckFull(): Promise<HealthCheckResponse> {
  return this.request<HealthCheckResponse>('GET', '/health/full');
}
```

---

## Phase 4: Multi-Calendar Support

Add utilities for working with multiple calendar servers for redundancy.

### 4.1 Create CalendarManager Class

**File**: `src/token-server/CalendarManager.ts` (NEW)

```typescript
/**
 * CalendarManager - Multi-calendar support for redundancy
 * 
 * Similar to OpenTimestamps' approach of submitting to multiple calendars,
 * this class manages multiple token-server calendars for reliability.
 */

import { TokenServerClient, type CalendarIdentity, type HealthCheckResponse } from './TokenServerClient';

export interface CalendarConfig {
  url: string;
  apiKey?: string;
  priority?: number;  // Lower = higher priority
}

export interface CalendarStatus {
  url: string;
  identity?: CalendarIdentity;
  health?: HealthCheckResponse;
  lastChecked: Date;
  available: boolean;
  latencyMs?: number;
}

export class CalendarManager {
  private calendars: CalendarConfig[] = [];
  private statusCache: Map<string, CalendarStatus> = new Map();
  
  constructor(calendars?: CalendarConfig[]) {
    if (calendars) {
      this.calendars = [...calendars].sort((a, b) => 
        (a.priority ?? 100) - (b.priority ?? 100)
      );
    }
  }
  
  /**
   * Add a calendar server.
   */
  addCalendar(config: CalendarConfig): void {
    this.calendars.push(config);
    this.calendars.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }
  
  /**
   * Get all configured calendars.
   */
  getCalendars(): CalendarConfig[] {
    return [...this.calendars];
  }
  
  /**
   * Check health of all calendars and update status cache.
   */
  async checkAllHealth(): Promise<CalendarStatus[]> {
    const results = await Promise.all(
      this.calendars.map(cal => this.checkHealth(cal.url))
    );
    return results;
  }
  
  /**
   * Check health of a specific calendar.
   */
  async checkHealth(url: string): Promise<CalendarStatus> {
    const start = Date.now();
    const config = this.calendars.find(c => c.url === url);
    const client = new TokenServerClient({ serverUrl: url, apiKey: config?.apiKey });
    
    try {
      const [identity, health] = await Promise.all([
        client.getCalendar().catch(() => undefined),
        client.healthCheck().catch(() => undefined),
      ]);
      
      const status: CalendarStatus = {
        url,
        identity,
        health,
        lastChecked: new Date(),
        available: health?.status === 'healthy' || health?.status === 'degraded',
        latencyMs: Date.now() - start,
      };
      
      this.statusCache.set(url, status);
      return status;
    } catch {
      const status: CalendarStatus = {
        url,
        lastChecked: new Date(),
        available: false,
        latencyMs: Date.now() - start,
      };
      this.statusCache.set(url, status);
      return status;
    }
  }
  
  /**
   * Get healthy calendars sorted by priority and latency.
   */
  getHealthyCalendars(): CalendarConfig[] {
    return this.calendars.filter(cal => {
      const status = this.statusCache.get(cal.url);
      return status?.available ?? true; // Assume available if not checked
    });
  }
  
  /**
   * Submit digest to multiple calendars for redundancy.
   * Returns results from all successful submissions.
   */
  async submitToMultiple(
    digest: string,
    chainId?: number,
    email?: string,
    options?: { minSuccess?: number; timeout?: number }
  ): Promise<{ successes: any[]; failures: any[] }> {
    const healthy = this.getHealthyCalendars();
    const minSuccess = options?.minSuccess ?? 1;
    
    const results = await Promise.allSettled(
      healthy.map(async cal => {
        const client = new TokenServerClient({ 
          serverUrl: cal.url, 
          apiKey: cal.apiKey,
          timeout: options?.timeout,
        });
        const result = await client.stamp({ digest, chainId, email });
        return { calendar: cal.url, result };
      })
    );
    
    const successes = results
      .filter((r): r is PromiseFulfilledResult<any> => 
        r.status === 'fulfilled' && r.value.result.success)
      .map(r => r.value);
    
    const failures = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => ({ error: r.reason }));
    
    if (successes.length < minSuccess) {
      throw new Error(
        `Failed to submit to minimum ${minSuccess} calendars. ` +
        `Successes: ${successes.length}, Failures: ${failures.length}`
      );
    }
    
    return { successes, failures };
  }
  
  /**
   * Verify digest by trying calendars until one succeeds.
   * Verification is public - no API key needed.
   */
  async verifyFromAny(
    digest: string,
    chainId?: number,
    batchId?: string
  ): Promise<any> {
    const healthy = this.getHealthyCalendars();
    
    for (const cal of healthy) {
      try {
        const client = new TokenServerClient({ serverUrl: cal.url });
        const result = await client.verify({ digest, chainId, batchId });
        if (result.success && result.verified) {
          return { calendar: cal.url, result };
        }
      } catch {
        // Try next calendar
      }
    }
    
    throw new Error('Failed to verify from any calendar');
  }
}
```

---

## Phase 5: Update Helper Functions

Update existing helper functions to support new options.

### 5.1 Update submitDigest

**File**: `src/token-server/TokenServerHelpers.ts`

```typescript
/**
 * Submits a digest to the token-server for timestamping.
 * 
 * NOTE: Stamping now requires an API key. Set via:
 * - options.apiKey parameter
 * - NEOZIP_API_KEY environment variable
 */
export async function submitDigest(
  digest: string,
  email?: string,
  chainId?: number,
  options?: TokenServerHelperOptions
): Promise<SubmitDigestResponse> {
  const apiKey = getApiKey(options);
  
  if (!apiKey) {
    console.warn('[Token Server] Warning: No API key provided. Stamping may fail.');
    console.warn('[Token Server] Set NEOZIP_API_KEY environment variable or pass options.apiKey');
  }
  
  const c = getClient({ ...options, apiKey });
  // ... rest of function
}
```

### 5.2 Document Public vs Protected Endpoints

Add clear documentation showing which endpoints are public vs protected:

```typescript
// PUBLIC ENDPOINTS (no API key required):
// - POST /verify - Verify a digest
// - GET /status - Get batch status  
// - GET /batch/:batchId - Get batch details
// - POST /verify-proof - Blockchain verification
// - GET /nft/status - Check NFT status
// - GET /nft/contract-info - Get contract info
// - GET /calendar - Calendar identity
// - GET /health - Health check

// PROTECTED ENDPOINTS (API key required):
// - POST /stamp - Submit digest (requires 'stamp' permission)
// - GET /nft/prepare-mint - Prepare NFT mint (requires 'nft' permission)
// - POST /auth/keys - Create API key (requires existing key)
// - DELETE /auth/keys/:id - Revoke API key (requires existing key)
// - GET /auth/usage - Usage stats (requires existing key)
```

---

## Phase 6: Export Updates

Update the module exports.

### 6.1 Update Index Exports

**File**: `src/token-server/index.ts`

```typescript
// Add new exports
export {
  // ... existing exports ...
  
  // Auth types
  type RegisterRequest,
  type RegisterResponse,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
  type ApiKeyInfo,
  type ListApiKeysResponse,
  type CreateApiKeyRequest,
  type CreateApiKeyResponse,
  type RevokeApiKeyResponse,
  type UsageStats,
  type GetUsageResponse,
  
  // Calendar types
  type CalendarIdentity,
  type CalendarChainInfo,
  type HealthCheckResponse,
} from './TokenServerClient';

// Auth helper functions
export {
  registerEmail,
  verifyEmailCode,
} from './TokenServerHelpers';

// Multi-calendar support
export {
  CalendarManager,
  type CalendarConfig,
  type CalendarStatus,
} from './CalendarManager';
```

---

## Phase 7: Update Examples

Update example scripts to demonstrate new features.

### 7.1 Create Auth Example

**File**: `examples/token-server-auth.ts` (NEW)

Demonstrate the registration and API key flow:
- Register email
- Verify with code
- Save API key
- Use API key for stamping

### 7.2 Create Multi-Calendar Example

**File**: `examples/multi-calendar-stamp.ts` (NEW)

Demonstrate multi-calendar stamping:
- Configure multiple calendars
- Check health
- Submit to multiple for redundancy
- Handle partial failures

### 7.3 Update Existing Examples

Update `stamp-zip.ts` and others to:
- Accept `--api-key` option
- Warn if no API key for stamping
- Show that verification works without API key

---

## Phase 8: Testing

### 8.1 Unit Tests

**File**: `tests/unit/token-server-auth.test.ts` (NEW)

Test authentication methods:
- Register request format
- Verify email request format
- API key header injection
- Error handling

### 8.2 Integration Tests

**File**: `tests/integration/calendar-manager.test.ts` (NEW)

Test multi-calendar functionality:
- Health checking
- Failover behavior
- Multiple submissions

---

## Implementation Order

1. **Phase 1**: API key support in client (foundation)
2. **Phase 2**: Auth flow methods
3. **Phase 3**: Calendar discovery
4. **Phase 4**: CalendarManager class
5. **Phase 5**: Update helper functions
6. **Phase 6**: Export updates
7. **Phase 7**: Examples
8. **Phase 8**: Tests

## Notes

- **Backward Compatibility**: All changes should be backward compatible. Existing code that doesn't use API keys will continue to work for verification (now public).
- **Environment Variables**: Support `NEOZIP_API_KEY` as the standard environment variable.
- **Error Messages**: Provide clear error messages when API key is missing for protected endpoints.
- **Documentation**: Update README with authentication flow and multi-calendar examples.
