import { buildHeaders } from '@openfeature/ofrep-core';
import type { EvaluationContext } from '@openfeature/web-sdk';
import type { OFREPWebProviderOptions } from './model/ofrep-web-provider-options';

const textEncoder = new TextEncoder();

export async function resolveCacheKeyHash(
  options: OFREPWebProviderOptions,
  context?: EvaluationContext,
): Promise<string> {
  const headers = await buildHeaders(options);
  const authorizationValue = headers.get('authorization') ?? '';
  const targetingKey = typeof context?.targetingKey === 'string' ? context.targetingKey : '';
  return hashValue(`${authorizationValue}\u0000${targetingKey}`);
}

async function hashValue(value: string): Promise<string> {
  const subtleCrypto = globalThis.crypto?.subtle;
  if (!subtleCrypto) {
    return fallbackHash(value);
  }

  const digest = await subtleCrypto.digest('SHA-256', textEncoder.encode(value));
  return Array.from(new Uint8Array(digest), (entry) => entry.toString(16).padStart(2, '0')).join('');
}

function fallbackHash(value: string): string {
  let hashValue = 0x811c9dc5;

  for (const entry of textEncoder.encode(value)) {
    hashValue ^= entry;
    hashValue = Math.imul(hashValue, 0x01000193);
  }

  return (hashValue >>> 0).toString(16).padStart(8, '0');
}
