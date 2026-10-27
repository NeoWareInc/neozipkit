import type { NeoZipManifest } from './types';

export function createManifest(opts: {
  specVersion: string;
  profiles?: string[];
  createdAt?: string;
}): NeoZipManifest {
  const m: NeoZipManifest = {
    format: 'neozip',
    specVersion: opts.specVersion,
    createdAt: opts.createdAt ?? new Date().toISOString(),
  };
  if (opts.profiles && opts.profiles.length > 0) {
    m.profiles = [...new Set(opts.profiles)];
  }
  return m;
}

const HEAD_KEYS = ['format', 'specVersion', 'createdAt', 'profiles'];

/**
 * Deterministic JSON: `format`, `specVersion`, `createdAt`, `profiles`, then all
 * remaining top-level keys sorted (UTF-16 code-unit order). Nested objects keep
 * their own order. Two-space indent plus trailing newline.
 */
export function serializeManifest(m: NeoZipManifest): string {
  const ordered: Record<string, unknown> = {};
  for (const k of HEAD_KEYS) {
    if (m[k] !== undefined) ordered[k] = m[k];
  }
  const rest = Object.keys(m)
    .filter((k) => !HEAD_KEYS.includes(k) && m[k] !== undefined)
    .sort();
  for (const k of rest) ordered[k] = m[k];
  return JSON.stringify(ordered, null, 2) + '\n';
}

/** Returns a new manifest with `profile` appended (no-op when already present). */
export function addProfile(m: NeoZipManifest, profile: string): NeoZipManifest {
  const profiles = m.profiles ?? [];
  if (profiles.includes(profile)) return { ...m, profiles: [...profiles] };
  return { ...m, profiles: [...profiles, profile] };
}

/**
 * Returns a new manifest without `profile` (no-op when absent). The `profiles`
 * key is dropped when the list becomes empty.
 */
export function removeProfile(m: NeoZipManifest, profile: string): NeoZipManifest {
  const next = (m.profiles ?? []).filter((p) => p !== profile);
  const { profiles: _drop, ...rest } = m;
  void _drop;
  return next.length > 0 ? { ...rest, profiles: next } as NeoZipManifest : (rest as NeoZipManifest);
}
