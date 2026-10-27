import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadNeozipConnection } from '../../src/node';

const ENV_KEYS = [
  'NEOZIP_RECIPIENT_EMAIL',
  'NEOZIP_TOKEN_SERVICE_ACCESS_TOKEN',
  'NEOZIP_WALLET_PASSKEY',
  'TOKEN_SERVICE_URL',
  'TOKEN_SERVICE_NETWORK',
  'NEOZIP_CONNECTION_DIR',
] as const;

describe('loadNeozipConnection', () => {
  const saved: Record<string, string | undefined> = {};
  let dir: string;

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neozip-conn-'));
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeStore(pub: object, id = 'abc') {
    fs.mkdirSync(path.join(dir, 'connections', id), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ version: 1, activeConnectionId: id, workspaces: {} })
    );
    fs.writeFileSync(path.join(dir, 'connections', id, 'public.json'), JSON.stringify(pub));
    fs.writeFileSync(path.join(dir, 'connections', id, 'secrets.enc'), 'ciphertext-never-read');
  }

  it('returns null when nothing is configured', () => {
    expect(loadNeozipConnection({ dir })).toBeNull();
  });

  it('reads the environment', () => {
    process.env.NEOZIP_RECIPIENT_EMAIL = 'me@example.com';
    process.env.NEOZIP_TOKEN_SERVICE_ACCESS_TOKEN = 'tok';
    process.env.NEOZIP_WALLET_PASSKEY = '0xabc';
    process.env.TOKEN_SERVICE_URL = 'https://ts.invalid';
    process.env.TOKEN_SERVICE_NETWORK = 'base-sepolia';
    expect(loadNeozipConnection({ dir })).toEqual({
      email: 'me@example.com',
      accessToken: 'tok',
      walletPrivateKey: '0xabc',
      network: 'base-sepolia',
      tokenServiceUrl: 'https://ts.invalid',
    });
  });

  it('fills public fields from the CLI connection store; env wins; secrets stay unread', () => {
    writeStore({
      email: 'store@example.com',
      emailVerified: true,
      defaultNetwork: 'base-mainnet',
      tokenServiceOrigin: 'https://store.invalid',
    });
    expect(loadNeozipConnection({ dir })).toEqual({
      email: 'store@example.com',
      network: 'base-mainnet',
      tokenServiceUrl: 'https://store.invalid',
    });

    process.env.TOKEN_SERVICE_NETWORK = 'base-sepolia';
    expect(loadNeozipConnection({ dir })?.network).toBe('base-sepolia');
    expect(loadNeozipConnection({ dir })).not.toHaveProperty('accessToken');
    expect(loadNeozipConnection({ dir })).not.toHaveProperty('walletPrivateKey');
  });

  it('ignores an unverified store email, honours NEOZIP_CONNECTION_DIR, and envOnly', () => {
    writeStore({ email: 'u@example.com', emailVerified: false, defaultNetwork: 'base-sepolia' });
    process.env.NEOZIP_CONNECTION_DIR = dir;
    expect(loadNeozipConnection()).toEqual({ network: 'base-sepolia' });
    expect(loadNeozipConnection({ envOnly: true })).toBeNull();
  });

  it('survives a corrupt store and a path-traversal manifest', () => {
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{not json');
    expect(loadNeozipConnection({ dir })).toBeNull();
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ activeConnectionId: '../../etc', workspaces: {} })
    );
    expect(loadNeozipConnection({ dir })).toBeNull();
  });
});
