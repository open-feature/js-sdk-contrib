import { defaultCacheKeyGenerator, deriveAuthCredential } from './cache-key';

describe('cache key encoding', () => {
  it('uses JSON encoding so delimiter-like values do not collide', () => {
    const keyA = defaultCacheKeyGenerator({
      url: 'https://a:b',
      auth: 'c',
      domain: 'd',
      targetingKey: 'e',
      context: { targetingKey: 'e' },
    });
    const keyB = defaultCacheKeyGenerator({
      url: 'https://a',
      auth: 'b:c',
      domain: 'd:e',
      targetingKey: '',
      context: {},
    });
    expect(keyA).not.toBe(keyB);
  });

  it('allows custom generators to namespace key material', () => {
    const input = {
      url: 'https://example.com',
      auth: '[]',
      domain: 'billing',
      targetingKey: 'user-1',
      context: { targetingKey: 'user-1' },
    };
    const namespaced = (prefix: string) => `${prefix}:${defaultCacheKeyGenerator(input)}`;
    expect(namespaced('provider-a')).not.toBe(namespaced('provider-b'));
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
