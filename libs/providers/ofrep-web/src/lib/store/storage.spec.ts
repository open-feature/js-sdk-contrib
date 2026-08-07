import type { EvaluationContext } from '@openfeature/web-sdk';
import type { FlagCache } from '../model/in-memory-cache';
import { defaultCacheKeyGenerator } from './cache-key';
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

const defaultBaseUrl = 'https://example.com';

const ctx = (targetingKey: string): EvaluationContext => ({ targetingKey });

function createStorage(
  cacheMode: 'local-cache-first' | 'network-first' | 'disabled' = 'local-cache-first',
  options: {
    baseUrl?: string;
    auth?: string;
    domain?: string;
    cacheKeyGenerator?: (input: Parameters<typeof defaultCacheKeyGenerator>[0]) => string;
  } = {},
): Storage {
  return new Storage(
    cacheMode,
    options.baseUrl ?? defaultBaseUrl,
    () => Promise.resolve(options.auth ?? '[]'),
    options.domain ?? '',
    options.cacheKeyGenerator,
  );
}

describe('Storage (persistent flag cache)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses a versioned storage key and does not embed the raw targeting key', async () => {
    const storage = createStorage();
    const context = ctx('user-pii-21640825-95e7-4335-b149-bd6881cf7875');
    const key = await storage.getStorageKey(context);
    expect(key.startsWith('ofrep-web-provider:v2:')).toBe(true);
    expect(key).not.toContain(context.targetingKey!);
  });

  it('maps different targeting keys to different storage keys', async () => {
    const storage = createStorage();
    expect(await storage.getStorageKey(ctx('a'))).not.toBe(await storage.getStorageKey(ctx('b')));
  });

  it('maps different base URLs to different storage keys', async () => {
    const storageA = createStorage('local-cache-first', { baseUrl: 'https://a.example.com' });
    const storageB = createStorage('local-cache-first', { baseUrl: 'https://b.example.com' });
    const context = ctx('same-user');
    expect(await storageA.getStorageKey(context)).not.toBe(await storageB.getStorageKey(context));
  });

  it('maps different domains to different storage keys', async () => {
    const storageA = createStorage('local-cache-first', { domain: 'billing' });
    const storageB = createStorage('local-cache-first', { domain: 'checkout' });
    const context = ctx('same-user');
    expect(await storageA.getStorageKey(context)).not.toBe(await storageB.getStorageKey(context));
  });

  it('maps different auth credentials to different storage keys', async () => {
    const storageA = createStorage('local-cache-first', {
      auth: JSON.stringify([['Authorization', 'Bearer a']]),
    });
    const storageB = createStorage('local-cache-first', {
      auth: JSON.stringify([['Authorization', 'Bearer b']]),
    });
    const context = ctx('same-user');
    expect(await storageA.getStorageKey(context)).not.toBe(await storageB.getStorageKey(context));
  });

  it('does not read or write when cacheMode is disabled', async () => {
    const storage = createStorage('disabled');
    await storage.store(ctx('any-key'), boolFlagCache, null);
    expect(localStorage.length).toBe(0);
    expect(await storage.retrieve(ctx('any-key'), DEFAULT_CACHE_TTL_SECONDS)).toBeUndefined();
  });

  it('clears the hashed entry for the given targeting key', async () => {
    const storage = createStorage();
    const context = ctx('clear-me');
    await storage.store(context, boolFlagCache, null);
    const key = await storage.getStorageKey(context);
    expect(localStorage.getItem(key)).not.toBeNull();
    await storage.clear(context);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('stores and retrieves the flag cache and ETag in the persisted envelope', async () => {
    const storage = createStorage();
    const context = ctx('user-1');
    const etag = '"abc123"';
    await storage.store(context, boolFlagCache, etag);
    const result = await storage.retrieve(context, DEFAULT_CACHE_TTL_SECONDS);
    expect(result).not.toBeUndefined();
    expect(result!.flags).toEqual(boolFlagCache);
    expect(result!.etag).toBe(etag);
  });

  it('stores and retrieves the SSE event streams in the persisted envelope', async () => {
    const storage = createStorage();
    const context = ctx('user-1');
    const eventStreams = [{ type: 'sse' as const, url: 'https://sse.example.com/stream' }];
    await storage.store(context, boolFlagCache, '"etag"', undefined, eventStreams);
    const result = await storage.retrieve(context, DEFAULT_CACHE_TTL_SECONDS);
    expect(result!.eventStreams).toEqual(eventStreams);
  });

  it('omits event streams from the envelope when none are provided', async () => {
    const storage = createStorage();
    const context = ctx('user-1');
    await storage.store(context, boolFlagCache, '"etag"');
    const result = await storage.retrieve(context, DEFAULT_CACHE_TTL_SECONDS);
    expect(result!.eventStreams).toBeUndefined();
  });

  it('stores null ETag when none is provided', async () => {
    const storage = createStorage();
    const context = ctx('user-1');
    await storage.store(context, boolFlagCache, null);
    const result = await storage.retrieve(context, DEFAULT_CACHE_TTL_SECONDS);
    expect(result!.etag).toBeNull();
  });

  it('returns undefined for an expired entry and removes it from storage', async () => {
    const storage = createStorage();
    const context = ctx('user-expired');
    await storage.store(context, boolFlagCache, null);

    // Patch the writtenAt to be 31 days ago.
    const key = await storage.getStorageKey(context);
    const raw = JSON.parse(localStorage.getItem(key)!);
    raw.writtenAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(key, JSON.stringify(raw));

    const result = await storage.retrieve(context, DEFAULT_CACHE_TTL_SECONDS);
    expect(result).toBeUndefined();
    // Expired entry should have been evicted.
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('returns undefined for an entry with an unknown schema version', async () => {
    const storage = createStorage();
    const context = ctx('user-v99');
    await storage.store(context, boolFlagCache, null);
    const key = await storage.getStorageKey(context);
    const raw = JSON.parse(localStorage.getItem(key)!);
    raw.version = 99;
    localStorage.setItem(key, JSON.stringify(raw));
    expect(await storage.retrieve(context, DEFAULT_CACHE_TTL_SECONDS)).toBeUndefined();
  });

  it('uses a different hash for custom cache-key generators', async () => {
    const context = ctx('same-user');
    const storageA = createStorage('local-cache-first', {
      cacheKeyGenerator: (input) => `provider-a:${defaultCacheKeyGenerator(input)}`,
    });
    const storageB = createStorage('local-cache-first', {
      cacheKeyGenerator: (input) => `provider-b:${defaultCacheKeyGenerator(input)}`,
    });
    const storageDefault = createStorage('local-cache-first');
    expect(await storageA.getStorageKey(context)).not.toBe(await storageB.getStorageKey(context));
    expect(await storageA.getStorageKey(context)).not.toBe(await storageDefault.getStorageKey(context));
  });

  describe('when crypto.subtle is unavailable (non-secure context)', () => {
    let subtleSpy: jest.SpyInstance;

    beforeEach(() => {
      subtleSpy = jest.spyOn(crypto, 'subtle', 'get').mockReturnValue(undefined as never);
    });

    afterEach(() => {
      subtleSpy.mockRestore();
    });

    it('produces a valid versioned storage key without the raw targeting key', async () => {
      const storage = createStorage();
      const context = ctx('user-pii-21640825-95e7-4335-b149-bd6881cf7875');
      const key = await storage.getStorageKey(context);
      expect(key.startsWith('ofrep-web-provider:v2:')).toBe(true);
      expect(key).not.toContain(context.targetingKey!);
      expect(key.split(':')[2]).toMatch(/^[0-9a-f]{16}$/);
    });

    it('maps different targeting keys to different storage keys', async () => {
      const storage = createStorage();
      expect(await storage.getStorageKey(ctx('a'))).not.toBe(await storage.getStorageKey(ctx('b')));
    });

    it('stores and retrieves flags without throwing', async () => {
      const storage = createStorage();
      const context = ctx('user-1');
      await storage.store(context, boolFlagCache, '"etag"');
      const result = await storage.retrieve(context, DEFAULT_CACHE_TTL_SECONDS);
      expect(result).not.toBeUndefined();
      expect(result!.flags).toEqual(boolFlagCache);
      expect(result!.etag).toBe('"etag"');
    });
  });
});
