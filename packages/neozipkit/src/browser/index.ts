// =============================================================================
// NeoZipkit - Browser-Only Package Exports
// =============================================================================

// Core shared exports (re-exported from core module)
export * from '../core';
import Zipkit from '../core';
export default Zipkit;

// Browser-only exports
export { default as ZipkitBrowser } from './ZipkitBrowser';

// Platform-specific conditional exports
export const PlatformUtils = {
  // Browser detection
  isBrowser: typeof window !== 'undefined' && typeof document !== 'undefined',
  // Node.js detection
  isNode: typeof process !== 'undefined' && process.versions && process.versions.node,
};
