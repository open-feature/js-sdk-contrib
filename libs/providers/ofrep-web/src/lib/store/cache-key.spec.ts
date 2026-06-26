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

  it('serializes Authorization from static headers', async () => {
    const auth = await deriveAuthCredential({
      baseUrl: 'https://example.com',
      headers: [
        ['Content-Type', 'application/json'],
        ['Authorization', 'Bearer token'],
        ['X-My-Header', 'ignored'],
      ],
    });
    expect(auth).toBe(JSON.stringify([['authorization', 'Bearer token']]));
  });

  it('serializes known auth headers from headersFactory', async () => {
    const auth = await deriveAuthCredential({
      baseUrl: 'https://example.com',
      headersFactory: () => Promise.resolve([['X-Api-Key', 'secret']]),
    });
    expect(auth).toBe(JSON.stringify([['x-api-key', 'secret']]));
  });

  it('returns an empty array when no auth headers are configured', async () => {
    const auth = await deriveAuthCredential({
      baseUrl: 'https://example.com',
      headers: [['X-Custom', 'value']],
    });
    expect(auth).toBe('[]');
  });

  it('matches auth header names case-insensitively', async () => {
    const auth = await deriveAuthCredential({
      baseUrl: 'https://example.com',
      headers: [['x-api-key', 'secret']],
    });
    expect(auth).toBe(JSON.stringify([['x-api-key', 'secret']]));
  });
});
