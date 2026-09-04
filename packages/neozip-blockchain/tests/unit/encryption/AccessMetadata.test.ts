import {
  buildAccessMetadata,
  serializeAccessMetadata,
  parseAccessMetadata,
  ACCESS_NZIP_PATH,
} from '../../../src/encryption/AccessMetadata';
import type { ResolvedIdentity } from '../../../src/identity/types';
import type { WrappedKeyResult } from '../../../src/encryption/types';

describe('AccessMetadata', () => {
  const resolved: ResolvedIdentity = {
    identity: 'alice.eth',
    identityType: 'ens',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    publicKeyHex: '04' + 'ab'.repeat(64),
  };

  const wrapped: WrappedKeyResult = {
    ciphertext: Buffer.from('encrypted-key-data').toString('base64'),
    ephemeralPublicKey: '04' + 'cd'.repeat(64),
    keyAlgorithm: 'ecies-secp256k1-aes256gcm',
  };

  it('ACCESS_NZIP_PATH is META-INF/ACCESS.NZIP', () => {
    expect(ACCESS_NZIP_PATH).toBe('META-INF/ACCESS.NZIP');
  });

  it('buildAccessMetadata creates valid metadata', () => {
    const meta = buildAccessMetadata([{ resolved, wrapped }]);
    expect(meta.version).toBe('1.0');
    expect(meta.scheme).toBe('ens-hybrid');
    expect(meta.recipients).toHaveLength(1);
    expect(meta.recipients[0].identity).toBe('alice.eth');
    expect(meta.recipients[0].wrappedKey).toBe(wrapped.ciphertext);
    expect(meta.encryption.method).toBe('neo-aes256');
    expect(meta.proVersion).toBeTruthy();
    expect(meta.created).toBeTruthy();
  });

  it('buildAccessMetadata can record WinZip AES when inner layer is aes256', () => {
    const meta = buildAccessMetadata([{ resolved, wrapped }], 'ens-hybrid', 'aes256');
    expect(meta.encryption.method).toBe('aes-256-winzip');
  });

  it('round-trips through serialize → parse', () => {
    const meta = buildAccessMetadata([{ resolved, wrapped }], 'address-hybrid');
    const buf = serializeAccessMetadata(meta);
    const parsed = parseAccessMetadata(buf);

    expect(parsed.version).toBe(meta.version);
    expect(parsed.scheme).toBe('address-hybrid');
    expect(parsed.recipients).toEqual(meta.recipients);
    expect(parsed.encryption).toEqual(meta.encryption);
    expect(parsed.created).toBe(meta.created);
  });

  it('parseAccessMetadata accepts a string', () => {
    const meta = buildAccessMetadata([{ resolved, wrapped }]);
    const json = JSON.stringify(meta, null, 2);
    const parsed = parseAccessMetadata(json);
    expect(parsed.recipients[0].identity).toBe('alice.eth');
  });

  it('parseAccessMetadata rejects missing recipients', () => {
    expect(() => parseAccessMetadata('{"version":"1.0","scheme":"ens-hybrid"}')).toThrow(
      /missing.*recipients/i,
    );
  });

  it('parseAccessMetadata rejects unknown identityType', () => {
    const bad = {
      version: '1.0',
      scheme: 'ens-hybrid',
      recipients: [
        {
          identity: 'x',
          identityType: 'not-a-real-type',
          resolvedAddress: '0x0000000000000000000000000000000000000000',
          publicKeyHex: '04' + 'ab'.repeat(64),
          wrappedKey: Buffer.from('x').toString('base64'),
          ephemeralPublicKey: '04' + 'cd'.repeat(64),
          keyAlgorithm: 'ecies-secp256k1-aes256gcm',
        },
      ],
      encryption: { method: 'aes-256-winzip' },
      created: new Date().toISOString(),
      proVersion: '0.1.0',
    };
    expect(() => parseAccessMetadata(JSON.stringify(bad))).toThrow(/identityType/i);
  });

  it('parseAccessMetadata rejects recipient with missing wrappedKey', () => {
    const bad = {
      version: '1.0',
      scheme: 'ens-hybrid',
      recipients: [{ identity: 'a.eth', identityType: 'ens', resolvedAddress: '0x0' }],
      encryption: { method: 'aes-256' },
      created: new Date().toISOString(),
      proVersion: '0.1.0',
    };
    expect(() => parseAccessMetadata(JSON.stringify(bad))).toThrow(/wrappedKey/);
  });

  it('accepts lit-pkp recipient records', () => {
    const pkp: ResolvedIdentity = {
      identity: 'pkp:0x' + 'cc'.repeat(20),
      identityType: 'lit-pkp',
      address: '0x' + 'Cc'.repeat(20),
      publicKeyHex: '04' + 'ef'.repeat(64),
    };
    const meta = buildAccessMetadata([{ resolved: pkp, wrapped }], 'lit-protocol');
    expect(meta.scheme).toBe('lit-protocol');
    const parsed = parseAccessMetadata(serializeAccessMetadata(meta));
    expect(parsed.recipients[0].identityType).toBe('lit-pkp');
  });

  it('supports multiple recipients', () => {
    const bob: ResolvedIdentity = {
      identity: '0xBBBB',
      identityType: 'address',
      address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      publicKeyHex: '04' + 'ee'.repeat(64),
    };
    const wrappedBob: WrappedKeyResult = {
      ciphertext: Buffer.from('bob-key').toString('base64'),
      ephemeralPublicKey: '04' + 'ff'.repeat(64),
      keyAlgorithm: 'ecies-secp256k1-aes256gcm',
    };

    const meta = buildAccessMetadata([
      { resolved, wrapped },
      { resolved: bob, wrapped: wrappedBob },
    ]);
    expect(meta.recipients).toHaveLength(2);

    const parsed = parseAccessMetadata(serializeAccessMetadata(meta));
    expect(parsed.recipients[0].identity).toBe('alice.eth');
    expect(parsed.recipients[1].identity).toBe('0xBBBB');
  });
});
