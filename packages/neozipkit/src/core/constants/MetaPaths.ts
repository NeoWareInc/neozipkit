/**
 * NeoZip reserved META-INF paths and ASCII case-insensitive discovery.
 * Matches NEOZIP_APPNOTE.md §2.3: writers emit canonical spellings; readers fold case.
 */

/** Canonical writers MUST emit these spellings. */
export const META_TOKEN_NZIP = 'META-INF/TOKEN.NZIP';
export const META_TOKEN_NZIP_LEGACY = 'META-INF/NZIP.TOKEN';
export const META_TS_SUBMIT_NZIP = 'META-INF/TS-SUBMIT.NZIP';
export const META_TIMESTAMP_NZIP = 'META-INF/TIMESTAMP.NZIP';
export const META_TS_SUBMIT_OTS = 'META-INF/TS-SUBMIT.OTS';
export const META_TIMESTAMP_OTS = 'META-INF/TIMESTAMP.OTS';
export const META_MANIFEST_JSON = 'META-INF/manifest.json';

/** @deprecated Prefer META_TS_SUBMIT_OTS — kept for existing imports. */
export const TIMESTAMP_SUBMITTED = META_TS_SUBMIT_OTS;
/** @deprecated Prefer META_TIMESTAMP_OTS — kept for existing imports. */
export const TIMESTAMP_METADATA = META_TIMESTAMP_OTS;
/** @deprecated Prefer META_TOKEN_NZIP — kept for existing imports (canonical TOKEN.NZIP). */
export const TOKENIZED_METADATA = META_TOKEN_NZIP;

const RESERVED_CANONICAL = [
  META_TOKEN_NZIP,
  META_TOKEN_NZIP_LEGACY,
  META_TS_SUBMIT_NZIP,
  META_TIMESTAMP_NZIP,
  META_TS_SUBMIT_OTS,
  META_TIMESTAMP_OTS,
  META_MANIFEST_JSON,
] as const;

export type ZipEntryLikeFilename = { filename?: string };

/** ASCII case-insensitive path compare (APPNOTE §2.3). */
export function asciiPathEqualsIgnoreCase(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still allow length mismatch only via toLowerCase for UTF-8 safety on ASCII paths
  }
  return a.toLowerCase() === b.toLowerCase();
}

/** True when path is under META-INF/ (ASCII case-insensitive). */
export function isMetaInfPath(filename: string): boolean {
  return filename.toLowerCase().startsWith('meta-inf/');
}

/** True when filename is a reserved NeoZip meta path (any casing). */
export function isReservedMetaPath(filename: string): boolean {
  const lower = filename.toLowerCase();
  return RESERVED_CANONICAL.some((c) => c.toLowerCase() === lower);
}

/**
 * True for any META-INF/** entry (integrity merkle leaves exclude these per APPNOTE §6.2).
 */
export function isMetadataFile(filename: string): boolean {
  return isMetaInfPath(filename);
}

/**
 * Find a reserved meta entry among ZIP directory entries.
 * Prefers an exact canonical match, then ASCII case-insensitive match.
 * When multiple preferred names are given, earlier names win.
 */
export function findReservedMetaEntry<T extends ZipEntryLikeFilename>(
  entries: T[],
  preferredCanonicalNames: string | readonly string[]
): T | null {
  const preferred = Array.isArray(preferredCanonicalNames)
    ? preferredCanonicalNames
    : [preferredCanonicalNames];

  for (const name of preferred) {
    const exact = entries.find((e) => e.filename === name);
    if (exact) return exact;
  }

  for (const name of preferred) {
    const folded = entries.find(
      (e) => typeof e.filename === 'string' && asciiPathEqualsIgnoreCase(e.filename, name)
    );
    if (folded) return folded;
  }

  return null;
}
