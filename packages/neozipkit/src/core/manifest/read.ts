import { validateManifest } from './validate';
import type { NeoZipManifest } from './types';

/**
 * Parse manifest JSON text and validate the envelope. Pure (no I/O). Throws
 * with every validation error joined, or on invalid JSON. A leading BOM is ignored.
 */
export function parseManifestJson(text: string): NeoZipManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new Error(`manifest.json is not valid JSON: ${(e as Error).message}`);
  }
  const result = validateManifest(parsed);
  if (!result.ok) {
    throw new Error(`invalid manifest: ${result.errors.join('; ')}`);
  }
  return result.value;
}
