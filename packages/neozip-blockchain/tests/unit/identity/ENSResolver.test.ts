import { ENSResolver, AddressResolver, ENS_PUBKEY_RECORD } from '../../../src/identity/ENSResolver';
import { IdentityResolverDispatch } from '../../../src/identity/IdentityResolverDispatch';
import { LitPkpResolver } from '../../../src/identity/LitPkpResolver';

// Valid uncompressed secp256k1 public key (65 bytes = "04" + 128 hex chars)
const VALID_PUBKEY = '04' + 'ab'.repeat(64);

const mockProvider = (opts: {
  resolverExists?: boolean;
  address?: string | null;
  pubKey?: string | null;
} = {}) => {
  const { resolverExists = true, address = '0x1234567890abcdef1234567890abcdef12345678', pubKey = VALID_PUBKEY } = opts;
  return {
    getResolver: jest.fn().mockResolvedValue(
      resolverExists
        ? { getText: jest.fn().mockResolvedValue(pubKey) }
        : null,
    ),
    resolveName: jest.fn().mockResolvedValue(address),
  } as any;
};

describe('ENSResolver', () => {
  it('canResolve returns true for .eth names', () => {
    const r = new ENSResolver(mockProvider());
    expect(r.canResolve('alice.eth')).toBe(true);
    expect(r.canResolve('alice.com')).toBe(false);
    expect(r.canResolve('0xabcd')).toBe(false);
  });

  it('resolves a valid ENS name with a published public key', async () => {
    const provider = mockProvider();
    const r = new ENSResolver(provider);
    const result = await r.resolve('alice.eth');

    expect(result.identity).toBe('alice.eth');
    expect(result.identityType).toBe('ens');
    expect(result.address).toBe('0x1234567890AbcdEF1234567890aBcdef12345678');
    expect(result.publicKeyHex).toBe(VALID_PUBKEY);
    expect(provider.getResolver).toHaveBeenCalledWith('alice.eth');
  });

  it('throws when no ENS resolver exists', async () => {
    const r = new ENSResolver(mockProvider({ resolverExists: false }));
    await expect(r.resolve('nobody.eth')).rejects.toThrow(/No ENS resolver/);
  });

  it('throws when address does not resolve', async () => {
    const r = new ENSResolver(mockProvider({ address: null }));
    await expect(r.resolve('gone.eth')).rejects.toThrow(/does not resolve/);
  });

  it('throws when no public key text record is set', async () => {
    const r = new ENSResolver(mockProvider({ pubKey: null }));
    await expect(r.resolve('nopub.eth')).rejects.toThrow(ENS_PUBKEY_RECORD);
  });

  it('throws when the public key is malformed', async () => {
    const r = new ENSResolver(mockProvider({ pubKey: 'not-a-key' }));
    await expect(r.resolve('bad.eth')).rejects.toThrow(/uncompressed secp256k1/);
  });
});

describe('AddressResolver', () => {
  const resolver = new AddressResolver();

  it('canResolve returns true for 0x… 40-hex addresses', () => {
    expect(resolver.canResolve('0x1234567890abcdef1234567890abcdef12345678')).toBe(true);
    expect(resolver.canResolve('alice.eth')).toBe(false);
  });

  it('resolves when public key is provided', async () => {
    const result = await resolver.resolve(
      '0x1234567890abcdef1234567890abcdef12345678',
      VALID_PUBKEY,
    );
    expect(result.identityType).toBe('address');
    expect(result.publicKeyHex).toBe(VALID_PUBKEY);
  });

  it('throws when public key is omitted', async () => {
    await expect(
      resolver.resolve('0x1234567890abcdef1234567890abcdef12345678'),
    ).rejects.toThrow(/public key must be supplied/i);
  });
});

describe('IdentityResolverDispatch', () => {
  it('dispatches to ENSResolver for .eth names', async () => {
    const dispatch = new IdentityResolverDispatch(mockProvider());
    const result = await dispatch.resolve('alice.eth');
    expect(result.identityType).toBe('ens');
  });

  it('dispatches to AddressResolver for 0x addresses', async () => {
    const dispatch = new IdentityResolverDispatch();
    const result = await dispatch.resolve(
      '0x1234567890abcdef1234567890abcdef12345678',
      VALID_PUBKEY,
    );
    expect(result.identityType).toBe('address');
  });

  it('throws for unrecognised identity format', async () => {
    const dispatch = new IdentityResolverDispatch();
    await expect(dispatch.resolve('not-a-valid-id')).rejects.toThrow(/No identity resolver/);
  });

  it('dispatches Lit PKP when LitPkpResolver is registered', async () => {
    const dispatch = new IdentityResolverDispatch(undefined, [new LitPkpResolver()]);
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    const result = await dispatch.resolve(`pkp:${addr}`, VALID_PUBKEY);
    expect(result.identityType).toBe('lit-pkp');
    expect(result.address).toBeTruthy();
    expect(result.publicKeyHex).toBe(VALID_PUBKEY);
  });
});
