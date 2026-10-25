/**
 * ZipWiki-compatible ZIP writer helpers on top of ZipkitNode / buildZipBufferSync.
 *
 * ZipWiki pack owns parse + OKF. This module owns the container shape ZipWiki
 * expects so a future ZipWiki release can swap its hand-rolled `writeZipBuffer`
 * for NeoZipKit without changing wire layout.
 *
 * Pack CD order (ZipWiki convention, not APPNOTE-required):
 *   1. META-INF/… (manifest first when present)
 *   2. {aiRoot}/… (parsed + okf)
 *   3. primary / source members
 */

import {
  makeOriginExtra,
  originLocatorPresent,
  type OriginLocator,
} from '../../core/origin/OriginExtra';
import {
  buildZipBufferSync,
  writeZipFileSync,
  type BuildZipBufferOptions,
  type ZipBufferMember,
  type ZipPrecompressedMember,
} from '../buildZipBuffer';

export const ZIPWIKI_PACKAGE_SPEC_VERSION = '0.2.0' as const;
export const ZIPWIKI_DEFAULT_AI_ROOT = 'wiki' as const;
export const ZIPWIKI_MANIFEST_ENTRY = 'META-INF/manifest.json' as const;

/** Basename suffixes ZipWiki stores uncompressed by default. */
export const ZIPWIKI_DEFAULT_STORE_SUFFIXES = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.zip',
  '.zipwiki',
  '.nzip',
  '.gz',
  '.zst',
] as const;

export type ZipWikiEntryClass = 'meta' | 'ai' | 'primary';

export type ZipWikiMemberInput = {
  name: string;
  data: Buffer;
  mtime?: Date;
  dosTime?: number;
  dosDate?: number;
  /** Becomes Extra Field 0x014F when present. */
  origin?: OriginLocator;
  /** Write Extra Field 0x014E (SHA-256 of uncompressed payload). */
  useSHA256?: boolean;
  method?: 0 | 8 | 93;
  level?: number;
  forceZip64?: boolean;
  precompressed?: ZipPrecompressedMember;
};

export type WriteZipWikiOptions = BuildZipBufferOptions & {
  /** Default compression method when a member omits `method`. Default 93. */
  method?: 0 | 8 | 93;
  /** zlib zstd / deflate level. Default 7 (ZipWiki pack default). */
  level?: number;
  /** Write 0x014E on every newly compressed member. Default false. */
  sha256Extra?: boolean;
  /**
   * Reorder members into ZipWiki CD order (meta → ai root → primary).
   * Default true.
   */
  orderEntries?: boolean;
  /** AI root directory name without trailing slash. Default `wiki`. */
  aiRoot?: string;
  /**
   * Basename suffixes forced to store (method 0). Defaults to ZipWiki's list.
   * Pass `[]` to disable. Ignored when a member sets `method` or `precompressed`.
   */
  storeSuffixes?: string[];
};

