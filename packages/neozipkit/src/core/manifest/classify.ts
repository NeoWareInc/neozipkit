import { isMetaInfPath } from '../constants/MetaPaths';
import type { ManifestEntryClass, NeoZipManifest, PairingResult } from './types';

/**
 * APPNOTE §3.1: `META-INF/` (ASCII case-insensitive) → meta; `R/` prefix
 * (case-preserving) → ai-namespace; everything else → primary.
 */
export function classifyEntry(path: string, aiRoot?: string | null): ManifestEntryClass {
  if (isMetaInfPath(path)) return 'meta';
  if (aiRoot) {
    const root = aiRoot.replace(/\/+$/, '');
    if (root && path.startsWith(root + '/')) return 'ai-namespace';
  }
  return 'primary';
}

function aiObject(manifest: NeoZipManifest): Record<string, unknown> | null {
  const ai = manifest.ai;
  return ai !== null && typeof ai === 'object' && !Array.isArray(ai)
    ? (ai as Record<string, unknown>)
    : null;
}

/**
 * APPNOTE §3.2 pairing. `R/parsed/P.md` and `R/parsed/P.assets/**` need primary
 * `P` unless `ai.primaries[]` has `{ path: P, sourceIncluded: false }`.
 * A manifest without `ai.root` has nothing to pair (ok, with a note).
 * Assets without a matching parse are noted, not failed.
 */
export function checkPairing(
  entries: ReadonlyArray<{ name: string }>,
  manifest: NeoZipManifest
): PairingResult {
  const notes: string[] = [];
  const ai = aiObject(manifest);
  const root = typeof ai?.root === 'string' ? ai.root.replace(/\/+$/, '') : '';
  if (!ai || !root) {
    notes.push('no ai.root declared; pairing not applicable');
    return { ok: true, orphans: [], notes };
  }
  const parsedDir =
    typeof ai.parsedDir === 'string' && ai.parsedDir ? ai.parsedDir.replace(/^\/+|\/+$/g, '') : 'parsed';
  const prefix = `${root}/${parsedDir}/`;

  const omitted = new Set<string>();
  if (Array.isArray(ai.primaries)) {
    for (const p of ai.primaries) {
      if (p && typeof p === 'object') {
        const rec = p as Record<string, unknown>;
        if (typeof rec.path === 'string' && rec.sourceIncluded === false) omitted.add(rec.path);
      }
    }
  }

  const names = entries.map((e) => e.name);
  const primaries = new Set(names.filter((n) => classifyEntry(n, root) === 'primary'));
  const parses = new Set<string>();
  const assetOwners = new Set<string>();
  const orphans: string[] = [];

  for (const n of names) {
    if (!n.startsWith(prefix)) continue;
    const rest = n.slice(prefix.length);
    const asset = /^(.+)\.assets\/.+$/.exec(rest);
    let owner: string | null = null;
    if (asset) {
      owner = asset[1];
      assetOwners.add(owner);
    } else if (rest.endsWith('.md') && rest.length > 3) {
      owner = rest.slice(0, -3);
      parses.add(owner);
    }
    if (owner === null) continue;
    if (!primaries.has(owner) && !omitted.has(owner)) orphans.push(n);
  }

  for (const owner of assetOwners) {
    if (!parses.has(owner)) notes.push(`assets for "${owner}" have no matching parsed .md`);
  }
  return { ok: orphans.length === 0, orphans, notes };
}
