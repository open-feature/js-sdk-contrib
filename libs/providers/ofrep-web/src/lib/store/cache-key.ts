import type { OFREPProviderBaseOptions } from '@openfeature/ofrep-core';

/** Header names treated as auth credentials for cache key derivation (matched case-insensitively). */
const AUTH_HEADER_NAMES = new Set([
  'authorization',
  'api-key',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
]);

export type CacheKeyParts = {
  cacheKeyPrefix?: string;
  baseUrl: string;
  auth: string;
  domain: string;
  targetingKey: string;
};

function isAuthHeader(name: string): boolean {
  return AUTH_HEADER_NAMES.has(name.toLowerCase());
}

/**
 * Serializes known auth headers from static and factory-supplied options for cache keying.
 * Rotating tokens will change the cache key on each rotation; stable credentials separate caches as intended.
 */
export async function deriveAuthCredential(options: OFREPProviderBaseOptions): Promise<string> {
  const entries = [...(options.headers ?? []), ...((await options.headersFactory?.()) ?? [])];
  const authHeaders = entries
    .filter(([name]) => isAuthHeader(name))
    .map(([name, value]) => [name.toLowerCase(), value] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(authHeaders);
}

/**
 * Encodes cache key components without ambiguous delimiter collisions.
 * Order matches ADR-0009: optional prefix, base URL, auth, domain, targeting key.
 */
export function encodeCacheKeyInput(parts: CacheKeyParts): string {
  return JSON.stringify([
    parts.cacheKeyPrefix ?? '',
    parts.baseUrl,
    parts.auth,
    parts.domain,
    parts.targetingKey,
  ]);
}
