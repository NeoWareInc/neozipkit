/**
 * NeoZip Token Service funding API client.
 *
 * The Token Service can disburse small native-gas grants to the user's primary
 * linked Data Wallet so on-chain operations (tokenization, timestamping) can pay
 * for gas. The recipient is server-authoritative — a client may only request a
 * grant, never redirect it.
 *
 *   GET  /funding/policy?chainId=<id>   (no auth)
 *   GET  /funding/status?chainId=<id>   (Bearer)
 *   POST /funding/request               (Bearer, optional Idempotency-Key)
 */

import {
  normalizeServerUrl,
  safeJson,
  extractError,
  genericAuthErrorMessage,
  formatTokenServiceFetchError,
} from './http';

export interface FundingPolicy {
  enabled: boolean;
  grantWei: string;
  grantEth: string;
  cooldownHours: number;
  lowBalanceWei?: string;
  lowBalanceEth?: string;
}

export interface FundingPolicyResult {
  chainId: number;
  network: string;
  policy: FundingPolicy;
}

export interface FundingGrantSummary {
  id: number;
  status: string;
  amountWei: string;
  amountEth: string;
  transactionHash: string | null;
  requestedAt: string;
  confirmedAt: string | null;
}

export interface FundingStatusResult {
  chainId: number;
  recipientAddress: string | null;
  enabled: boolean;
  requiresPayment: boolean;
  lastGrantAt: string | null;
  nextEligibleAt: string | null;
  recentGrants: FundingGrantSummary[];
}

export interface FundingRequestResult {
  success: boolean;
  status: string;
  grantId: number;
  amountWei: string;
  amountEth: string;
  recipientAddress: string;
  transactionHash?: string | null;
  paymentRequired?: boolean;
  error?: string;
  errorCode?: string;
}

/** Thrown when the Token Service does not expose the funding endpoints (older deployment). */
export class FundingUnavailableError extends Error {
  constructor(message = 'Token Service does not support funding') {
    super(message);
    this.name = 'FundingUnavailableError';
  }
}

/**
 * Fetch the public funding policy for a chain (grant size, cooldown, low-balance
 * threshold). No authentication required.
 *
 * @throws {FundingUnavailableError} when the endpoint returns 404.
 * @throws {Error} on other failures or a malformed response.
 */
export async function getFundingPolicy(
  baseUrl: string,
  chainId: number
): Promise<FundingPolicyResult> {
  const url = normalizeServerUrl(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${url}/funding/policy?chainId=${encodeURIComponent(String(chainId))}`, {
      method: 'GET',
    });
  } catch (err) {
    throw new Error(formatTokenServiceFetchError(url, err));
  }
  if (res.status === 404) {
    throw new FundingUnavailableError();
  }
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    throw new Error(extractError(parsed, `Funding policy lookup failed (HTTP ${res.status})`));
  }
  const policy = parsed.policy as FundingPolicy | undefined;
  if (!policy) {
    throw new Error('Funding policy response missing policy');
  }
  return {
    chainId: typeof parsed.chainId === 'number' ? parsed.chainId : chainId,
    network: typeof parsed.network === 'string' ? parsed.network : '',
    policy,
  };
}

/**
 * Fetch the caller's funding status for a chain (recipient address, eligibility,
 * recent grants). Requires a Bearer access token.
 *
 * @throws {FundingUnavailableError} when the endpoint returns 404.
 * @throws {Error} on other failures (including 401/403) or a malformed response.
 */
export async function getFundingStatus(
  baseUrl: string,
  accessToken: string,
  chainId: number
): Promise<FundingStatusResult> {
  const url = normalizeServerUrl(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${url}/funding/status?chainId=${encodeURIComponent(String(chainId))}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    throw new Error(formatTokenServiceFetchError(url, err));
  }
  if (res.status === 404) {
    throw new FundingUnavailableError();
  }
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!res.ok || !parsed || parsed.success !== true) {
    throw new Error(
      extractError(parsed, `Funding status lookup failed (HTTP ${res.status})`, {
        status: res.status,
      })
    );
  }
  return {
    chainId: typeof parsed.chainId === 'number' ? parsed.chainId : chainId,
    recipientAddress:
      typeof parsed.recipientAddress === 'string' ? parsed.recipientAddress : null,
    enabled: parsed.enabled === true,
    requiresPayment: parsed.requiresPayment === true,
    lastGrantAt: typeof parsed.lastGrantAt === 'string' ? parsed.lastGrantAt : null,
    nextEligibleAt: typeof parsed.nextEligibleAt === 'string' ? parsed.nextEligibleAt : null,
    recentGrants: Array.isArray(parsed.recentGrants)
      ? (parsed.recentGrants as FundingGrantSummary[])
      : [],
  };
}

/**
 * Request a native-gas grant to the caller's primary Data Wallet. Requires a
 * Bearer access token; an optional `idempotencyKey` makes retries safe.
 *
 * Returns the parsed result (which may itself report `success: false` with an
 * `errorCode` such as a cooldown).
 *
 * @throws {FundingUnavailableError} when the endpoint returns 404.
 * @throws {Error} when the response is non-JSON (e.g. auth failures).
 */
export async function requestFundingGrant(
  baseUrl: string,
  accessToken: string,
  chainId: number,
  idempotencyKey?: string
): Promise<FundingRequestResult> {
  const url = normalizeServerUrl(baseUrl);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  let res: Response;
  try {
    res = await fetch(`${url}/funding/request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ chainId }),
    });
  } catch (err) {
    throw new Error(formatTokenServiceFetchError(url, err));
  }
  if (res.status === 404) {
    throw new FundingUnavailableError();
  }
  const parsed = await safeJson<Record<string, unknown>>(res);
  if (!parsed) {
    // Auth failures and other non-JSON responses.
    throw new Error(
      genericAuthErrorMessage(res.status) ?? `Funding request failed (HTTP ${res.status})`
    );
  }
  return parsed as unknown as FundingRequestResult;
}
