import type { ManifestValidation, NeoZipManifest } from './types';

/**
 * Validate the manifest envelope (APPNOTE §4.1): `format === "neozip"`,
 * non-empty string `specVersion`, ISO-8601-parseable `createdAt`, and (when
 * present) `profiles` as a string array. Unknown keys are kept; the returned
 * `value` is a shallow copy.
 */
export function validateManifest(m: unknown): ManifestValidation {
  const errors: string[] = [];
  if (m === null || typeof m !== 'object' || Array.isArray(m)) {
    return { ok: false, errors: ['manifest must be a JSON object'] };
  }
  const o = m as Record<string, unknown>;

  if (o.format !== 'neozip') {
    errors.push('format must be "neozip"');
  }
  if (typeof o.specVersion !== 'string' || o.specVersion.length === 0) {
    errors.push('specVersion must be a non-empty string');
  }
  if (typeof o.createdAt !== 'string' || o.createdAt.length === 0) {
    errors.push('createdAt must be a non-empty ISO-8601 string');
  } else if (Number.isNaN(Date.parse(o.createdAt))) {
    errors.push('createdAt is not a valid ISO-8601 date');
  }
  if (o.profiles !== undefined) {
    if (!Array.isArray(o.profiles) || o.profiles.some((p) => typeof p !== 'string')) {
      errors.push('profiles must be an array of strings');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { ...o } as NeoZipManifest };
}
