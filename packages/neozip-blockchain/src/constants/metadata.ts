/**
 * Centralized metadata filenames for NZIP and OTS ZIP archives.
 *
 * All META-INF metadata file names used across core, zipstamp-server, and OTS
 * are defined here to avoid duplication and drift. Other modules re-export
 * these with domain-specific names (e.g. TOKENIZED_METADATA, SUBMIT_METADATA).
 *
 * Naming convention: TYPE.EXT
 * - .NZIP = neozip-blockchain zipstamp-server timestamp/NFT metadata
 * - .OTS  = OpenTimestamps (Bitcoin) proof metadata
 */

// ---------------------------------------------------------------------------
// Token / NFT metadata (used by core verifier and zipstamp-server)
// Standard: TOKEN.NZIP. Legacy NZIP.TOKEN is accepted for reading only.
// ---------------------------------------------------------------------------
export const TOKEN_NZIP = 'META-INF/TOKEN.NZIP';
export const TOKEN_NZIP_LEGACY = 'META-INF/NZIP.TOKEN';

// ---------------------------------------------------------------------------
// Zipstamp server timestamp metadata (Ethereum batch timestamping)
// Pending: TS-SUBMIT.NZIP. Confirmed: TIMESTAMP.NZIP.
// ---------------------------------------------------------------------------
export const TS_SUBMIT_NZIP = 'META-INF/TS-SUBMIT.NZIP';
export const TIMESTAMP_NZIP = 'META-INF/TIMESTAMP.NZIP';

// ---------------------------------------------------------------------------
// OpenTimestamps metadata (Bitcoin OTS proof)
// Pending: TS-SUBMIT.OTS. Confirmed: TIMESTAMP.OTS.
// ---------------------------------------------------------------------------
export const TS_SUBMIT_OTS = 'META-INF/TS-SUBMIT.OTS';
export const TIMESTAMP_OTS = 'META-INF/TIMESTAMP.OTS';
