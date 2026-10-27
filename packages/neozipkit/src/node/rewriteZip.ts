// ======================================
//  rewriteZip.ts — plan-based ZIP rewrite (keep / replace / add / drop)
//  Copyright (c) 2026 NeoWare, Inc. All rights reserved.
// ======================================
// Kept members are copied byte-for-byte (compressed payload, CRC, sizes, DOS
// time, and the central extra field incl. 0x014E / 0x014F) via
// ZipReaderNode.readRaw + `precompressed`. Output goes to `<dest>.tmp.<pid>`
// and is renamed over `dest` on success, so a failed rewrite never leaves a
// half-written archive.
//
// Limitations: kept payloads are held in memory while the new archive is framed
// (the writer is not incremental yet). Local headers of kept members are
// regenerated from the central record, so local-only extras are not carried
// over. Zip64 records are regenerated from sizes. Per-entry comments are dropped
// (ZipEntry writes them ahead of the extra field, which standard readers misparse).
// Encrypted members cannot be
// re-framed (their bit flags are not preserved) and are rejected.

import { renameSync, rmSync } from 'fs';
import { HDR_ID } from '../core/constants/Headers';
import {
  canonicalReservedMetaName,
  isMetaInfPath,
  asciiPathEqualsIgnoreCase,
} from '../core/constants/MetaPaths';
import { replaceExtraField } from '../core/extra';
import { writeZipFileSync, type ZipBufferMember } from './buildZipBuffer';
import { ZipReaderNode, type ZipReaderEntry } from './ZipReaderNode';

type NewMemberOptions = {
  method?: 0 | 8 | 93;
  level?: number;
  additionalExtra?: Buffer;
  useSHA256?: boolean;
  mtime?: Date;
};

export type RewriteMember =
  | { action: 'keep'; name: string }
  | ({ action: 'replace'; name: string; data: Buffer } & NewMemberOptions)
  | ({ action: 'add'; name: string; data: Buffer } & NewMemberOptions)
  | { action: 'drop'; name: string };

export type RewritePlan = {
  /**
   * Final central-directory order. Names not listed follow in default order
   * (source order, then adds). Unknown names throw.
   */
  order?: string[];
  /**
   * Explicit actions. Source entries that are not mentioned are **kept**
   * (same as the array form below).
   */
  members?: RewriteMember[];
  /** Assert these source entries exist (kept entries are the default anyway). */
  keep?: string[];
  /** Replace payload in place. Throws when the entry is missing. */
  replace?: Array<{ name: string; data: Buffer } & NewMemberOptions>;
  /** Remove entries. Missing names are ignored (idempotent). */
  drop?: string[];
  /** Append new entries. Throws when the name already exists (use `replace`). */
  add?: Array<{ name: string; data: Buffer } & NewMemberOptions>;
};

function isAscii(s: string): boolean {
  return !/[^\x00-\x7E]/.test(s);
}

function sameName(a: string, b: string): boolean {
  return a === b || (canonicalReservedMetaName(a) !== null && asciiPathEqualsIgnoreCase(a, b));
}

function normalizePlan(plan: RewritePlan): RewriteMember[] {
  const out: RewriteMember[] = [...(plan.members ?? [])];
  for (const name of plan.keep ?? []) out.push({ action: 'keep', name });
  for (const r of plan.replace ?? []) out.push({ action: 'replace', ...r });
  for (const name of plan.drop ?? []) out.push({ action: 'drop', name });
  for (const a of plan.add ?? []) out.push({ action: 'add', ...a });
  return out;
}

function keptMember(reader: ZipReaderNode, e: ZipReaderEntry): ZipBufferMember {
  if (e.flags & 1) {
    throw new Error(`cannot rewrite encrypted entry: ${e.name}`);
  }
  const raw = reader.readRaw(e);
  const nonAscii = !isAscii(e.name);
  // Names that need UTF-8 are written verbatim (bit 11); the old 0x7075 record, if
  // any, would be redundant (and its CRC refers to the old header bytes).
  const extra = nonAscii ? replaceExtraField(raw.centralExtra, HDR_ID.UNICODE_PATH, null) : raw.centralExtra;
  return {
    name: e.name,
    dosTime: e.dosTime,
    dosDate: e.dosDate,
    utf8Flag: nonAscii,
    externalAttr: e.externalAttr,
    internalAttr: e.internalAttr,
    precompressed: {
      method: raw.method,
      data: raw.compressed,
      crc32: raw.crc32,
      uncompressedSize: raw.uncompressedSize,
      extra: extra.length > 0 ? extra : undefined,
    },
  };
}

function newMember(
  spec: { name: string; data: Buffer } & NewMemberOptions,
  prior: ZipReaderEntry | null
): ZipBufferMember {
  const hadSha = prior ? (prior.centralExtra.length > 0 && hasId(prior.centralExtra, HDR_ID.SHA256)) : false;
  const priorMethod =
    prior && (prior.method === 0 || prior.method === 8 || prior.method === 93)
      ? (prior.method as 0 | 8 | 93)
      : undefined;
  return {
    name: canonicalReservedMetaName(spec.name) ?? spec.name,
    data: spec.data,
    method: spec.method ?? priorMethod,
    level: spec.level,
    additionalExtra: spec.additionalExtra,
    useSHA256: spec.useSHA256 ?? (hadSha ? true : undefined),
    mtime: spec.mtime,
    utf8Flag: !isAscii(spec.name),
    externalAttr: prior?.externalAttr,
    internalAttr: prior?.internalAttr,
  };
}

