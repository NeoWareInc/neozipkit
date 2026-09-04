import { LitPkpResolver, LIT_PKP_IDENTITY_PREFIX } from '../../../src/identity/LitPkpResolver';

const VALID_PUB = '04' + 'ab'.repeat(64);

describe('LitPkpResolver', () => {
  const resolver = new LitPkpResolver();

  it('exposes expected identity prefix', () => {
    expect(LIT_PKP_IDENTITY_PREFIX).toBe('pkp:');
  });

  it('canResolve accepts pkp:0x + 40 hex', () => {
    expect(resolver.canResolve('pkp:0x' + 'ab'.repeat(20))).toBe(true);
    expect(resolver.canResolve('  pkp:0x' + 'ab'.repeat(20) + '  ')).toBe(true);
  });

  it('canResolve rejects raw address and ENS', () => {
    expect(resolver.canResolve('0x' + 'ab'.repeat(20))).toBe(false);
    expect(resolver.canResolve('alice.eth')).toBe(false);
  });

  it('resolve returns lit-pkp identity with checksummed address', async () => {
    const id = 'pkp:0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
    const r = await resolver.resolve(id, VALID_PUB);
    expect(r.identityType).toBe('lit-pkp');
    expect(r.identity).toBe(id);
    expect(r.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(r.publicKeyHex).toBe(VALID_PUB);
  });

  it('throws without publicKeyHex', async () => {
    await expect(resolver.resolve('pkp:0x' + 'cd'.repeat(20))).rejects.toThrow(/public key must be supplied/i);
  });

  it('throws for malformed identity', async () => {
    await expect(resolver.resolve('pkp:0x123', VALID_PUB)).rejects.toThrow(/Invalid Lit PKP identity/i);
  });
});
