/**
 * Centralized metadata filenames for NZIP ZIP archives.
 *
 * All META-INF metadata file names used across core and token-service
 * are defined here to avoid duplication and drift. Other modules re-export
 * these with domain-specific names (e.g. TOKENIZED_METADATA, SUBMIT_METADATA).
 *
 * Naming convention: TYPE.EXT
 * - .NZIP = neozip-blockchain token-service timestamp/NFT metadata
 */

// ---------------------------------------------------------------------------
// Token / NFT metadata (used by core verifier and token-service)
// Standard: TOKEN.NZIP. Legacy NZIP.TOKEN is accepted for reading only.
// ---------------------------------------------------------------------------
export const TOKEN_NZIP = 'META-INF/TOKEN.NZIP';
export const TOKEN_NZIP_LEGACY = 'META-INF/NZIP.TOKEN';

// ---------------------------------------------------------------------------
// NeoZip Token Service timestamp metadata (Ethereum batch timestamping)
// Pending: TS-SUBMIT.NZIP. Confirmed: TIMESTAMP.NZIP.
// ---------------------------------------------------------------------------
export const TS_SUBMIT_NZIP = 'META-INF/TS-SUBMIT.NZIP';
export const TIMESTAMP_NZIP = 'META-INF/TIMESTAMP.NZIP';

