import type { FlagCache } from '../model/in-memory-cache';
import { Storage } from './storage';
import { StandardResolutionReasons } from '@openfeature/web-sdk';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { TEST_FLAG_METADATA } from '../../../../../shared/ofrep-core/src/test/test-constants';
import { DEFAULT_CACHE_TTL_SECONDS } from '../model/ofrep-web-provider-options';

const boolFlagCache: FlagCache = {
  'bool-flag': {
    key: 'bool-flag',
    value: true,
    metadata: TEST_FLAG_METADATA,
    reason: StandardResolutionReasons.STATIC,
  },
};

describe('Storage (persistent flag cache)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses a versioned storage key and does not embed the raw targeting key', async () => {
    const storage = new Storage('local-cache-first');
    const targetingKey = 'user-pii-21640825-95e7-4335-b149-bd6881cf7875';
    const key = await storage.getStorageKey(targetingKey);
    expect(key.startsWith('ofrep-web-provider:v1:')).toBe(true);
    expect(key).not.toContain(targetingKey);
  });

  it('maps different targeting keys to different storage keys', async () => {
    const storage = new Storage('local-cache-first');
    expect(await storage.getStorageKey('a')).not.toBe(await storage.getStorageKey('b'));
  });

  it('does not read or write when cacheMode is disabled', async () => {
    const storage = new Storage('disabled');
    await storage.store('any-key', boolFlagCache, null);
    expect(localStorage.length).toBe(0);
    expect(await storage.retrieve('any-key', DEFAULT_CACHE_TTL_SECONDS)).toBeUndefined();
  });

  it('clears the hashed entry for the given targeting key', async () => {
    const storage = new Storage('local-cache-first');
    const tk = 'clear-me';
    await storage.store(tk, boolFlagCache, null);
    const key = await storage.getStorageKey(tk);
    expect(localStorage.getItem(key)).not.toBeNull();
    await storage.clear(tk);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('stores and retrieves the flag cache and ETag in the persisted envelope', async () => {
    const storage = new Storage('local-cache-first');
    const etag = '"abc123"';
    await storage.store('user-1', boolFlagCache, etag);
    const result = await storage.retrieve('user-1', DEFAULT_CACHE_TTL_SECONDS);
    expect(result).not.toBeUndefined();
    expect(result!.flags).toEqual(boolFlagCache);
    expect(result!.etag).toBe(etag);
  });

  it('stores null ETag when none is provided', async () => {
    const storage = new Storage('local-cache-first');
    await storage.store('user-1', boolFlagCache, null);
    const result = await storage.retrieve('user-1', DEFAULT_CACHE_TTL_SECONDS);
    expect(result!.etag).toBeNull();
  });

  it('returns undefined for an expired entry and removes it from storage', async () => {
    const storage = new Storage('local-cache-first');
    const tk = 'user-expired';
    await storage.store(tk, boolFlagCache, null);

    // Patch the writtenAt to be 31 days ago.
    const key = await storage.getStorageKey(tk);
    const raw = JSON.parse(localStorage.getItem(key)!);
    raw.writtenAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(key, JSON.stringify(raw));

    const result = await storage.retrieve(tk, DEFAULT_CACHE_TTL_SECONDS);
    expect(result).toBeUndefined();
    // Expired entry should have been evicted.
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('returns undefined for an entry with an unknown schema version', async () => {
    const storage = new Storage('local-cache-first');
    const tk = 'user-v99';
    await storage.store(tk, boolFlagCache, null);
    const key = await storage.getStorageKey(tk);
    const raw = JSON.parse(localStorage.getItem(key)!);
    raw.version = 99;
    localStorage.setItem(key, JSON.stringify(raw));
    expect(await storage.retrieve(tk, DEFAULT_CACHE_TTL_SECONDS)).toBeUndefined();
  });

  it('uses a different hash when cacheKeyPrefix is set, preventing key collisions', async () => {
    const storageA = new Storage('local-cache-first', 'provider-a');
    const storageB = new Storage('local-cache-first', 'provider-b');
    const storageNoPrefix = new Storage('local-cache-first');
    const tk = 'same-user';
    // All three should produce different storage keys for the same targeting key.
    expect(await storageA.getStorageKey(tk)).not.toBe(await storageB.getStorageKey(tk));
    expect(await storageA.getStorageKey(tk)).not.toBe(await storageNoPrefix.getStorageKey(tk));
  });
});
