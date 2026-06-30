/**
 * NeoZip Token Service identity HTTP client.
 *
 * Stateless functions for linking an EVM data wallet to an account and managing
 * its encrypted identity key:
 *
 *   GET  /crypto/coordinator-config                              (no auth)
 *   POST /identity/wallets/challenge                             (no auth)
 *   POST /identity/wallets/ensure                                (no auth)
 *   POST /identity/users/me/wallets/:id/attach/challenge         (Bearer)
 *   POST /identity/users/me/wallets/:id/attach/complete          (Bearer)
 *   GET  /identity/wallets/:id/identity-key                      (Bearer)
 *   POST /identity/wallets/:id/identity-key/init/challenge       (Bearer)
 *   POST /identity/wallets/:id/identity-key/init/complete        (Bearer)
 *
 * These functions only speak HTTP; message signing with the wallet's private key
 * is the responsibility of the calling application (CLI/Desktop), which composes
 * the challenge/complete pairs around a local signer.
 */

import { getAddress } from 'ethers';
import {
  normalizeServerUrl,
  safeJson,
  pickString,
  extractError,
} from './http';

/** Default ECIES suite advertised when registering an identity key. */
export const DEFAULT_RECIPIENT_SUITE = 'ecies-x25519-aes256gcm';

/**
 * Wrapped (encrypted) EVM private key bundle sent to the Token Service when
 * registering an identity key. The wrap parameters describe how the X25519
 * private key is sealed to the EOA so the server stores ciphertext only.
 */
export interface WrapBundle {
  wrappedPrivateKeyB64: string;
  wrapFormatVersion: number;
  wrapKdfInfo: string;
  wrapKdfSaltB64: string;
  wrapAead: string;
  wrapIvB64: string;
  wrapAadB64: string;
}

/** Identity-key registration payload: a wrap bundle plus the X25519 public key. */
export interface IdentityKeyBundleBody extends WrapBundle {
  x25519PublicKeyB64: string;
  recipientSuites?: string[];
}

/** Thrown when an identity key already exists for a wallet (HTTP 409). */
export class IdentityKeyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityKeyConflictError';
  }
}

function challengeBody(bundle: IdentityKeyBundleBody): Record<string, unknown> {
  return {
    x25519PublicKeyB64: bundle.x25519PublicKeyB64,
    wrappedPrivateKeyB64: bundle.wrappedPrivateKeyB64,
    wrapFormatVersion: bundle.wrapFormatVersion,
    wrapKdfInfo: bundle.wrapKdfInfo,
    wrapKdfSaltB64: bundle.wrapKdfSaltB64,
    wrapAead: bundle.wrapAead,
    wrapIvB64: bundle.wrapIvB64,
    wrapAadB64: bundle.wrapAadB64,
    recipientSuites: bundle.recipientSuites ?? [DEFAULT_RECIPIENT_SUITE],
  };
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
  };
}

