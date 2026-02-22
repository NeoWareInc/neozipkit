/**
 * Node Module Exports
 * Node.js functionality for ZIP file processing
 *
 * This is the entry point for Node.js-only imports:
 * import ZipkitNode from '@neozip/neozipkit/node';
 * // or
 * import { Zipkit, ZipkitNode, ... } from '@neozip/neozipkit/node';
 */

// Core ZIP functionality (re-exported from core module, but NOT the default)
export * from '../core';
import Zipkit from '../core';
export { Zipkit }; // Named export for backward compatibility

// Node.js-specific ZIP operations - default export (after export * to ensure it's the default)
import ZipkitNodeDefault from './ZipkitNode';
export { default as ZipkitNode } from './ZipkitNode';
// Set as default export - this will be the default when importing from this module
export default ZipkitNodeDefault;
export type { ZipFileWriter } from './ZipkitNode';
export { ZipCompressNode } from './ZipCompressNode';
export { ZipDecompressNode } from './ZipDecompressNode';

// Efficient ZIP copying using ZipEntry directly
export { ZipCopyNode } from './ZipCopyNode';
export type {
  CopyOptions,
  CopyResult,
  CopyEntriesOnlyResult,
  FinalizeZipOptions,
} from './ZipCopyNode';

// Platform detection
export const PlatformUtils = {
  // Browser detection
  isBrowser: typeof window !== 'undefined' && typeof document !== 'undefined',
  // Node.js detection
  isNode: typeof process !== 'undefined' && process.versions && process.versions.node,
};
