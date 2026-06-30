/**
 * NeoZip Token Service account authentication HTTP client.
 *
 * Stateless functions for obtaining and renewing Token Service access tokens:
 *
 *   POST /auth/register             email verification (delivery: app|cli|browser)
 *   POST /auth/verify-email-code    exchange a 6-digit code for an access token
 *   POST /auth/exchange-token       exchange a magic-link token for an access token
 *   POST /auth/wallet-login/...     silent SIWE-style renewal via wallet signature
 *   POST /auth/phone/request-otp    Bearer; start phone verification
 *   POST /auth/phone/verify         Bearer; complete phone verification
 *
 * These functions never persist credentials. Callers receive the access token
 * (and parsed expiry) and are responsible for storing it.
 */

import { getAddress } from 'ethers';
import {
  normalizeServerUrl,
  safeJson,
  pickString,
  extractError,
  parseAccessTokenExpiry,
  formatTokenServiceFetchError,
} from './http';

/** How the Token Service formats the verification email for `/auth/register`. */
export type AccountVerificationDelivery = 'app' | 'cli' | 'browser';

export interface RegisterEmailResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface AccessTokenResult {
  accessToken: string;
  email: string;
  expiresAt: number | null;
}

/**
 * Register an email for verification with a chosen delivery format.
 *
 * `app` sends a NeoZip deep link, `cli`/`browser` send a 6-digit code. The
 * email is normalized (trimmed + lowercased) before sending.
 */
export async function registerEmailWithDelivery(
  baseUrl: string,
  email: string,
  verificationDelivery: AccountVerificationDelivery
): Promise<RegisterEmailResult> {
  const url = normalizeServerUrl(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${url}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        verificationDelivery,
      }),
    });
  } catch (err) {
    return { success: false, error: formatTokenServiceFetchError(url, err) };
  }
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    return { success: false, error: extractError(parsed, `HTTP ${res.status}`) };
  }
  return {
    success: true,
    message:
      typeof parsed.message === 'string' ? parsed.message : 'Verification email sent.',
  };
}

/** Desktop-style registration (deep link email). */
export async function registerEmailApp(
  baseUrl: string,
  email: string
): Promise<RegisterEmailResult> {
  return registerEmailWithDelivery(baseUrl, email, 'app');
}

/** Terminal / CLI registration (6-digit code only). */
export async function registerEmailCli(
  baseUrl: string,
  email: string
): Promise<RegisterEmailResult> {
  return registerEmailWithDelivery(baseUrl, email, 'cli');
}

/**
 * Verify an emailed 6-digit code and return the issued access token.
 *
 * @throws {Error} when the code is invalid, the request fails, or the response
 *   contains no access token.
 */
export async function verifyEmailAndExtractToken(
  baseUrl: string,
  email: string,
  code: string
): Promise<AccessTokenResult> {
  const url = normalizeServerUrl(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${url}/auth/verify-email-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
    });
  } catch (err) {
    throw new Error(formatTokenServiceFetchError(url, err));
  }
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    throw new Error(
      extractError(parsed, `Verification failed (HTTP ${res.status})`, {
        status: res.status,
      })
    );
  }
  const accessToken = pickString(parsed, 'accessToken', 'token', 'bearerToken');
  if (!accessToken) {
    throw new Error(
      'Verification succeeded but no accessToken in response. Set NEOZIP_TOKEN_SERVICE_ACCESS_TOKEN manually or update the Token Service deployment.'
    );
  }
  return {
    accessToken,
    email: pickString(parsed, 'email') ?? email.trim().toLowerCase(),
    expiresAt: parseAccessTokenExpiry(parsed),
  };
}

/**
 * Exchange a magic-link token for an access token.
 *
 * @throws {Error} when the token is invalid, the request fails, or the response
 *   is missing an access token or email.
 */
export async function exchangeMagicLinkToken(
  baseUrl: string,
  token: string
): Promise<AccessTokenResult> {
  const url = normalizeServerUrl(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${url}/auth/exchange-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: token.trim() }),
    });
  } catch (err) {
    throw new Error(formatTokenServiceFetchError(url, err));
  }
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    throw new Error(
      extractError(parsed, `Magic link exchange failed (HTTP ${res.status})`, {
        status: res.status,
      })
    );
  }
  const accessToken = pickString(parsed, 'accessToken', 'token', 'bearerToken');
  if (!accessToken) {
    throw new Error('Magic link exchange succeeded but no accessToken in response.');
  }
  const verifiedEmail = pickString(parsed, 'email');
  if (!verifiedEmail) {
    throw new Error('Magic link exchange succeeded but no email in response.');
  }
  return {
    accessToken,
    email: verifiedEmail,
    expiresAt: parseAccessTokenExpiry(parsed),
  };
}

