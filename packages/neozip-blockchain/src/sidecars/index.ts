/**
 * Archive-agnostic Token Service sidecars (`META-INF/TS-SUBMIT.NZIP`,
 * `TIMESTAMP.NZIP`, `TOKEN.NZIP`).
 *
 * `buildSubmitSidecar` / `buildTimestampSidecar` / `buildTokenSidecar` are pure.
 * `writeSidecars` uses neozipkit's `applyMetaSidecars` (Node only).
 */

export {
  buildSubmitSidecar,
  buildTimestampSidecar,
  buildTokenSidecar,
  type Sidecar,
} from './builders';
export {
  writeSidecars,
  conflictingSidecars,
  PROFILE_TIMESTAMPED,
  PROFILE_TOKENIZED,
  type WriteSidecarsOptions,
} from './write';
