import { FixedSizeExpiringCache } from './fixed-size-expiring-cache';

describe('FixedSizeExpiringCache', () => {
  it('should expire', async () => {
    const cache = new FixedSizeExpiringCache({ maxItems: 1, ttlMs: 500 });

    const key1 = 'key1';
    const value1 = 'value1';

    cache.set(key1, value1);

    // should be present
    expect(cache.get(key1)).toEqual(value1);

    // wait for expiry
    await new Promise((r) => setTimeout(r, 1000));

    // should be expired
    expect(cache.get(key1)).toBeUndefined();
  });

  it('should remove oldest when over full', async () => {
    const cache = new FixedSizeExpiringCache({ maxItems: 2, ttlMs: 60000 });

    const key1 = 'key1';
    const value1 = 'value1';
    const key2 = 'key2';
    const value2 = 'value2';
    const key3 = 'key3';
    const value3 = 'value3';

    cache.set(key1, value1);
    cache.set(key2, value2);
    cache.set(key3, value3);

    // recent 2 should be found
    expect(cache.get(key2)).toEqual(value2);
    expect(cache.get(key3)).toEqual(value3);

    // oldest should be gone
    expect(cache.get(key1)).toBeUndefined();
  });

  it('should no-op for falsy key', async () => {
    const cache = new FixedSizeExpiringCache({ maxItems: 100, ttlMs: 60000 });

    const key1 = undefined;
    const value1 = 'value1';
    const key2 = null;
    const value2 = 'value2';
    const key3 = '';
    const value3 = 'value3';

    cache.set(key1 as unknown as string, value1);
    cache.set(key2 as unknown as string, value2);
    cache.set(key3 as unknown as string, value3);

    // should all be undefined
    expect(cache.get(key1 as unknown as string)).toBeUndefined();
    expect(cache.get(key2 as unknown as string)).toBeUndefined();
    expect(cache.get(key3 as unknown as string)).toBeUndefined();
  });

  describe('options', () => {
    it('should validate options', () => {
      expect(() => new FixedSizeExpiringCache({ maxItems: 0, ttlMs: 60000 })).toThrow();
      expect(() => new FixedSizeExpiringCache({ maxItems: -1, ttlMs: 60000 })).toThrow();
      expect(() => new FixedSizeExpiringCache({ maxItems: 100, ttlMs: 0 })).toThrow();
      expect(() => new FixedSizeExpiringCache({ maxItems: 100, ttlMs: -1 })).toThrow();
    });
  });
});