/**
 * Thrown when the Token Service does not expose the wallet-login endpoints
 * (older deployment). Callers should fall back to interactive email re-auth.
 */
export class WalletLoginUnavailableError extends Error {
  constructor(message = 'Token Service does not support wallet login') {
    super(message);
    this.name = 'WalletLoginUnavailableError';
  }
}

/**
 * Request a wallet-login challenge (first leg of silent, SIWE-style renewal).
 *
 * @throws {WalletLoginUnavailableError} when the endpoint returns 404.
 * @throws {Error} on other failures or malformed responses.
 */
export async function requestWalletLoginChallenge(
  baseUrl: string,
  evmAddress: string
): Promise<{ challengeId: string; message: string; evmAddress: string }> {
  const url = normalizeServerUrl(baseUrl);
  const checksummed = getAddress(evmAddress.trim());
  let res: Response;
  try {
    res = await fetch(`${url}/auth/wallet-login/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ evmAddress: checksummed }),
    });
  } catch (err) {
    throw new Error(formatTokenServiceFetchError(url, err));
  }
  if (res.status === 404) {
    throw new WalletLoginUnavailableError();
  }
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    throw new Error(extractError(parsed, `Wallet login challenge failed (HTTP ${res.status})`));
  }
  const challengeId = pickString(parsed, 'challengeId');
  const message = pickString(parsed, 'message');
  const addr = pickString(parsed, 'evmAddress');
  if (!challengeId || !message || !addr) {
    throw new Error('Wallet login challenge response missing fields');
  }
  return { challengeId, message, evmAddress: addr };
}

/**
 * Complete a wallet-login challenge with a signature and receive an access
 * token (second leg of silent renewal).
 *
 * @throws {WalletLoginUnavailableError} when the endpoint returns 404.
 * @throws {Error} on other failures or when no access token is returned.
 */
export async function walletLogin(
  baseUrl: string,
  input: { evmAddress: string; challengeId: string; evmSignature: string }
): Promise<{ accessToken: string; email: string | null; expiresAt: number | null }> {
  const url = normalizeServerUrl(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${url}/auth/wallet-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        evmAddress: getAddress(input.evmAddress.trim()),
        challengeId: input.challengeId,
        evmSignature: input.evmSignature,
      }),
    });
  } catch (err) {
    throw new Error(formatTokenServiceFetchError(url, err));
  }
  if (res.status === 404) {
    throw new WalletLoginUnavailableError();
  }
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    throw new Error(
      extractError(parsed, `Wallet login failed (HTTP ${res.status})`, { status: res.status })
    );
  }
  const accessToken = pickString(parsed, 'accessToken', 'token', 'bearerToken');
  if (!accessToken) {
    throw new Error('Wallet login succeeded but no accessToken in response.');
  }
  return {
    accessToken,
    email: pickString(parsed, 'email'),
    expiresAt: parseAccessTokenExpiry(parsed),
  };
}

/** Start phone verification for the authenticated account (Bearer). */
export async function requestPhoneOtp(
  baseUrl: string,
  accessToken: string,
  phoneE164: string
): Promise<{ success: boolean; error?: string }> {
  const url = normalizeServerUrl(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${url}/auth/phone/request-otp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ phoneE164: phoneE164.trim() }),
    });
  } catch (err) {
    return { success: false, error: formatTokenServiceFetchError(url, err) };
  }
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    return {
      success: false,
      error: extractError(parsed, `Phone OTP request failed (HTTP ${res.status})`, {
        status: res.status,
      }),
    };
  }
  return { success: true };
}

/** Complete phone verification with the emailed/texted code (Bearer). */
export async function verifyPhoneOtp(
  baseUrl: string,
  accessToken: string,
  phoneE164: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  const url = normalizeServerUrl(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${url}/auth/phone/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ phoneE164: phoneE164.trim(), code: code.trim() }),
    });
  } catch (err) {
    return { success: false, error: formatTokenServiceFetchError(url, err) };
  }
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    return {
      success: false,
      error: extractError(parsed, `Phone verification failed (HTTP ${res.status})`, {
        status: res.status,
      }),
    };
  }
  return { success: true };
}
