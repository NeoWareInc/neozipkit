import { ZipReaderNode, matchMerkleRootFromReader } from 'neozipkit/node';
import { verifyDigest } from '../token-service/TokenServiceHelpers';
import { verifyMerkleProofLocal } from '../token-service/TokenServiceAPI';
import { ZipkitVerifier } from '../core/ZipkitVerifier';
import {
  computeRoot,
  declaredRoot,
  normalizeRoot,
  readSidecars,
  sidecarKind,
  tryNormalizeRoot,
  type SidecarKind,
} from './internal';

export interface VerifyArchiveOptions {
  /**
   * Contact the Token Service / chain (default `false`). Offline mode only checks
   * the Merkle binding and, for `TIMESTAMP.NZIP`, the embedded proof.
   */
  online?: boolean;
  /** RPC URL index for on-chain token verification (default 0). */
  rpcUrlIndex?: number;
  /** Token Service URL override (defaults to the URL stored in the sidecar). */
  serverUrl?: string;
  /**
   * Precomputed v1 Merkle root of the archive's current content. When given,
   * the archive content is not re-read; the caller vouches for the root.
   */
  merkleRoot?: string;
  debug?: boolean;
}

export type VerifyArchiveStatus =
  /** No Token Service sidecar. */
  | 'none'
  /** Sidecar root does not match the archive content (AppNote §8.6: proof invalid). */
  | 'merkle-mismatch'
  /** A member failed CRC / size / SHA-256 checks while hashing. */
  | 'integrity-error'
  /** `TS-SUBMIT.NZIP` bound to the content; not confirmed. */
  | 'pending'
  /** `TS-SUBMIT.NZIP` bound to the content and the server reports it confirmed — run `upgradeTimestamp`. */
  | 'upgradable'
  /** `TIMESTAMP.NZIP` proof checks out locally; the server was not asked (or unreachable). */
  | 'confirmed-offline'
  /** `TIMESTAMP.NZIP` proof checks out locally and the server confirms it. */
  | 'confirmed'
  /** The server does not confirm a locally valid timestamp proof. */
  | 'unconfirmed'
  /** `TIMESTAMP.NZIP` Merkle proof does not verify. */
  | 'invalid-proof'
  /** `TIMESTAMP.NZIP` lacks proof fields (`merkleProof` / `merkleRoot`). */
  | 'incomplete-proof'
  /** `TOKEN.NZIP` bound to the content; chain not checked. */
  | 'token-unverified'
  /** `TOKEN.NZIP` verified on-chain. */
  | 'token-valid'
  /** `TOKEN.NZIP` failed on-chain verification. */
  | 'token-invalid';

