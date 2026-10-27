// ======================================
//  manifest/types.ts — META-INF/manifest.json (APPNOTE §4)
// ======================================

/** Envelope fields (§4.1 / §4.2); registries (`ai`, future blocks) ride in the index signature. */
export interface NeoZipManifest {
  format: 'neozip';
  /** APPNOTE version the package was written for, e.g. `"0.3.0"`. */
  specVersion: string;
  /** ISO-8601 creation time (UTC recommended). */
  createdAt: string;
  /** Feature claims: `"integrity"`, `"zipwiki"`, `"tokenized"`, … */
  profiles?: string[];
  /** Registries such as `ai`; unknown keys are preserved. */
  [registry: string]: unknown;
}

export type ManifestEntryClass = 'meta' | 'ai-namespace' | 'primary';

export type ManifestValidation =
  | { ok: true; value: NeoZipManifest }
  | { ok: false; errors: string[] };

export type PairingResult = {
  ok: boolean;
  /** Entry names that failed pairing (§3.2). */
  orphans: string[];
  /** Non-fatal observations (e.g. assets without a parse). */
  notes: string[];
};
