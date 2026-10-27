import type { NeoZipManifest } from './types';

export type ManifestBlockSpec = {
  /** Return error strings for the block value (empty / void = valid). */
  validate?: (value: unknown, manifest: NeoZipManifest) => string[] | void;
  /** Lowest `specVersion` (major.minor.patch; pre-release suffix ignored) allowed to carry the block. */
  minSpecVersion?: string;
  /** Profiles that must be declared whenever the block is present. */
  requiredProfiles?: string[];
};

const registry = new Map<string, ManifestBlockSpec>();

/** Register (or replace) a top-level manifest block such as `ai`. In-memory only. */
export function registerManifestBlock(name: string, spec: ManifestBlockSpec = {}): void {
  if (!name) throw new Error('manifest block name is required');
  registry.set(name, spec);
}

export function getRegisteredBlocks(): ReadonlyMap<string, ManifestBlockSpec> {
  return new Map(registry);
}

/** Test helper: clear all registrations. */
export function clearRegisteredBlocks(): void {
  registry.clear();
}

function parseVersion(v: string): number[] {
  const core = v.split(/[-+]/)[0];
  const parts = core.split('.').map((n) => parseInt(n, 10));
  return [0, 1, 2].map((i) => (Number.isFinite(parts[i]) ? parts[i] : 0));
}

/** Compare `major.minor.patch` (pre-release suffixes ignored): -1, 0, 1. */
export function compareSpecVersion(a: string, b: string): -1 | 0 | 1 {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (x[i] < y[i]) return -1;
    if (x[i] > y[i]) return 1;
  }
  return 0;
}

/**
 * Check every registered block present in `m` against its spec (version gate,
 * required profiles, custom validator). Blocks that are not registered are ignored.
 */
export function validateManifestBlocks(m: NeoZipManifest): string[] {
  const errors: string[] = [];
  for (const [name, spec] of registry) {
    if (m[name] === undefined) continue;
    if (spec.minSpecVersion && compareSpecVersion(m.specVersion, spec.minSpecVersion) < 0) {
      errors.push(`${name}: requires specVersion >= ${spec.minSpecVersion}`);
    }
    for (const p of spec.requiredProfiles ?? []) {
      if (!(m.profiles ?? []).includes(p)) {
        errors.push(`${name}: requires profile "${p}"`);
      }
    }
    const extra = spec.validate?.(m[name], m);
    if (extra) errors.push(...extra.map((e) => `${name}: ${e}`));
  }
  return errors;
}
