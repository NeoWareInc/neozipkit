/**
 * CalendarManager - Multi-calendar support for redundancy
 * 
 * Similar to OpenTimestamps' approach of submitting to multiple calendars,
 * this class manages multiple Zipstamp server calendars for reliability.
 * 
 * **Use Cases:**
 * - Submit timestamps to multiple calendars for redundancy
 * - Verify from any available calendar (failover)
 * - Monitor calendar health and availability
 * - Automatic failover when calendars are unavailable
 * 
 * @example
 * ```typescript
 * // Create manager with multiple calendars
 * const manager = new CalendarManager([
 *   { url: 'https://alpha.timestamp.neozip.io', priority: 1 },
 *   { url: 'https://beta.timestamp.neozip.io', priority: 2 },
 * ]);
 * 
 * // Check health of all calendars
 * await manager.checkAllHealth();
 * 
 * // Submit to multiple calendars for redundancy
 * const results = await manager.submitToMultiple(digest, chainId);
 * console.log(`Submitted to ${results.successes.length} calendars`);
 * 
 * // Verify from any available calendar
 * const verification = await manager.verifyFromAny(digest, chainId, batchId);
 * ```
 */

import {
  ZipstampServerClient,
  type CalendarIdentity,
  type HealthCheckResponse,
  type StampResponse,
  type VerifyResponse,
} from './ZipstampServerClient';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for a single calendar server
 */
export interface CalendarConfig {
  /** Base URL of the calendar server */
  url: string;
  /** Priority for ordering (lower = higher priority, default: 100) */
  priority?: number;
  /** Optional friendly name for this calendar */
  name?: string;
}

/**
 * Status of a calendar server
 */
export interface CalendarStatus {
  /** Base URL of the calendar */
  url: string;
  /** Calendar identity (if fetched) */
  identity?: CalendarIdentity;
  /** Health check response (if fetched) */
  health?: HealthCheckResponse;
  /** When this status was last updated */
  lastChecked: Date;
  /** Whether the calendar is currently available */
  available: boolean;
  /** Latency in milliseconds (if measured) */
  latencyMs?: number;
  /** Error message if unavailable */
  error?: string;
}

/**
 * Result of submitting to a single calendar
 */
export interface SubmitResult {
  calendar: string;
  result: StampResponse;
}

/**
 * Result of submitting to multiple calendars
 */
export interface MultiSubmitResult {
  /** Successful submissions */
  successes: SubmitResult[];
  /** Failed submissions */
  failures: Array<{ calendar: string; error: string }>;
}

/**
 * Result of verifying from a calendar
 */
export interface VerifyResult {
  calendar: string;
  result: VerifyResponse;
}

/**
 * Options for multi-calendar operations
 */
export interface MultiCalendarOptions {
  /** Minimum number of successful submissions required (default: 1) */
  minSuccess?: number;
  /** Timeout per calendar in milliseconds (default: 30000) */
  timeout?: number;
  /** Whether to continue after minSuccess is reached (default: true) */
  continueAfterMinSuccess?: boolean;
}

// ============================================================================
// CalendarManager Class
// ============================================================================

export class CalendarManager {
  private calendars: CalendarConfig[] = [];
  private statusCache: Map<string, CalendarStatus> = new Map();

  /**
   * Create a new CalendarManager
   * 
   * @param calendars - Optional initial list of calendar configurations
   */
  constructor(calendars?: CalendarConfig[]) {
    if (calendars) {
      this.calendars = [...calendars].sort((a, b) =>
        (a.priority ?? 100) - (b.priority ?? 100)
      );
    }
  }

  // ==========================================================================
  // Calendar Management
  // ==========================================================================

