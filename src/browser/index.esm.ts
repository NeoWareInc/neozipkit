// =============================================================================
// NeoZipkit - Browser ES Module Entry Point
// =============================================================================
// This is a clean ES module entry point for browser bundles
// All exports are named exports for better tree-shaking support

// Buffer polyfill for browser
import { Buffer } from 'buffer';
if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

// Core exports
export * from '../core';

// Browser-specific class
export { default as ZipkitBrowser } from './ZipkitBrowser';

// Re-export ZipEntry as named export for convenience
export { default as ZipEntry } from '../core/ZipEntry';

// Re-export commonly used types and constants
export type { CompressOptions, CreateZipOptions } from '../core/ZipCompress';
export type { FileData, TokenMetadata } from '../types';
export * from '../core/constants/Headers';
export * from '../core/constants/Errors';

// Blockchain exports for browser (if needed)
export * from '../blockchain/browser';
export { createTokenVerifier } from '../blockchain/browser';

// Platform utilities
export const PlatformUtils = {
  isBrowser: typeof window !== 'undefined' && typeof document !== 'undefined',
  isNode: typeof process !== 'undefined' && process.versions && process.versions.node,
};

