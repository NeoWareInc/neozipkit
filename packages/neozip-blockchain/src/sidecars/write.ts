/**
 * Archive-agnostic sidecar writer (APPNOTE §8.4 / §8.6).
 *
 * Works on any ZIP (ZipWiki packages, plain `.nzip`, …): only `META-INF/**`
 * members change; every other member is copied byte-for-byte by neozipkit's
 * `applyMetaSidecars`.
 */

import {
  ZipReaderNode,
  applyMetaSidecars,
  updateManifest,
  addProfile,
  removeProfile,
  META_MANIFEST_JSON,
  asciiPathEqualsIgnoreCase,
} from 'neozipkit/node';
import {
  TS_SUBMIT_NZIP,
  TIMESTAMP_NZIP,
  TOKEN_NZIP,
  TOKEN_NZIP_LEGACY,
} from '../constants/metadata';
import type { Sidecar } from './builders';

export const PROFILE_TIMESTAMPED = 'timestamped';
export const PROFILE_TOKENIZED = 'tokenized';

export interface WriteSidecarsOptions {
  /** Sidecars to add (existing members of the same name are replaced). */
  add?: Sidecar[];
  /** Extra `META-INF/` names to remove (missing names are ignored). */
  remove?: string[];
  /**
   * Keep `manifest.json` `profiles` in sync (`"timestamped"` / `"tokenized"`).
   * Default `true`. Only an existing manifest is touched; archives without one
   * are left without one (profiles are optional, AppNote §8.4).
   */
  updateProfiles?: boolean;
}

function sameName(a: string, b: string): boolean {
  return a === b || asciiPathEqualsIgnoreCase(a, b);
}

function has(names: readonly string[], target: string): boolean {
  return names.some((n) => sameName(n, target));
}

/**
 * Sidecars that become stale when `added` is written (AppNote §8.4 / §8.6):
 *
 * | adding       | removed                                   | kept        |
 * | ------------ | ----------------------------------------- | ----------- |
 * | `TS-SUBMIT`  | `TIMESTAMP`, `TOKEN`, legacy `NZIP.TOKEN` | —           |
 * | `TIMESTAMP`  | `TS-SUBMIT`                               | `TOKEN`     |
 * | `TOKEN`      | `TS-SUBMIT`, legacy `NZIP.TOKEN`          | `TIMESTAMP` |
 *
 * A fresh submit starts a new lifecycle for the (possibly changed) root, so
 * older proofs are dropped. A mint supersedes the pending submit but keeps the
 * confirmed `TIMESTAMP.NZIP` (TOKEN's `timestampProof` binds the same root).
 */
export function conflictingSidecars(added: readonly string[]): string[] {
  const out = new Set<string>();
  if (has(added, TS_SUBMIT_NZIP)) {
    out.add(TIMESTAMP_NZIP);
    out.add(TOKEN_NZIP);
    out.add(TOKEN_NZIP_LEGACY);
  }
  if (has(added, TIMESTAMP_NZIP)) {
    out.add(TS_SUBMIT_NZIP);
  }
  if (has(added, TOKEN_NZIP)) {
    out.add(TS_SUBMIT_NZIP);
    out.add(TOKEN_NZIP_LEGACY);
  }
  return [...out];
}

/**
 * Add / replace / remove `META-INF/` sidecars in place via `applyMetaSidecars`,
 * always dropping stale conflicting sidecars ({@link conflictingSidecars}), then
 * (by default) sync `manifest.json` profiles through `updateManifest`.
 */
export async function writeSidecars(path: string, opts: WriteSidecarsOptions): Promise<void> {
  const add = opts.add ?? [];
  const addNames = add.map((a) => a.name);

  const wanted = [...(opts.remove ?? []), ...conflictingSidecars(addNames)];
  // A name that is being (re)added is replaced, never dropped.
  const removeWanted = [...new Set(wanted)].filter((n) => !has(addNames, n));

  const reader = ZipReaderNode.open(path);
  let remove: string[];
  try {
    remove = removeWanted.filter((n) => reader.getEntry(n, { caseInsensitiveMeta: true }) !== null);
  } finally {
    reader.close();
  }

  if (add.length > 0 || remove.length > 0) {
    await applyMetaSidecars(path, { add, remove });
  }

  if (opts.updateProfiles === false) return;

  const touched = [...addNames, ...remove];
  const timestampTouched = has(touched, TS_SUBMIT_NZIP) || has(touched, TIMESTAMP_NZIP);
  const tokenTouched = has(touched, TOKEN_NZIP) || has(touched, TOKEN_NZIP_LEGACY);
  if (!timestampTouched && !tokenTouched) return;

  await syncProfiles(path, { timestamp: timestampTouched, token: tokenTouched });
}

/** Make `profiles` match the sidecars actually present (no-op without a manifest). */
async function syncProfiles(
  path: string,
  which: { timestamp: boolean; token: boolean }
): Promise<void> {
  const reader = ZipReaderNode.open(path);
  let hasManifest: boolean;
  let timestamped: boolean;
  let tokenized: boolean;
  try {
    const find = (n: string) => reader.getEntry(n, { caseInsensitiveMeta: true }) !== null;
    hasManifest = find(META_MANIFEST_JSON);
    // Only a confirmed TIMESTAMP.NZIP backs the claim; a pending submit does not.
    timestamped = find(TIMESTAMP_NZIP);
    tokenized = find(TOKEN_NZIP) || find(TOKEN_NZIP_LEGACY);
  } finally {
    reader.close();
  }
  if (!hasManifest) return;

  await updateManifest(path, (m) => {
    let next = m;
    if (which.timestamp) {
      next = timestamped ? addProfile(next, PROFILE_TIMESTAMPED) : removeProfile(next, PROFILE_TIMESTAMPED);
    }
    if (which.token) {
      next = tokenized ? addProfile(next, PROFILE_TOKENIZED) : removeProfile(next, PROFILE_TOKENIZED);
    }
    return next;
  });
}
