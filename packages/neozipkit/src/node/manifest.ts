// ======================================
//  node/manifest.ts — read / update META-INF/manifest.json in a ZIP
// ======================================

import {
  META_MANIFEST_JSON,
  findReservedMetaEntry,
  validateReservedMeta,
} from '../core/constants/MetaPaths';
import {
  createManifest,
  parseManifestJson,
  serializeManifest,
  validateManifest,
  type NeoZipManifest,
} from '../core/manifest';
import { rewriteZip } from './rewriteZip';
import { ZipReaderNode } from './ZipReaderNode';

/** AppNote revision written when `updateManifest` has to create a manifest. */
export const DEFAULT_MANIFEST_SPEC_VERSION = '0.3.0';

/** Minimal reader surface: a `ZipReaderNode`, or anything shaped like it. */
export type ManifestReaderLike<E extends { name: string } = { name: string }> = {
  entries(): E[];
  readEntry(entry: E): Buffer | Promise<Buffer>;
};

/**
 * Read and validate `META-INF/manifest.json` (ASCII case-insensitive match).
 * Rejects archives that carry more than one case variant (or copy) of the name,
 * and archives without a manifest. Accepts a path, a reader, or a reader-like.
 */
export async function readManifest<E extends { name: string }>(
  reader: string | ManifestReaderLike<E>
): Promise<NeoZipManifest> {
  const opened = typeof reader === 'string' ? ZipReaderNode.open(reader) : null;
  try {
    const src = (opened ?? reader) as ManifestReaderLike<E>;
    const entries = src.entries();
    validateReservedMeta(entries);
    const hit = findReservedMetaEntry(
      entries.map((entry) => ({ filename: entry.name, entry })),
      META_MANIFEST_JSON
    );
    if (!hit) throw new Error(`${META_MANIFEST_JSON} not found`);
    const bytes = await src.readEntry(hit.entry);
    return parseManifestJson(bytes.toString('utf8'));
  } finally {
    opened?.close();
  }
}

/**
 * Apply `patch` to the manifest of the ZIP at `path` and rewrite only that entry
 * (everything else stays byte-identical; the file is replaced atomically). When
 * the archive has no manifest, `patch` receives a fresh one
 * (`specVersion` {@link DEFAULT_MANIFEST_SPEC_VERSION}) and the entry is added.
 * The patched manifest is validated before anything is written, and stored uncompressed.
 */
export async function updateManifest(
  path: string,
  patch: (m: NeoZipManifest) => NeoZipManifest | Promise<NeoZipManifest>
): Promise<NeoZipManifest> {
  const reader = ZipReaderNode.open(path);
  let current: NeoZipManifest | null = null;
  try {
    const entries = reader.entries();
    validateReservedMeta(entries);
    const hit = findReservedMetaEntry(
      entries.map((e) => ({ filename: e.name })),
      META_MANIFEST_JSON
    );
    if (hit) current = parseManifestJson(reader.readEntry(hit.filename as string).toString('utf8'));
  } finally {
    reader.close();
  }

  const base =
    current ?? createManifest({ specVersion: DEFAULT_MANIFEST_SPEC_VERSION });
  const next = await patch(base);
  const checked = validateManifest(next);
  if (!checked.ok) {
    throw new Error(`updateManifest: invalid manifest: ${checked.errors.join('; ')}`);
  }
  const data = Buffer.from(serializeManifest(checked.value), 'utf8');
  const member = { name: META_MANIFEST_JSON, data, method: 0 as const };
  await rewriteZip(path, path, current ? { replace: [member] } : { add: [member] });
  return checked.value;
}
