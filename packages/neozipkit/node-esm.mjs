/**
 * ESM entry for `neozipkit/node`.
 * The compiled kit is CommonJS; Node does not surface its getter exports as named ESM imports.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const kit = require("./dist/node/index.js");

export const ZipkitNode = kit.ZipkitNode;
export const Zipkit = kit.Zipkit;
export const buildZipBufferSync = kit.buildZipBufferSync;
export const writeZipFileSync = kit.writeZipFileSync;
export const inflateZipPayloadSync = kit.inflateZipPayloadSync;
export const ZipCopyNode = kit.ZipCopyNode;
export const crc32 = kit.crc32;
export const sha256 = kit.sha256;
export const isMetaInfPath = kit.isMetaInfPath;
export const computeArchiveMerkleRoot = kit.computeArchiveMerkleRoot;
export const computeMerkleRootV0FromDigests = kit.computeMerkleRootV0FromDigests;
export const computeMerkleRootV1FromContents = kit.computeMerkleRootV1FromContents;
export const computeMerkleRootV1FromLeaves = kit.computeMerkleRootV1FromLeaves;
export const contentDigest = kit.contentDigest;
export const leafHashV0 = kit.leafHashV0;
export const leafHashV1 = kit.leafHashV1;
export const matchMerkleRoot = kit.matchMerkleRoot;
export const merkleRootFromLeaves = kit.merkleRootFromLeaves;
export const normalizeMerklePath = kit.normalizeMerklePath;
export const parentHash = kit.parentHash;
export const ZstdNode = kit.ZstdNode;
export const isNativeZstdAvailable = kit.isNativeZstdAvailable;
export default kit.default ?? kit.ZipkitNode;
