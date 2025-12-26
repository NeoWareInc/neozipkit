/**
 * ZstdManager - Global Zstd Codec Manager
 * 
 * This manager ensures safe usage of the Zstd WASM module across multiple instances.
 * 
 * ## Why This Is Necessary
 * 
 * The `@oneidentity/zstd-js` library uses a shared WASM module internally.
 * While `ZstdInit()` returns different object references, they all share the same
 * `ZstdSimple` implementation and WASM memory/heap.
 * 
 * This means concurrent or improperly managed sequential operations can cause
 * memory corruption because they're all operating on the same underlying WASM state.
 * 
 * ## How It Works
 * 
 * 1. Single initialization: WASM module is initialized once globally
 * 2. Operation queuing: All compress/decompress operations are queued
 * 3. Sequential execution: JavaScript's single-threaded nature ensures safe execution
 * 4. Automatic initialization: Lazy initialization on first use
 * 
 * ## Usage
 * 
 * ```typescript
 * import { ZstdManager } from './ZstdManager';
 * 
 * // Compress
 * const compressed = await ZstdManager.compress(data, level);
 * 
 * // Decompress
 * const decompressed = await ZstdManager.decompress(compressedData);
 * ```
 */

import { ZstdInit, ZstdSimple } from '@oneidentity/zstd-js';

class ZstdCodecManager {
  private static instance: ZstdCodecManager | null = null;
  private codec: { ZstdSimple: typeof ZstdSimple } | null = null;
  private initPromise: Promise<void> | null = null;
  private operationQueue: Promise<any> = Promise.resolve();

  private constructor() {}

  /**
   * Get the singleton instance of ZstdCodecManager
   */
  public static getInstance(): ZstdCodecManager {
    if (!ZstdCodecManager.instance) {
      ZstdCodecManager.instance = new ZstdCodecManager();
    }
    return ZstdCodecManager.instance;
  }

  /**
   * Ensure the Zstd codec is initialized
   * This is called automatically before any compress/decompress operation
   */
  private async ensureInitialized(): Promise<void> {
    if (this.codec) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      this.codec = await ZstdInit();
    })();

    return this.initPromise;
  }

  /**
   * Queue an operation to ensure sequential execution
   * This prevents concurrent operations from interfering with each other
   */
  private async queueOperation<T>(operation: () => Promise<T> | T): Promise<T> {
    // Chain this operation after the previous one
    const promise = this.operationQueue.then(operation, operation);
    
    // Update the queue to point to this operation
    this.operationQueue = promise.catch(() => {}); // Catch to prevent unhandled rejections in queue
    
    return promise;
  }

  /**
   * Compress data using Zstd
   * @param data - Data to compress (Uint8Array)
   * @param level - Compression level (1-22, default 6)
   * @returns Compressed data as Uint8Array
   */
  public async compress(data: Uint8Array, level: number = 6): Promise<Uint8Array> {
    return this.queueOperation(async () => {
      await this.ensureInitialized();
      
      if (!this.codec) {
        throw new Error('Zstd codec not initialized');
      }

      return this.codec.ZstdSimple.compress(data, level);
    });
  }

  /**
   * Decompress data using Zstd
   * @param data - Compressed data (Uint8Array or Buffer)
   * @returns Decompressed data as Uint8Array
   */
  public async decompress(data: Uint8Array | Buffer): Promise<Uint8Array> {
    return this.queueOperation(async () => {
      await this.ensureInitialized();
      
      if (!this.codec) {
        throw new Error('Zstd codec not initialized');
      }

      // Convert Buffer to Uint8Array if needed
      const inputData = data instanceof Buffer 
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : data;

      return this.codec.ZstdSimple.decompress(inputData);
    });
  }

  /**
   * Reset the manager (for testing purposes)
   * @internal
   */
  public static reset(): void {
    ZstdCodecManager.instance = null;
  }
}

/**
 * Global Zstd Manager
 * Use this for all Zstd compression/decompression operations
 */
export const ZstdManager = {
  /**
   * Compress data using Zstd
   * Operations are automatically queued to prevent interference
   */
  compress: (data: Uint8Array, level?: number) => 
    ZstdCodecManager.getInstance().compress(data, level),

  /**
   * Decompress data using Zstd
   * Operations are automatically queued to prevent interference
   */
  decompress: (data: Uint8Array | Buffer) => 
    ZstdCodecManager.getInstance().decompress(data),

  /**
   * Reset the manager (for testing)
   * @internal
   */
  reset: () => ZstdCodecManager.reset(),
};

export default ZstdManager;

