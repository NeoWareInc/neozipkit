/**
 * Load NeoZip Token Service / wallet connection settings (Node only).
 *
 * Environment variables win. The CLI connection store (`~/.neozip/connection`,
 * or `NEOZIP_CONNECTION_DIR`, or `opts.dir`) is read only for **public** fields
 * (`public.json`: email, default network, Token Service origin).
 *
 * Secrets are NOT read from disk: the access token and wallet key live in
 * `secrets.enc`, which is encrypted by the NeoZip CLI. Decrypting it is out of
 * scope for this library — set `NEOZIP_TOKEN_SERVICE_ACCESS_TOKEN` and
 * `NEOZIP_WALLET_PASSKEY` (preferred) or run the CLI to perform the operation.
 * The macOS keychain is never touched.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface NeozipConnection {
  email?: string;
  accessToken?: string;
  walletPrivateKey?: string;
  network?: string;
  tokenServiceUrl?: string;
}

export interface LoadNeozipConnectionOptions {
  /**
   * Connection store directory. Defaults to `NEOZIP_CONNECTION_DIR`, then
   * `~/.neozip/connection`.
   */
  dir?: string;
  /** Skip the on-disk public.json lookup (env only). */
  envOnly?: boolean;
}

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function readJson(file: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Public fields from the active connection's `public.json`, when present. */
function readPublicConnection(dir: string): NeozipConnection {
  const manifest = readJson(path.join(dir, 'manifest.json'));
  let id = str(manifest?.activeConnectionId);
  if (!id && manifest?.workspaces && typeof manifest.workspaces === 'object') {
    for (const ws of Object.values<any>(manifest.workspaces)) {
      id = str(ws?.activeConnectionId);
      if (id) break;
    }
  }
  if (!id) return {};
  // Guard against path traversal via a tampered manifest.
  if (id !== path.basename(id)) return {};

  const pub = readJson(path.join(dir, 'connections', id, 'public.json'));
  if (!pub) return {};
  return {
    email: pub.emailVerified === true ? str(pub.email) : undefined,
    network: str(pub.defaultNetwork),
    tokenServiceUrl: str(pub.tokenServiceOrigin),
  };
}

/**
 * @returns The merged connection, or `null` when nothing was found.
 *
 * Env: `NEOZIP_RECIPIENT_EMAIL`, `NEOZIP_TOKEN_SERVICE_ACCESS_TOKEN`,
 * `NEOZIP_WALLET_PASSKEY`, `TOKEN_SERVICE_URL`, `TOKEN_SERVICE_NETWORK`.
 */
export function loadNeozipConnection(opts: LoadNeozipConnectionOptions = {}): NeozipConnection | null {
  const fromEnv: NeozipConnection = {
    email: env('NEOZIP_RECIPIENT_EMAIL'),
    accessToken: env('NEOZIP_TOKEN_SERVICE_ACCESS_TOKEN'),
    walletPrivateKey: env('NEOZIP_WALLET_PASSKEY'),
    network: env('TOKEN_SERVICE_NETWORK'),
    tokenServiceUrl: env('TOKEN_SERVICE_URL'),
  };

  let fromDisk: NeozipConnection = {};
  if (!opts.envOnly) {
    const dir =
      opts.dir ?? env('NEOZIP_CONNECTION_DIR') ?? path.join(os.homedir(), '.neozip', 'connection');
    fromDisk = readPublicConnection(dir);
  }

  const merged: NeozipConnection = {};
  for (const key of ['email', 'accessToken', 'walletPrivateKey', 'network', 'tokenServiceUrl'] as const) {
    const value = fromEnv[key] ?? fromDisk[key];
    if (value !== undefined) merged[key] = value;
  }
  return Object.keys(merged).length > 0 ? merged : null;
}
