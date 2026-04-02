# Rate Limiting Design for RPC Calls

## Overview

This document proposes a rate limiting implementation for RPC calls in the blockchain verification system. The design addresses DoS protection, RPC provider rate limits, and resource management.

## Design Goals

1. **Prevent DoS attacks** - Limit the number of RPC calls per time window
2. **Respect provider limits** - Avoid hitting RPC provider rate limits
3. **Per-endpoint tracking** - Different RPC providers may have different limits
4. **Exponential backoff** - Automatically retry with increasing delays on rate limit errors
5. **Request queuing** - Queue requests when rate limits are hit instead of failing immediately
6. **Configurable** - Optional and configurable for different use cases
7. **Non-blocking** - Should not significantly impact performance

## Architecture

### Components

1. **RateLimiter** - Core rate limiting utility class
2. **RateLimitConfig** - Configuration interface
3. **RateLimitResult** - Result type for rate limit checks
4. **Integration** - Wrapper functions in ZipkitVerifier

### Rate Limiting Algorithm: Token Bucket

**Why Token Bucket?**
- Simple and efficient
- Allows bursts (important for consensus mode)
- Easy to implement
- Well-understood algorithm

**How it works:**
- Each RPC endpoint has a token bucket
- Tokens are added at a fixed rate (refill rate)
- Each RPC call consumes one token
- If no tokens available, request is queued or delayed
- Bucket has a maximum capacity (burst size)

### Configuration

```typescript
interface RateLimitConfig {
  // Enable/disable rate limiting
  enabled: boolean;
  
  // Per RPC endpoint configuration
  perEndpoint: {
    // Maximum requests per time window
    maxRequests: number;
    // Time window in milliseconds
    windowMs: number;
    // Maximum burst size (bucket capacity)
    burstSize: number;
    // Refill rate (tokens per second)
    refillRate: number;
  };
  
  // Global configuration
  global: {
    // Maximum concurrent requests across all endpoints
    maxConcurrent: number;
    // Maximum queue size
    maxQueueSize: number;
    // Queue timeout (ms)
    queueTimeout: number;
  };
  
  // Exponential backoff configuration
  backoff: {
    // Initial delay (ms)
    initialDelay: number;
    // Maximum delay (ms)
    maxDelay: number;
    // Backoff multiplier
    multiplier: number;
    // Maximum retries
    maxRetries: number;
  };
}
```

### Default Configuration

```typescript
const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  enabled: true,
  perEndpoint: {
    maxRequests: 10,        // 10 requests per window
    windowMs: 1000,         // 1 second window
    burstSize: 5,           // Allow 5 burst requests
    refillRate: 10          // 10 tokens per second
  },
  global: {
    maxConcurrent: 20,      // Max 20 concurrent requests
    maxQueueSize: 100,      // Queue up to 100 requests
    queueTimeout: 30000     // 30 second queue timeout
  },
  backoff: {
    initialDelay: 1000,     // Start with 1 second
    maxDelay: 60000,        // Max 60 seconds
    multiplier: 2,          // Double each retry
    maxRetries: 5           // Max 5 retries
  }
};
```

## Implementation Plan

### Phase 1: Core Rate Limiter Utility

**File**: `src/core/utils/RateLimiter.ts`

**Features:**
- Token bucket implementation
- Per-endpoint tracking
- Request queuing
- Exponential backoff

**Key Methods:**
```typescript
class RateLimiter {
  // Check if request can proceed
  async acquire(rpcUrl: string): Promise<RateLimitResult>;
  
  // Release token after request completes
  release(rpcUrl: string): void;
  
  // Handle rate limit error with backoff
  async handleRateLimitError(rpcUrl: string, error: Error): Promise<void>;
  
  // Get current status
  getStatus(rpcUrl: string): RateLimitStatus;
}
```

### Phase 2: Integration with ZipkitVerifier

**Changes to `ZipkitVerifier.ts`:**

1. **Add rate limiter instance**
   ```typescript
   private rateLimiter?: RateLimiter;
   ```