  /**
   * Add a calendar server to the manager
   * 
   * @param config - Calendar configuration
   */
  addCalendar(config: CalendarConfig): void {
    // Check for duplicate
    if (this.calendars.some(c => c.url === config.url)) {
      throw new Error(`Calendar already exists: ${config.url}`);
    }
    this.calendars.push(config);
    // Re-sort by priority
    this.calendars.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /**
   * Remove a calendar server from the manager
   * 
   * @param url - URL of the calendar to remove
   * @returns true if removed, false if not found
   */
  removeCalendar(url: string): boolean {
    const index = this.calendars.findIndex(c => c.url === url);
    if (index === -1) return false;
    this.calendars.splice(index, 1);
    this.statusCache.delete(url);
    return true;
  }

  /**
   * Get all configured calendars
   * 
   * @returns Copy of the calendar configurations array
   */
  getCalendars(): CalendarConfig[] {
    return [...this.calendars];
  }

  /**
   * Get the number of configured calendars
   */
  get count(): number {
    return this.calendars.length;
  }

  // ==========================================================================
  // Health Checking
  // ==========================================================================

  /**
   * Check health of all configured calendars
   * 
   * Updates the internal status cache with results.
   * 
   * @returns Array of calendar statuses
   */
  async checkAllHealth(): Promise<CalendarStatus[]> {
    const results = await Promise.all(
      this.calendars.map(cal => this.checkHealth(cal.url))
    );
    return results;
  }

  /**
   * Check health of a specific calendar
   * 
   * @param url - URL of the calendar to check
   * @returns Calendar status
   */
  async checkHealth(url: string): Promise<CalendarStatus> {
    const start = Date.now();
    const client = new ZipstampServerClient({ 
      serverUrl: url, 
      timeout: 10000, // 10 second timeout for health checks
      retries: 0, // No retries for health checks
    });

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
    } catch (error) {
      const status: CalendarStatus = {
        url,
        lastChecked: new Date(),
        available: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
      this.statusCache.set(url, status);
      return status;
    }
  }

  /**
   * Get cached status for a calendar
   * 
   * @param url - URL of the calendar
   * @returns Cached status or undefined if not checked
   */
  getStatus(url: string): CalendarStatus | undefined {
    return this.statusCache.get(url);
  }

  /**
   * Get all cached statuses
   * 
   * @returns Map of URL to status
   */
  getAllStatuses(): Map<string, CalendarStatus> {
    return new Map(this.statusCache);
  }

  /**
   * Get calendars that are currently healthy
   * 
   * Returns calendars sorted by priority. If a calendar hasn't been
   * checked yet, it's assumed to be available.
   * 
   * @returns Array of healthy calendar configurations
   */
  getHealthyCalendars(): CalendarConfig[] {
    return this.calendars.filter(cal => {
      const status = this.statusCache.get(cal.url);
      // If not checked, assume available
      return status?.available ?? true;
    });
  }

  /**
   * Get calendars that are currently unavailable
   * 
   * @returns Array of unavailable calendar configurations
   */
  getUnhealthyCalendars(): CalendarConfig[] {
    return this.calendars.filter(cal => {
      const status = this.statusCache.get(cal.url);
      return status && !status.available;
    });
  }

  // ==========================================================================
  // Multi-Calendar Operations
  // ==========================================================================

  /**
   * Submit digest to multiple calendars for redundancy
   * 
   * Submits to all healthy calendars in parallel. Useful for ensuring
   * your timestamp is recorded by multiple independent servers.
   * Stamping requires a verified email (pass email in the request).
   * 
   * @param digest - SHA-256 digest to timestamp
   * @param chainId - Optional chain ID hint
   * @param email - Email address (must be verified on each server)
   * @param options - Multi-calendar options
   * @returns Results from all submission attempts
   * @throws Error if fewer than minSuccess calendars succeed
   */
  async submitToMultiple(
    digest: string,
    chainId?: number,
    email?: string,
    options?: MultiCalendarOptions
  ): Promise<MultiSubmitResult> {
    const healthy = this.getHealthyCalendars();
    const minSuccess = options?.minSuccess ?? 1;

    if (healthy.length === 0) {
      throw new Error('No healthy calendars available');
    }

    const results = await Promise.allSettled(
      healthy.map(async cal => {
        const client = new ZipstampServerClient({
          serverUrl: cal.url,
          timeout: options?.timeout ?? 30000,
        });
        const result = await client.stamp({ digest, chainId, email });
        if (!result.success) {
          throw new Error(result.error || 'Stamp failed');
        }
        return { calendar: cal.url, result };
      })
    );

    const successes: SubmitResult[] = [];
    const failures: Array<{ calendar: string; error: string }> = [];

    results.forEach((result, index) => {
      const cal = healthy[index];
      if (result.status === 'fulfilled') {
        successes.push(result.value);
      } else {
        failures.push({
          calendar: cal.url,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });

    if (successes.length < minSuccess) {
      throw new Error(
        `Failed to submit to minimum ${minSuccess} calendar(s). ` +
        `Successes: ${successes.length}, Failures: ${failures.length}. ` +
        `Errors: ${failures.map(f => f.error).join('; ')}`
      );
    }

    return { successes, failures };
  }

  /**
   * Verify digest by trying calendars until one succeeds
   * 
   * Tries each healthy calendar in priority order until verification
   * succeeds. Useful for failover when a calendar is temporarily unavailable.
   * 
   * **Note:** Verification is PUBLIC - no API key required.
   * 
   * @param digest - SHA-256 digest to verify
   * @param chainId - Optional chain ID hint
   * @param batchId - Optional batch ID hint
   * @returns Verification result from the first successful calendar
   * @throws Error if no calendar can verify the digest
   */
  async verifyFromAny(
    digest: string,
    chainId?: number,
    batchId?: string
  ): Promise<VerifyResult> {
    const healthy = this.getHealthyCalendars();
    const errors: string[] = [];

    if (healthy.length === 0) {
      throw new Error('No healthy calendars available');
    }

    for (const cal of healthy) {
      try {
        const client = new ZipstampServerClient({ serverUrl: cal.url });
        const result = await client.verify({ digest, chainId, batchId });
        
        if (result.success) {
          return { calendar: cal.url, result };
        }
        
        errors.push(`${cal.url}: ${result.error || 'Verification failed'}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${cal.url}: ${msg}`);
        // Mark calendar as unhealthy and continue
        const status = this.statusCache.get(cal.url);
        if (status) {
          status.available = false;
          status.error = msg;
        }
      }
    }

    throw new Error(
      `Failed to verify from any calendar. Errors: ${errors.join('; ')}`
    );
  }

  /**
   * Poll for confirmation from any calendar
   * 
   * Polls healthy calendars until the digest is confirmed or timeout
   * is reached. Returns as soon as any calendar reports confirmation.
   * 
   * @param digest - SHA-256 digest to check
   * @param chainId - Optional chain ID hint
   * @param batchId - Optional batch ID hint
   * @param timeout - Maximum time to poll in milliseconds (default: 300000 = 5 minutes)
   * @param interval - Time between polling attempts in milliseconds (default: 10000 = 10 seconds)
   * @returns Verification result if confirmed, null if timeout
   */
  async pollForConfirmation(
    digest: string,
    chainId?: number,
    batchId?: string,
    timeout: number = 300000,
    interval: number = 10000
  ): Promise<VerifyResult | null> {
    const startTime = Date.now();
    const deadline = startTime + timeout;

    while (Date.now() < deadline) {
      try {
        const result = await this.verifyFromAny(digest, chainId, batchId);
        if (result.result.verified) {
          return result;
        }
      } catch {
        // Continue polling
      }

      // Wait before next attempt
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise(resolve => setTimeout(resolve, Math.min(interval, remaining)));
    }

    return null;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Create a client for a specific calendar
   * 
   * @param url - URL of the calendar (must be configured)
   * @returns ZipstampServerClient instance
   * @throws Error if calendar is not configured
   */
  getClient(url: string): ZipstampServerClient {
    const config = this.calendars.find(c => c.url === url);
    if (!config) {
      throw new Error(`Calendar not configured: ${url}`);
    }
    return new ZipstampServerClient({
      serverUrl: config.url,
    });
  }

  /**
   * Get client for the highest priority healthy calendar
   * 
   * @returns ZipstampServerClient instance or null if no healthy calendars
   */
  getBestClient(): ZipstampServerClient | null {
    const healthy = this.getHealthyCalendars();
    if (healthy.length === 0) return null;
    return this.getClient(healthy[0].url);
  }

  /**
   * Clear all cached health statuses
   */
  clearCache(): void {
    this.statusCache.clear();
  }
}
