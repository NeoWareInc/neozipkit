/**
 * Tests for the Token Service account/funding/identity HTTP clients and the
 * shared http.ts utilities (Bearer auth, error extraction, expiry parsing).
 */

import {
  normalizeServerUrl,
  genericAuthErrorMessage,
  extractError,
  parseAccessTokenExpiry,
  formatTokenServiceFetchError,
  safeJson,
  pickString,
} from '../../src/token-service/http';
import {
  requestWalletLoginChallenge,
  walletLogin,
  WalletLoginUnavailableError,
} from '../../src/token-service/TokenServiceAccountAuth';
import {
  getFundingPolicy,
  requestFundingGrant,
  FundingUnavailableError,
} from '../../src/token-service/TokenServiceFunding';
import {
  DEFAULT_RECIPIENT_SUITE,
  IdentityKeyConflictError,
} from '../../src/token-service/TokenServiceIdentity';

const BASE = 'https://ts.example.com';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function emptyResponse(status: number): Response {
  return new Response('', { status });
}

describe('http utilities', () => {
  describe('normalizeServerUrl', () => {
    it('strips trailing slashes', () => {
      expect(normalizeServerUrl('https://a.com/')).toBe('https://a.com');
      expect(normalizeServerUrl('https://a.com///')).toBe('https://a.com');
    });
    it('falls back to the default when empty', () => {
      expect(normalizeServerUrl()).toBe('https://testnet.token-service.neozip.io');
    });
  });

  describe('genericAuthErrorMessage', () => {
    it('returns a message for 401/403 and null otherwise', () => {
      expect(genericAuthErrorMessage(401)).toMatch(/HTTP 401/);
      expect(genericAuthErrorMessage(403)).toMatch(/HTTP 403/);
      expect(genericAuthErrorMessage(500)).toBeNull();
    });
    it('contains no product-specific recovery command', () => {
      expect(genericAuthErrorMessage(401)).not.toMatch(/neozip connect/);
    });
  });

  describe('extractError', () => {
    it('prefers error then message from the body', () => {
      expect(extractError({ error: 'boom' }, 'fallback')).toBe('boom');
      expect(extractError({ message: 'hi' }, 'fallback')).toBe('hi');
      expect(extractError(null, 'fallback')).toBe('fallback');
    });
    it('uses a generic auth message for 401/403', () => {
      expect(extractError({ error: 'nope' }, 'fallback', { status: 401 })).toMatch(/HTTP 401/);
    });
  });

  describe('parseAccessTokenExpiry', () => {
    it('handles seconds, milliseconds, and relative expiry', () => {
      expect(parseAccessTokenExpiry({ expiresAt: 1_700_000_000 })).toBe(1_700_000_000_000);
      expect(parseAccessTokenExpiry({ expiresAt: 1_700_000_000_000 })).toBe(1_700_000_000_000);
      const before = Date.now();
      const rel = parseAccessTokenExpiry({ expiresIn: 60 })!;
      expect(rel).toBeGreaterThanOrEqual(before + 60_000 - 50);
      expect(parseAccessTokenExpiry({})).toBeNull();
    });
  });

  describe('formatTokenServiceFetchError', () => {
    it('reports unreachable on network errors', () => {
      const err = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
      expect(formatTokenServiceFetchError(BASE, err)).toMatch(/unreachable/);
    });
    it('passes through other messages', () => {
      expect(formatTokenServiceFetchError(BASE, new Error('weird'))).toMatch(/weird/);
    });
  });

  describe('pickString', () => {
    it('returns the first non-empty string', () => {
      expect(pickString({ a: '', b: 'x' }, 'a', 'b')).toBe('x');
      expect(pickString({ a: 1 } as any, 'a')).toBeNull();
    });
  });

});

describe('safeJson', () => {
  it('returns null for non-JSON responses', async () => {
    const res = new Response('plain', { status: 200, headers: { 'content-type': 'text/plain' } });
    expect(await safeJson(res)).toBeNull();
  });
  it('parses JSON responses', async () => {
    expect(await safeJson(jsonResponse({ a: 1 }))).toEqual({ a: 1 });
  });
});

describe('TokenServiceAccountAuth wallet login', () => {
  afterEach(() => jest.restoreAllMocks());

  it('throws WalletLoginUnavailableError on 404 challenge', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(emptyResponse(404));
    await expect(
      requestWalletLoginChallenge(BASE, '0x0000000000000000000000000000000000000000')
    ).rejects.toBeInstanceOf(WalletLoginUnavailableError);
  });

  it('returns tokens and parsed expiry on success', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ success: true, accessToken: 'abc', email: 'a@b.com', expiresIn: 120 })
    );
    const result = await walletLogin(BASE, {
      evmAddress: '0x0000000000000000000000000000000000000000',
      challengeId: 'c1',
      evmSignature: '0xsig',
    });
    expect(result.accessToken).toBe('abc');
    expect(result.email).toBe('a@b.com');
    expect(result.expiresAt).not.toBeNull();
  });
});

describe('TokenServiceFunding', () => {
  afterEach(() => jest.restoreAllMocks());

  it('throws FundingUnavailableError on 404 policy', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(emptyResponse(404));
    await expect(getFundingPolicy(BASE, 84532)).rejects.toBeInstanceOf(FundingUnavailableError);
  });

  it('returns the parsed policy on success', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        chainId: 84532,
        network: 'base-sepolia',
        policy: { enabled: true, grantWei: '1', grantEth: '0.001', cooldownHours: 24 },
      })
    );
    const result = await getFundingPolicy(BASE, 84532);
    expect(result.network).toBe('base-sepolia');
    expect(result.policy.grantEth).toBe('0.001');
  });

  it('throws a generic auth error when a grant request returns non-JSON 401', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(emptyResponse(401));
    await expect(requestFundingGrant(BASE, 'tok', 84532)).rejects.toThrow(/HTTP 401/);
  });
});

describe('TokenServiceIdentity', () => {
  it('exposes the default recipient suite and conflict error', () => {
    expect(DEFAULT_RECIPIENT_SUITE).toBe('ecies-x25519-aes256gcm');
    expect(new IdentityKeyConflictError('x').name).toBe('IdentityKeyConflictError');
  });
});

describe('token-service barrel exports', () => {
  it('re-exports the new HTTP clients', () => {
    const ts = require('../../src/token-service');
    expect(ts.normalizeServerUrl).toBeDefined();
    expect(ts.requestWalletLoginChallenge).toBeDefined();
    expect(ts.walletLogin).toBeDefined();
    expect(ts.getFundingPolicy).toBeDefined();
    expect(ts.requestFundingGrant).toBeDefined();
    expect(ts.completeWalletEnsure).toBeDefined();
    expect(ts.completeIdentityKeyInit).toBeDefined();
    expect(ts.WalletLoginUnavailableError).toBeDefined();
    expect(ts.FundingUnavailableError).toBeDefined();
  });
});
