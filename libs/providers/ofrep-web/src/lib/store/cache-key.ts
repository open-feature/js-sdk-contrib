import type { OFREPProviderBaseOptions } from '@openfeature/ofrep-core';
import type { EvaluationContext } from '@openfeature/web-sdk';

/** Header names treated as auth credentials for cache key derivation (matched case-insensitively). */
const AUTH_HEADER_NAMES = new Set([
  'authorization',
  'api-key',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
]);

export type CacheKeyGeneratorInput = {
  url: string;
  auth?: string;
  domain?: string;
  targetingKey?: string;
  context: EvaluationContext;
};

export type CacheKeyGenerator = (input: CacheKeyGeneratorInput) => string;

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
 * Default ADR-0009 cache-key generator: OFREP base URL, auth credential, bound domain, and targeting key.
 * The provider hashes the returned key material into `cacheKeyHash`.
 */
export function defaultCacheKeyGenerator(input: CacheKeyGeneratorInput): string {
  return JSON.stringify([input.url, input.auth ?? '', input.domain ?? '', input.targetingKey ?? '']);
}
