/**
 * Global teardown for Jest tests
 * Ensures all resources are cleaned up after tests complete
 */

export default async function globalTeardown() {
  // Give a delay to allow any pending async operations to complete
  // This helps with file handles, streams, and WASM modules (like ZSTD)
  // that might still be cleaning up. The delay allows Node.js event loop
  // to process any pending close operations.
  await new Promise(resolve => setTimeout(resolve, 500));
}