/** Probe whether the Token Service exposes wallet-identity coordination. */
export async function fetchCoordinatorConfig(baseUrl: string): Promise<boolean> {
  const url = normalizeServerUrl(baseUrl);
  try {
    const res = await fetch(`${url}/crypto/coordinator-config`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Request a challenge proving control of `evmAddress` (no auth). */
export async function requestWalletEnsureChallenge(
  baseUrl: string,
  evmAddress: string
): Promise<{ challengeId: string; message: string; evmAddress: string }> {
  const url = normalizeServerUrl(baseUrl);
  const checksummed = getAddress(evmAddress.trim());
  const res = await fetch(`${url}/identity/wallets/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ evmAddress: checksummed }),
  });
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    throw new Error(extractError(parsed, `Wallet challenge failed (HTTP ${res.status})`));
  }
  const challengeId = pickString(parsed, 'challengeId');
  const message = pickString(parsed, 'message');
  const addr = pickString(parsed, 'evmAddress');
  if (!challengeId || !message || !addr) {
    throw new Error('Wallet challenge response missing fields');
  }
  return { challengeId, message, evmAddress: addr };
}

/** Ensure a wallet record exists for the signed challenge (no auth). */
export async function completeWalletEnsure(
  baseUrl: string,
  input: { evmAddress: string; challengeId: string; evmSignature: string }
): Promise<{ walletId: number; evmAddress: string }> {
  const url = normalizeServerUrl(baseUrl);
  const checksummed = getAddress(input.evmAddress.trim());
  const res = await fetch(`${url}/identity/wallets/ensure`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      evmAddress: checksummed,
      challengeId: input.challengeId,
      evmSignature: input.evmSignature,
    }),
  });
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    throw new Error(extractError(parsed, `Wallet ensure failed (HTTP ${res.status})`));
  }
  const walletId =
    typeof parsed.walletId === 'number' ? parsed.walletId : Number(parsed.walletId);
  const addr = pickString(parsed, 'evmAddress');
  if (!Number.isFinite(walletId) || !addr) {
    throw new Error('Wallet ensure response missing walletId');
  }
  return { walletId, evmAddress: addr };
}

/** Request a challenge to attach a wallet to the authenticated account (Bearer). */
export async function requestWalletAttachChallenge(
  baseUrl: string,
  accessToken: string,
  walletId: number
): Promise<{ challengeId: string; message: string; walletId: number; evmAddress: string }> {
  const url = normalizeServerUrl(baseUrl);
  const res = await fetch(
    `${url}/identity/users/me/wallets/${walletId}/attach/challenge`,
    { method: 'POST', headers: authHeaders(accessToken) }
  );
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    throw new Error(extractError(parsed, `Attach challenge failed (HTTP ${res.status})`, {
      status: res.status,
    }));
  }
  const challengeId = pickString(parsed, 'challengeId');
  const message = pickString(parsed, 'message');
  const wid =
    typeof parsed.walletId === 'number' ? parsed.walletId : Number(parsed.walletId);
  const addr = pickString(parsed, 'evmAddress');
  if (!challengeId || !message || !Number.isFinite(wid) || !addr) {
    throw new Error('Attach challenge response missing fields');
  }
  return { challengeId, message, walletId: wid, evmAddress: addr };
}

/** Complete a wallet attach with a signature, linking it as primary (Bearer). */
export async function completeWalletAttach(
  baseUrl: string,
  accessToken: string,
  walletId: number,
  input: { challengeId: string; evmSignature: string }
): Promise<{ linkId: number }> {
  const url = normalizeServerUrl(baseUrl);
  const res = await fetch(
    `${url}/identity/users/me/wallets/${walletId}/attach/complete`,
    {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        challengeId: input.challengeId,
        evmSignature: input.evmSignature,
        setPrimary: true,
      }),
    }
  );
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    throw new Error(extractError(parsed, `Attach complete failed (HTTP ${res.status})`, {
      status: res.status,
    }));
  }
  const linkId =
    typeof parsed.linkId === 'number' ? parsed.linkId : Number(parsed.linkId);
  if (!Number.isFinite(linkId)) {
    throw new Error('Attach complete response missing linkId');
  }
  return { linkId };
}

/** Fetch the identity-key bundle for a wallet, or `{ found: false }` (Bearer). */
export async function getIdentityKeyBundle(
  baseUrl: string,
  accessToken: string,
  walletId: number
): Promise<{ found: false } | { found: true; identityKeyId: number; x25519PublicKey: string }> {
  const url = normalizeServerUrl(baseUrl);
  const res = await fetch(`${url}/identity/wallets/${walletId}/identity-key`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
  if (res.status === 404) return { found: false };
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    throw new Error(extractError(parsed, `identity-key GET failed (HTTP ${res.status})`, {
      status: res.status,
    }));
  }
  const ik = parsed.identityKey as Record<string, unknown> | undefined;
  if (!ik) throw new Error('identity-key response missing identityKey');
  const identityKeyId =
    typeof ik.identityKeyId === 'number' ? ik.identityKeyId : Number(ik.identityKeyId);
  const x25519PublicKey = pickString(ik, 'x25519PublicKeyB64', 'x25519PublicKey');
  if (!Number.isFinite(identityKeyId) || !x25519PublicKey) {
    throw new Error('identity-key response incomplete');
  }
  return { found: true, identityKeyId, x25519PublicKey };
}

/** Request a challenge to register an identity key for a wallet (Bearer). */
export async function requestIdentityKeyInitChallenge(
  baseUrl: string,
  accessToken: string,
  walletId: number,
  bundle: IdentityKeyBundleBody
): Promise<{
  challengeId: string;
  message: string;
  evmAddress: string;
  wrappedSha256Hex: string;
}> {
  const url = normalizeServerUrl(baseUrl);
  const res = await fetch(
    `${url}/identity/wallets/${walletId}/identity-key/init/challenge`,
    {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify(challengeBody(bundle)),
    }
  );
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    throw new Error(extractError(parsed, `init challenge failed (HTTP ${res.status})`, {
      status: res.status,
    }));
  }
  const challengeId = pickString(parsed, 'challengeId');
  const message = pickString(parsed, 'message');
  const evmAddress = pickString(parsed, 'evmAddress');
  const wrappedSha256Hex = pickString(parsed, 'wrappedSha256Hex');
  if (!challengeId || !message || !evmAddress || !wrappedSha256Hex) {
    throw new Error('init challenge response missing fields');
  }
  return { challengeId, message, evmAddress, wrappedSha256Hex };
}

/** Complete identity-key registration with a signature (Bearer). */
export async function completeIdentityKeyInit(
  baseUrl: string,
  accessToken: string,
  walletId: number,
  bundle: IdentityKeyBundleBody,
  challengeId: string,
  evmSignature: string
): Promise<{ identityKeyId: number; x25519PublicKey: string }> {
  const url = normalizeServerUrl(baseUrl);
  const res = await fetch(
    `${url}/identity/wallets/${walletId}/identity-key/init/complete`,
    {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        ...challengeBody(bundle),
        challengeId,
        evmSignature,
      }),
    }
  );
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (res.status === 409) {
    throw new IdentityKeyConflictError(
      extractError(parsed, 'Identity key already exists for this wallet.')
    );
  }
  if (!res.ok || !parsed || parsed.success !== true) {
    throw new Error(extractError(parsed, `init complete failed (HTTP ${res.status})`, {
      status: res.status,
    }));
  }
  const ik = parsed.identityKey as Record<string, unknown> | undefined;
  if (!ik) throw new Error('init complete missing identityKey');
  const identityKeyId =
    typeof ik.identityKeyId === 'number' ? ik.identityKeyId : Number(ik.identityKeyId);
  const x25519PublicKey = pickString(ik, 'x25519PublicKeyB64', 'x25519PublicKey');
  if (!Number.isFinite(identityKeyId) || !x25519PublicKey) {
    throw new Error('init complete response incomplete');
  }
  return { identityKeyId, x25519PublicKey };
}
