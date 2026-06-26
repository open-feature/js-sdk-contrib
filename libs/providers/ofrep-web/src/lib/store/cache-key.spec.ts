import { deriveAuthCredential, encodeCacheKeyInput } from './cache-key';

describe('cache key encoding', () => {
  it('uses JSON encoding so delimiter-like values do not collide', () => {
    const keyA = encodeCacheKeyInput({
      baseUrl: 'https://a:b',
      auth: 'c',
      domain: 'd',
      targetingKey: 'e',
    });
    const keyB = encodeCacheKeyInput({
      baseUrl: 'https://a',
      auth: 'b:c',
      domain: 'd:e',
      targetingKey: '',
    });
    expect(keyA).not.toBe(keyB);
  });

  it('includes cacheKeyPrefix as the first component when set', () => {
    const withPrefix = encodeCacheKeyInput({
      cacheKeyPrefix: 'my-app',
      baseUrl: 'https://example.com',
      auth: '[]',
      domain: 'billing',
      targetingKey: 'user-1',
    });
    const withoutPrefix = encodeCacheKeyInput({
      baseUrl: 'https://example.com',
      auth: '[]',
      domain: 'billing',
      targetingKey: 'user-1',
    });
    expect(withPrefix).not.toBe(withoutPrefix);
  });

  it('derives auth from static headers excluding content-type', async () => {
    const auth = await deriveAuthCredential({
      baseUrl: 'https://example.com',
      headers: [
        ['Content-Type', 'application/json'],
        ['Authorization', 'Bearer token'],
      ],
    });
    expect(auth).toBe(JSON.stringify([['Authorization', 'Bearer token']]));
  });

  it('derives auth from headersFactory', async () => {
    const auth = await deriveAuthCredential({
      baseUrl: 'https://example.com',
      headersFactory: () => Promise.resolve([['X-Api-Key', 'secret']]),
    });
    expect(auth).toBe(JSON.stringify([['X-Api-Key', 'secret']]));
  });
});
