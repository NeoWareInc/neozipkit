// ======================================
//	Util.ts
//  Copyright (c) 2024 NeoWare, Inc. All rights reserved.
// ======================================
// Utility functions

import Support from "./Support";
import Errors from "../constants/Errors";
import { TIMESTAMP_SUBMITTED, TIMESTAMP_METADATA, TOKENIZED_METADATA } from "../constants/Headers";

export const DATATYPE = {
  STRING: "string",
  BUFFER: "buffer",
  ARRAY: "array",
  ARRAYBUFFER: "arraybuffer",
  U8ARRAY: "uint8array",
  BLOB: "blob",
  STREAM: "stream",
};

// Parse a 64-bit unsigned integer from a buffer
export function readBigUInt64LE(buffer: Buffer, index: number): number {
  var buf = Buffer.from(buffer.subarray(index, index + 8));
  buf.swap64();

  return parseInt(`0x${buf.toString("hex")}`);
};

// C-style uInt32 Multiply (discards higher bits, when JS multiply discards lower bits)
export const uMul = (a: number, b: number) => Math.imul(a, b) >>> 0;

interface StreamLike {
  on: Function;
  pause: Function;
  resume: Function;
}

export function isStream(obj: unknown): obj is StreamLike {
  if (!obj || typeof obj !== 'object') return false;
  const streamLike = obj as StreamLike;
  return typeof streamLike.on === "function" &&
         typeof streamLike.pause === "function" &&
         typeof streamLike.resume === "function";
}

// Return the type of the input.
// The type will be in a format valid for JSZip.utils.transformTo : string, array, uint8array, arraybuffer.
// If the type is not supported, throw an exception.
export function getTypeOf(input: string|Buffer|Blob|Array<any>|ArrayBuffer|Uint8Array): string {
  if (typeof input === "string") {
    if (!Support.string)
      throw new Error(Errors.DATATYPE_STRING_UNSUPPORTED);
    return DATATYPE.STRING;
  }
  else if (Object.prototype.toString.call(input) === "[object Array]") {
    if (!Support.array)
      throw new Error(Errors.DATATYPE_ARRAY_UNSUPPORTED);
    return DATATYPE.ARRAY;
  }
  else if (Buffer.isBuffer(input)) {
    if (!Support.buffer)
      throw new Error(Errors.DATATYPE_BUFFER_UNSUPPORTED);
    return DATATYPE.BUFFER;
  }  else if (input instanceof Blob) {
    if (!Support.blob)
      throw new Error(Errors.DATATYPE_BLOB_UNSUPPORTED);
    return DATATYPE.BLOB;
  } else if (input instanceof Uint8Array) {
    if (!Support.uint8array)
      throw new Error(Errors.DATATYPE_U8ARRAY_UNSUPPORTED);
    return DATATYPE.U8ARRAY;
  }
  else if (input instanceof ArrayBuffer) {
    if (!Support.arrayBuffer)
      throw new Error(Errors.DATATYPE_ARRAYBUFFER_UNSUPPORTED);
    return DATATYPE.ARRAYBUFFER;
  } else {  // Add an else block to handle unsupported types
    throw new Error(Errors.DATATYPE_UNSUPPORTED);
  }
};

/**
 * Check if a filename is a metadata file
 * @param filename The filename to check
 * @returns True if the file is a metadata file (META-INF)
 */
export const isMetadataFile = (filename: string): boolean => {
  return filename === TIMESTAMP_SUBMITTED || 
         filename === TIMESTAMP_METADATA || 
         filename === TOKENIZED_METADATA;
};
