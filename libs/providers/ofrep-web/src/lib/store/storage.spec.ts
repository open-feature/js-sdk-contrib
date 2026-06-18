import type { FlagCache } from '../model/in-memory-cache';
import { Storage } from './storage';
import { StandardResolutionReasons, type EvaluationContext } from '@openfeature/web-sdk';
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

const baseUrl = 'https://localhost:8080';

const defaultContext: EvaluationContext = {
  targetingKey: 'user-pii-21640825-95e7-4335-b149-bd6881cf7875',
  email: 'john.doe@openfeature.dev',
};

describe('Storage (persistent flag cache)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses a versioned storage key and does not embed the raw targeting key', async () => {
    const storage = new Storage('local-cache-first');
    const key = await storage.getStorageKey(baseUrl, defaultContext);
    expect(key.startsWith('ofrep-web-provider:v1:')).toBe(true);
    expect(key).not.toContain(defaultContext.targetingKey ?? '');
  });

  it('maps different contexts to different storage keys', async () => {
    const storage = new Storage('local-cache-first');
    expect(await storage.getStorageKey(baseUrl, { targetingKey: 'a' })).not.toBe(
      await storage.getStorageKey(baseUrl, { targetingKey: 'b' }),
    );
  });

  it('maps identical contexts under different URLs to different storage keys', async () => {
    const storage = new Storage('local-cache-first');
    const context: EvaluationContext = { targetingKey: 'same-user', tenant: 'tenant-a' };
    expect(await storage.getStorageKey('https://localhost:8080', context)).not.toBe(
      await storage.getStorageKey('https://localhost:9090', context),
    );
  });

  it('does not read or write when cacheMode is disabled', async () => {
    const storage = new Storage('disabled');
    const context: EvaluationContext = { targetingKey: 'any-key' };
    await storage.store(baseUrl, context, boolFlagCache, null);
    expect(localStorage.length).toBe(0);
    expect(await storage.retrieve(baseUrl, context, DEFAULT_CACHE_TTL_SECONDS)).toBeUndefined();
  });

  it('clears the hashed entry for the given URL and context', async () => {
    const storage = new Storage('local-cache-first');
    const context: EvaluationContext = { targetingKey: 'clear-me' };
    await storage.store(baseUrl, context, boolFlagCache, null);
    const key = await storage.getStorageKey(baseUrl, context);
    expect(localStorage.getItem(key)).not.toBeNull();
    await storage.clear(baseUrl, context);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('stores and retrieves the flag cache and ETag in the persisted envelope', async () => {
    const storage = new Storage('local-cache-first');
    const etag = '"abc123"';
    const context: EvaluationContext = { targetingKey: 'user-1' };
    await storage.store(baseUrl, context, boolFlagCache, etag);
    const result = await storage.retrieve(baseUrl, context, DEFAULT_CACHE_TTL_SECONDS);
    expect(result).not.toBeUndefined();
    expect(result!.flags).toEqual(boolFlagCache);
    expect(result!.etag).toBe(etag);
  });

  it('stores and retrieves the SSE event streams in the persisted envelope', async () => {
    const storage = new Storage('local-cache-first');
    const eventStreams = [{ type: 'sse' as const, url: 'https://sse.example.com/stream' }];
    const context: EvaluationContext = { targetingKey: 'user-1' };
    await storage.store(baseUrl, context, boolFlagCache, '"etag"', undefined, eventStreams);
    const result = await storage.retrieve(baseUrl, context, DEFAULT_CACHE_TTL_SECONDS);
    expect(result!.eventStreams).toEqual(eventStreams);
  });

  it('omits event streams from the envelope when none are provided', async () => {
    const storage = new Storage('local-cache-first');
    const context: EvaluationContext = { targetingKey: 'user-1' };
    await storage.store(baseUrl, context, boolFlagCache, '"etag"');
    const result = await storage.retrieve(baseUrl, context, DEFAULT_CACHE_TTL_SECONDS);
    expect(result!.eventStreams).toBeUndefined();
  });

  it('stores null ETag when none is provided', async () => {
    const storage = new Storage('local-cache-first');
    const context: EvaluationContext = { targetingKey: 'user-1' };
    await storage.store(baseUrl, context, boolFlagCache, null);
    const result = await storage.retrieve(baseUrl, context, DEFAULT_CACHE_TTL_SECONDS);
    expect(result!.etag).toBeNull();
  });

  it('returns undefined for an expired entry and removes it from storage', async () => {
    const storage = new Storage('local-cache-first');
    const context: EvaluationContext = { targetingKey: 'user-expired' };
    await storage.store(baseUrl, context, boolFlagCache, null);

    // Patch the writtenAt to be 31 days ago.
    const key = await storage.getStorageKey(baseUrl, context);
    const raw = JSON.parse(localStorage.getItem(key)!);
    raw.writtenAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(key, JSON.stringify(raw));

    const result = await storage.retrieve(baseUrl, context, DEFAULT_CACHE_TTL_SECONDS);
    expect(result).toBeUndefined();
    // Expired entry should have been evicted.
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('returns undefined for an entry with an unknown schema version', async () => {
    const storage = new Storage('local-cache-first');
    const context: EvaluationContext = { targetingKey: 'user-v99' };
    await storage.store(baseUrl, context, boolFlagCache, null);
    const key = await storage.getStorageKey(baseUrl, context);
    const raw = JSON.parse(localStorage.getItem(key)!);
    raw.version = 99;
    localStorage.setItem(key, JSON.stringify(raw));
    expect(await storage.retrieve(baseUrl, context, DEFAULT_CACHE_TTL_SECONDS)).toBeUndefined();
  });

  it('uses a different hash when cacheKeyPrefix is set, preventing key collisions', async () => {
    const storageA = new Storage('local-cache-first', 'provider-a');
    const storageB = new Storage('local-cache-first', 'provider-b');
    const storageNoPrefix = new Storage('local-cache-first');
    const context: EvaluationContext = { targetingKey: 'same-user' };
    // All three should produce different storage keys for the same URL+context.
    expect(await storageA.getStorageKey(baseUrl, context)).not.toBe(await storageB.getStorageKey(baseUrl, context));
    expect(await storageA.getStorageKey(baseUrl, context)).not.toBe(
      await storageNoPrefix.getStorageKey(baseUrl, context),
    );
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
      const storage = new Storage('local-cache-first');
      const context: EvaluationContext = {
        targetingKey: 'user-pii-21640825-95e7-4335-b149-bd6881cf7875',
      };
      const key = await storage.getStorageKey(baseUrl, context);
      expect(key.startsWith('ofrep-web-provider:v1:')).toBe(true);
      expect(key).not.toContain(context.targetingKey ?? '');
      expect(key.split(':')[2]).toMatch(/^[0-9a-f]{16}$/);
    });

    it('maps different contexts to different storage keys', async () => {
      const storage = new Storage('local-cache-first');
      expect(await storage.getStorageKey(baseUrl, { targetingKey: 'a' })).not.toBe(
        await storage.getStorageKey(baseUrl, { targetingKey: 'b' }),
      );
    });

    it('stores and retrieves flags without throwing', async () => {
      const storage = new Storage('local-cache-first');
      const context: EvaluationContext = { targetingKey: 'user-1' };
      await storage.store(baseUrl, context, boolFlagCache, '"etag"');
      const result = await storage.retrieve(baseUrl, context, DEFAULT_CACHE_TTL_SECONDS);
      expect(result).not.toBeUndefined();
      expect(result!.flags).toEqual(boolFlagCache);
      expect(result!.etag).toBe('"etag"');
    });
  });
});