function hasId(extra: Buffer, id: number): boolean {
  for (let i = 0; i + 4 <= extra.length; ) {
    if (extra.readUInt16LE(i) === id) return true;
    i += 4 + extra.readUInt16LE(i + 2);
  }
  return false;
}

/**
 * Rewrite `srcPath` into `destPath` according to `plan`. `destPath` may equal
 * `srcPath`. The result is written to a temp file next to `destPath` and renamed.
 */
export async function rewriteZip(
  srcPath: string,
  destPath: string,
  plan: RewritePlan
): Promise<void> {
  const reader = ZipReaderNode.open(srcPath);
  const tmp = `${destPath}.tmp.${process.pid}`;
  try {
    const source = reader.entries();
    const actions = normalizePlan(plan);

    const find = (name: string): ZipReaderEntry | null =>
      source.find((e) => e.name === name) ?? source.find((e) => sameName(e.name, name)) ?? null;

    // Resolve each action against source entries.
    const dropped = new Set<ZipReaderEntry>();
    const replaced = new Map<ZipReaderEntry, ZipBufferMember>();
    const added: ZipBufferMember[] = [];
    for (const a of actions) {
      if (a.action === 'keep') {
        if (!find(a.name)) throw new Error(`rewriteZip: keep: entry not found: ${a.name}`);
      } else if (a.action === 'drop') {
        const e = find(a.name);
        if (e) dropped.add(e);
      } else if (a.action === 'replace') {
        const e = find(a.name);
        if (!e) throw new Error(`rewriteZip: replace: entry not found: ${a.name}`);
        replaced.set(e, newMember(a, e));
      } else if (a.action === 'add') {
        if (find(a.name)) {
          throw new Error(`rewriteZip: add: entry already exists (use replace): ${a.name}`);
        }
        added.push(newMember(a, null));
      }
    }

    // Default order: source order, then adds in plan order.
    const out: ZipBufferMember[] = [];
    for (const e of source) {
      if (dropped.has(e) && !replaced.has(e)) continue;
      out.push(replaced.get(e) ?? keptMember(reader, e));
    }
    out.push(...added);

    const names = new Set<string>();
    for (const m of out) {
      if (names.has(m.name)) throw new Error(`rewriteZip: duplicate output name: ${m.name}`);
      names.add(m.name);
    }

    let ordered = out;
    if (plan.order && plan.order.length > 0) {
      const byName = new Map(out.map((m) => [m.name, m] as const));
      const listed: ZipBufferMember[] = [];
      for (const n of plan.order) {
        const m = byName.get(n) ?? byName.get(canonicalReservedMetaName(n) ?? n);
        if (!m) throw new Error(`rewriteZip: order: unknown entry: ${n}`);
        if (!listed.includes(m)) listed.push(m);
      }
      ordered = [...listed, ...out.filter((m) => !listed.includes(m))];
    }

    writeZipFileSync(tmp, ordered);
    reader.close();
    renameSync(tmp, destPath);
  } catch (err) {
    reader.close();
    rmSync(tmp, { force: true });
    throw err;
  }
}

/**
 * Add / replace / remove `META-INF/**` sidecars (TOKEN.NZIP, manifest.json, …)
 * while every other member stays byte-identical. Reserved names are written with
 * their canonical spelling; added sidecars are stored uncompressed. Existing
 * names are replaced, others appended; `remove` of a missing name is a no-op.
 *
 * `inPlace` (default true) rewrites `path` atomically. With `inPlace: false`,
 * `destPath` is required and `path` is left untouched.
 */
export async function applyMetaSidecars(
  path: string,
  opts: {
    add?: Array<{ name: string; bytes: Buffer }>;
    remove?: string[];
    inPlace?: boolean;
    destPath?: string;
  }
): Promise<void> {
  const inPlace = opts.inPlace !== false;
  if (!inPlace && !opts.destPath) {
    throw new Error('applyMetaSidecars: destPath is required when inPlace is false');
  }
  const dest = inPlace ? path : (opts.destPath as string);
  for (const n of [...(opts.add ?? []).map((a) => a.name), ...(opts.remove ?? [])]) {
    if (!isMetaInfPath(n)) {
      throw new Error(`applyMetaSidecars: not a META-INF/ path: ${n}`);
    }
  }
  const reader = ZipReaderNode.open(path);
  const existing = new Set<string>();
  for (const a of opts.add ?? []) {
    const e = reader.getEntry(a.name, { caseInsensitiveMeta: true });
    if (e) existing.add(a.name);
  }
  reader.close();

  const replace: Array<{ name: string; data: Buffer; method: 0 }> = [];
  const add: Array<{ name: string; data: Buffer; method: 0 }> = [];
  for (const a of opts.add ?? []) {
    (existing.has(a.name) ? replace : add).push({ name: a.name, data: a.bytes, method: 0 });
  }
  await rewriteZip(path, dest, { replace, add, drop: opts.remove });
}
