import type { OFREPProviderBaseOptions } from '@openfeature/ofrep-core';

export type CacheKeyParts = {
  cacheKeyPrefix?: string;
  baseUrl: string;
  auth: string;
  domain: string;
  targetingKey: string;
};

/**
 * Derives a stable auth credential string from static and factory-supplied headers.
 * Rotating tokens will change the cache key on each rotation; stable credentials separate caches as intended.
 */
export async function deriveAuthCredential(options: OFREPProviderBaseOptions): Promise<string> {
  const entries = [...(options.headers ?? []), ...((await options.headersFactory?.()) ?? [])];
  const credentialHeaders = entries
    .filter(([name]) => name.toLowerCase() !== 'content-type')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(credentialHeaders);
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