function normalizeSlash(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function isMetaInfPath(path: string): boolean {
  const p = normalizeSlash(path).toLowerCase();
  return p === 'meta-inf' || p.startsWith('meta-inf/');
}

/** Classify a zip entry path the way ZipWiki pack does. */
export function classifyZipWikiEntry(
  path: string,
  aiRoot: string = ZIPWIKI_DEFAULT_AI_ROOT
): ZipWikiEntryClass {
  const p = normalizeSlash(path);
  if (isMetaInfPath(p)) return 'meta';
  const root = aiRoot.replace(/\/+$/, '');
  if (p === root || p.startsWith(`${root}/`)) return 'ai';
  return 'primary';
}

const CLASS_RANK: Record<ZipWikiEntryClass, number> = {
  meta: 0,
  ai: 1,
  primary: 2,
};

/**
 * Stable ZipWiki CD order: META-INF (manifest first), then AI root, then
 * primaries. Within a class, preserve relative input order except that
 * `META-INF/manifest.json` is moved to the front of meta.
 */
export function sortZipWikiMembers<T extends { name: string }>(
  members: T[],
  aiRoot: string = ZIPWIKI_DEFAULT_AI_ROOT
): T[] {
  const indexed = members.map((m, i) => ({ m, i }));
  indexed.sort((a, b) => {
    const ca = classifyZipWikiEntry(a.m.name, aiRoot);
    const cb = classifyZipWikiEntry(b.m.name, aiRoot);
    if (ca !== cb) return CLASS_RANK[ca] - CLASS_RANK[cb];
    if (ca === 'meta') {
      const aMan =
        normalizeSlash(a.m.name).toLowerCase() === ZIPWIKI_MANIFEST_ENTRY.toLowerCase();
      const bMan =
        normalizeSlash(b.m.name).toLowerCase() === ZIPWIKI_MANIFEST_ENTRY.toLowerCase();
      if (aMan !== bMan) return aMan ? -1 : 1;
    }
    return a.i - b.i;
  });
  return indexed.map((x) => x.m);
}

function normalizeSuffixes(list: string[] | undefined): string[] {
  const src =
    list === undefined ? [...ZIPWIKI_DEFAULT_STORE_SUFFIXES] : list;
  return src.map((s) => {
    const t = s.trim().toLowerCase();
    return t.startsWith('.') ? t : `.${t}`;
  });
}

/** True when the entry basename matches a store-forced suffix. */
export function shouldStoreZipWikiBySuffix(
  entryName: string,
  suffixes?: string[]
): boolean {
  const lower = normalizeSlash(entryName).toLowerCase();
  const base = lower.includes('/') ? lower.slice(lower.lastIndexOf('/') + 1) : lower;
  for (const suf of normalizeSuffixes(suffixes)) {
    if (base.endsWith(suf)) return true;
  }
  return false;
}

export type MinimalZipWikiManifestInput = {
  createdAt?: string;
  /** Default `0.2.0`. */
  specVersion?: string;
  profiles?: string[];
  aiRoot?: string;
  digest?: string;
  /** When set, emit a minimal `ai` block (ZipWiki AI-root packages). */
  includeAi?: boolean;
};

/**
 * Minimal APPNOTE `META-INF/manifest.json` body (E4).
 * Does not emit parse/OKF detail — ZipWiki still owns that at pack time.
 */
export function buildMinimalZipWikiManifest(
  input: MinimalZipWikiManifestInput = {}
): Record<string, unknown> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const specVersion = input.specVersion ?? ZIPWIKI_PACKAGE_SPEC_VERSION;
  const profiles = input.profiles ?? ['zipwiki'];
  const body: Record<string, unknown> = {
    format: 'neozip',
    specVersion,
    createdAt,
    profiles,
  };
  if (input.includeAi === true) {
    const root = (input.aiRoot ?? ZIPWIKI_DEFAULT_AI_ROOT).replace(/\/+$/, '');
    body.ai = {
      root,
      parsedDir: 'parsed',
      primaries: [] as unknown[],
      ...(input.digest?.trim() ? { digest: input.digest.trim() } : {}),
    };
  }
  return body;
}

export function serializeZipWikiManifest(
  manifest: Record<string, unknown>
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Map ZipWiki-shaped members to ZipBufferMember records for ZipkitNode.
 * Applies store-suffix rules, origin → 0x014F, and optional global 0x014E.
 */
export function toZipWikiBufferMembers(
  members: ZipWikiMemberInput[],
  options: WriteZipWikiOptions = {}
): ZipBufferMember[] {
  const ordered =
    options.orderEntries === false
      ? members
      : sortZipWikiMembers(members, options.aiRoot ?? ZIPWIKI_DEFAULT_AI_ROOT);
  const defaultMethod = options.method ?? 93;
  const defaultLevel = options.level ?? 7;
  const sha256All = options.sha256Extra === true;

  return ordered.map((member) => {
    const name = normalizeSlash(member.name);
    let method = member.method;
    if (method === undefined && !member.precompressed) {
      method = shouldStoreZipWikiBySuffix(name, options.storeSuffixes)
        ? 0
        : defaultMethod;
    }
    const additionalExtra =
      !member.precompressed && originLocatorPresent(member.origin)
        ? makeOriginExtra(member.origin)
        : undefined;

    const out: ZipBufferMember = {
      name,
      data: member.data,
      ...(member.mtime ? { mtime: member.mtime } : {}),
      ...(member.dosTime !== undefined ? { dosTime: member.dosTime } : {}),
      ...(member.dosDate !== undefined ? { dosDate: member.dosDate } : {}),
      ...(method !== undefined ? { method } : {}),
      level: member.level ?? defaultLevel,
      ...(member.forceZip64 !== undefined
        ? { forceZip64: member.forceZip64 }
        : {}),
      ...(member.precompressed
        ? { precompressed: member.precompressed }
        : {}),
      ...(additionalExtra ? { additionalExtra } : {}),
      useSHA256: member.useSHA256 === true || sha256All,
    };
    return out;
  });
}

/** Build a `.zipwiki`-shaped ZIP in memory via NeoZipKit. */
export function writeZipWikiBufferSync(
  members: ZipWikiMemberInput[],
  options: WriteZipWikiOptions = {}
): Buffer {
  return buildZipBufferSync(toZipWikiBufferMembers(members, options), {
    forceZip64: options.forceZip64,
  });
}

/** Stream a `.zipwiki`-shaped ZIP to disk via NeoZipKit. */
export function writeZipWikiFileSync(
  filePath: string,
  members: ZipWikiMemberInput[],
  options: WriteZipWikiOptions = {}
): void {
  writeZipFileSync(filePath, toZipWikiBufferMembers(members, options), {
    forceZip64: options.forceZip64,
  });
}
