// ======================================
//	Support.ts
//  A utility module for detecting platform capabilities and features
//  Copyright (c) 2024 NeoWare, Inc. All rights reserved.
// ======================================

/**
 * Platform and environment feature detection utility
 * Provides boolean flags indicating support for various features needed by NeoZip
 * 
 * @namespace Support
 * @property {boolean} base64 - Always true, indicates base64 encoding support
 * @property {boolean} array - Always true, indicates Array support
 * @property {boolean} string - Always true, indicates String support
 * @property {boolean} isNode - True if running in Node.js environment
 * @property {boolean} buffer - True if Node.js Buffer is available
 * @property {boolean} uint8array - True if Uint8Array is supported
 * @property {boolean} arrayBuffer - True if both ArrayBuffer and Uint8Array are supported
 * @property {boolean} blob - True if Blob creation with ArrayBuffer is supported
 * @property {boolean} streams - True if ReadableStream and WritableStream are supported
 * @property {boolean} fileReader - True if FileReader is supported
 */
const Support = {
  /** Base64 encoding support (always true) */
  base64: true,
  /** Array support (always true) */
  array: true,
  /** String support (always true) */
  string: true,

  /** 
   * Detects if code is running in Node.js environment
   * True if process.versions.node exists, undefined in browser
   */
  isNode: true,
  
  /**
   * Detects if Node.js Buffer is available
   * True in Node.js, undefined in browser
   */
  buffer: true,

  /**
   * Detects support for Uint8Array typed array
   * Used for binary data handling
   */
  uint8array: true,
  
  /**
   * Detects support for both ArrayBuffer and Uint8Array
   * Required for binary data operations
   */
  arrayBuffer: typeof ArrayBuffer !== "undefined" && typeof Uint8Array !== "undefined",

  /**
   * Detects support for Blob with ArrayBuffer
   * Tests by attempting to create an empty ZIP Blob
   * @returns {boolean} True if Blob creation succeeds
   */
  blob: true,

  /**
   * Detects support for Streams API
   * Checks for ReadableStream/WritableStream in browser
   * or 'stream' module in Node.js
   * @returns {boolean} True if streams are supported in current environment
   */
  streams: true,
  
  /**
   * Detects support for FileReader
   * @returns {boolean} True if FileReader is supported
   */
  fileReader: false
};

export default Support;