export interface VerifyArchiveResult {
  /** Highest-precedence sidecar found: token > timestamp > submit (AppNote §8.4). */
  kind: SidecarKind;
  merkle: {
    /** `'v1'` or `'v0'` when matched by content; unset when a precomputed root was used. */
    algorithm?: string;
    /** `'high'` (v1) or `'legacy'` (v0) when matched by content. */
    security?: string;
    /** Sidecar's declared root equals the archive's current root. `false` when there is no sidecar. */
    match: boolean;
    /** The archive's computed (or supplied) root; `null` when it could not be computed. */
    root?: string | null;
  };
  status: VerifyArchiveStatus;
  details?: Record<string, unknown>;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function bindMerkle(
  reader: ZipReaderNode,
  declared: string | null,
  supplied: string | undefined
): Promise<{ merkle: VerifyArchiveResult['merkle']; error?: string }> {
  if (supplied) {
    const root = normalizeRoot(supplied);
    return { merkle: { match: declared !== null && root === declared, root } };
  }
  try {
    if (declared) {
      const hit = await matchMerkleRootFromReader(reader, declared);
      if (hit) {
        return {
          merkle: { algorithm: hit.algorithm, security: hit.security, match: true, root: declared },
        };
      }
    }
    return { merkle: { match: false, root: await computeRoot(reader) } };
  } catch (err) {
    return { merkle: { match: false, root: null }, error: errMsg(err) };
  }
}

/**
 * Verify the Token Service proofs carried by an archive (any ZIP): which sidecar
 * is present, whether it is bound to the current content (Merkle), and, with
 * `online`, whether the server / chain confirm it.
 *
 * Pass a path or an already-open `ZipReaderNode` (left open for the caller).
 * Tampered content never throws: it yields `merkle.match === false` with
 * `status` `'merkle-mismatch'` or `'integrity-error'`.
 */
export async function verifyArchive(
  pathOrReader: string | ZipReaderNode,
  options: VerifyArchiveOptions = {}
): Promise<VerifyArchiveResult> {
  const owned = typeof pathOrReader === 'string';
  const reader = typeof pathOrReader === 'string' ? ZipReaderNode.open(pathOrReader) : pathOrReader;
  try {
    const sidecars = readSidecars(reader);
    const kind = sidecarKind(sidecars);
    const declared = declaredRoot(kind, sidecars);

    const { merkle, error } = await bindMerkle(reader, declared, options.merkleRoot);

    if (kind === 'none') {
      return {
        kind,
        merkle: { ...merkle, match: false },
        status: 'none',
        ...(error ? { details: { error } } : {}),
      };
    }

    if (!merkle.match) {
      return {
        kind,
        merkle,
        status: error ? 'integrity-error' : 'merkle-mismatch',
        details: { declaredRoot: declared, ...(error ? { error } : {}) },
      };
    }

    const online = options.online === true;

    if (kind === 'submit') {
      const submit = sidecars.submit!;
      if (!online) {
        return { kind, merkle, status: 'pending', details: { metadata: submit, online: 'skipped' } };
      }
      try {
        const res = await verifyDigest(
          declared!,
          submit.chainId && submit.chainId > 0 ? submit.chainId : undefined,
          submit.batchId ?? undefined,
          undefined,
          { serverUrl: options.serverUrl ?? submit.serverUrl, debug: options.debug }
        );
        return {
          kind,
          merkle,
          status: res.verified ? 'upgradable' : 'pending',
          details: { metadata: submit, online: res },
        };
      } catch (err) {
        return { kind, merkle, status: 'pending', details: { metadata: submit, onlineError: errMsg(err) } };
      }
    }

    if (kind === 'timestamp') {
      const ts = sidecars.timestamp!;
      const batchRoot = tryNormalizeRoot(ts.merkleRoot);
      if (!ts.merkleProof || !batchRoot) {
        return { kind, merkle, status: 'incomplete-proof', details: { metadata: ts } };
      }
      const proofOk = verifyMerkleProofLocal(declared!, batchRoot, ts.merkleProof);
      if (!proofOk) {
        return { kind, merkle, status: 'invalid-proof', details: { metadata: ts } };
      }
      if (!online) {
        return { kind, merkle, status: 'confirmed-offline', details: { metadata: ts, online: 'skipped' } };
      }
      try {
        const res = await verifyDigest(
          declared!,
          ts.chainId && ts.chainId > 0 ? ts.chainId : undefined,
          ts.batchId ?? undefined,
          undefined,
          { serverUrl: options.serverUrl ?? ts.serverUrl, debug: options.debug }
        );
        return {
          kind,
          merkle,
          status: res.verified ? 'confirmed' : 'unconfirmed',
          details: { metadata: ts, online: res },
        };
      } catch (err) {
        return {
          kind,
          merkle,
          status: 'confirmed-offline',
          details: { metadata: ts, onlineError: errMsg(err) },
        };
      }
    }

    // token
    const token = sidecars.token!;
    const proof = token.timestampProof as
      | { digest?: string; batchMerkleRoot?: string; merkleProof?: string[] }
      | undefined;
    const timestampProofValid =
      proof?.digest && proof.batchMerkleRoot && Array.isArray(proof.merkleProof)
        ? verifyMerkleProofLocal(proof.digest, proof.batchMerkleRoot, proof.merkleProof)
        : undefined;

    if (!online) {
      return {
        kind,
        merkle,
        status: 'token-unverified',
        details: { metadata: token, timestampProofValid, online: 'skipped' },
      };
    }

    const verifier = new ZipkitVerifier({ debug: options.debug });
    const extracted = await verifier.extractTokenMetadata(sidecars.tokenBytes!);
    if (!extracted.success || !extracted.metadata) {
      return {
        kind,
        merkle,
        status: 'token-invalid',
        details: { metadata: token, timestampProofValid, error: extracted.error },
      };
    }
    const result = await verifier.verifyToken(
      extracted.metadata,
      merkle.root ?? declared,
      { debug: options.debug },
      options.rpcUrlIndex ?? 0
    );
    return {
      kind,
      merkle,
      status: result.success ? 'token-valid' : 'token-invalid',
      details: { metadata: token, timestampProofValid, verification: result },
    };
  } finally {
    if (owned) reader.close();
  }
}