2. **Wrap RPC calls**
   ```typescript
   private async rateLimitedRpcCall<T>(
     rpcUrl: string,
     operation: () => Promise<T>
   ): Promise<T> {
     if (!this.rateLimiter) {
       return operation();
     }
     
     await this.rateLimiter.acquire(rpcUrl);
     try {
       return await operation();
     } catch (error) {
       if (isRateLimitError(error)) {
         await this.rateLimiter.handleRateLimitError(rpcUrl, error);
         // Retry with backoff
         return this.rateLimitedRpcCall(rpcUrl, operation);
       }
       throw error;
     } finally {
       this.rateLimiter.release(rpcUrl);
     }
   }
   ```

3. **Update RPC call sites**
   - `queryMultipleRPCsWithConsensus()` - Wrap parallel calls
   - `verifyOnChain()` - Wrap single RPC calls
   - `getNetworkConfig()` - Wrap network queries

### Phase 3: Configuration Options

**Add to `VerificationOptions`:**
```typescript
export interface VerificationOptions {
  // ... existing options ...
  
  /**
   * Rate limiting configuration
   * When enabled, limits RPC calls to prevent DoS and respect provider limits
   * Default: enabled with conservative limits
   */
  rateLimit?: {
    enabled?: boolean;
    maxRequestsPerSecond?: number;
    burstSize?: number;
    maxConcurrent?: number;
  };
}
```

### Phase 4: Error Handling

**Rate Limit Error Detection:**
```typescript
function isRateLimitError(error: any): boolean {
  if (!error) return false;
  
  const message = error.message?.toLowerCase() || '';
  const code = error.code;
  
  // Common rate limit indicators
  return (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429') ||
    code === 429 ||
    code === 'RATE_LIMIT_EXCEEDED' ||
    code === 'TOO_MANY_REQUESTS'
  );
}
```

## Usage Examples

### Example 1: Default Rate Limiting (Enabled)

```typescript
const verifier = new ZipkitVerifier({ debug: true });
// Rate limiting enabled by default with conservative limits

const result = await verifier.verifyToken(metadata, merkleRoot, {
  rpcConsensus: true,
  // Rate limiting automatically applied
});
```

### Example 2: Custom Rate Limits

```typescript
const verifier = new ZipkitVerifier({ debug: true });

const result = await verifier.verifyToken(metadata, merkleRoot, {
  rateLimit: {
    enabled: true,
    maxRequestsPerSecond: 5,  // More conservative
    burstSize: 2,              // Smaller burst
    maxConcurrent: 10          // Fewer concurrent requests
  }
});
```

### Example 3: Disable Rate Limiting

```typescript
const verifier = new ZipkitVerifier({ debug: true });

const result = await verifier.verifyToken(metadata, merkleRoot, {
  rateLimit: {
    enabled: false  // Disable for testing or high-performance scenarios
  }
});
```

## Benefits

1. **DoS Protection** - Prevents abuse by limiting request rate
2. **Provider Compliance** - Respects RPC provider rate limits
3. **Resource Management** - Prevents overwhelming the system
4. **Automatic Recovery** - Exponential backoff handles temporary rate limits
5. **Flexibility** - Configurable for different use cases
6. **Non-intrusive** - Can be disabled if needed

## Trade-offs

1. **Performance** - Small overhead for rate limit checks (minimal)
2. **Complexity** - Adds complexity to RPC call handling
3. **Memory** - Per-endpoint tracking uses some memory (minimal)
4. **Latency** - Queued requests may have slight delay (acceptable)

## Testing Strategy

1. **Unit Tests** - Test token bucket algorithm
2. **Integration Tests** - Test with mock RPC endpoints
3. **Load Tests** - Verify rate limiting under load
4. **Error Tests** - Test exponential backoff and error handling

## Future Enhancements

1. **Adaptive Rate Limiting** - Adjust limits based on provider responses
2. **Distributed Rate Limiting** - For multi-instance deployments
3. **Metrics** - Track rate limit hits and performance
4. **Provider-Specific Limits** - Different limits per provider type
