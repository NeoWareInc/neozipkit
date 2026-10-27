/**
 * Archive-level Token Service flows (Node only, any ZIP / `.nzip` / `.zipwiki`).
 *
 * Every flow accepts an optional precomputed `merkleRoot`; otherwise the v1
 * root is computed with neozipkit's `ZipReaderNode` (no `ZipkitLike` needed).
 * Proofs are written as `META-INF/` sidecars via `applyMetaSidecars`.
 *
 * Importing this entry loads `ethers` (mint + local proof verification) and
 * `neozipkit/node`.
 */

export { stampArchive, type StampArchiveOptions, type StampArchiveResult } from './stampArchive';
export {
  upgradeTimestamp,
  type UpgradeTimestampOptions,
  type UpgradeTimestampResult,
  type UpgradeTimestampStatus,
} from './upgradeTimestamp';
export {
  mintTimestampProof,
  type MintTimestampProofOptions,
  type MintTimestampProofResult,
} from './mintTimestampProof';
export { mintDirect, type MintDirectOptions, type MintDirectResult } from './mintDirect';
export {
  verifyArchive,
  type VerifyArchiveOptions,
  type VerifyArchiveResult,
  type VerifyArchiveStatus,
} from './verifyArchive';
export {
  readSidecars,
  readSidecarsFromPath,
  resolveMerkleRoot,
  sidecarKind,
  type ArchiveSidecars,
  type SidecarKind,
} from './internal';

// Sidecar builders / writer (archive-agnostic)
export * from '../sidecars';
