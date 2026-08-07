import { RemoteEvaluator } from './remote-evaluator';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import type { FetchAPI } from '../helper/fetch-api';

/**
 * These tests drive the real `OFREPProvider` and observe the request it makes, because the
 * behaviour under test is what the delegate ends up configured with - which is precisely what a
 * mocked delegate would hide.
 */
describe('RemoteEvaluator', () => {
  const OFREP_ENV_VARS = ['OFREP_ENDPOINT', 'OFREP_HEADERS', 'OFREP_TIMEOUT_MS'] as const;

  let capturedUrl: string | undefined;
  let capturedHeaders: Record<string, string>;
  let fetchImplementation: FetchAPI;

  /** Lower-cases the outbound header names so assertions do not depend on the delegate's casing. */
  const headersToRecord = (headers: HeadersInit | undefined): Record<string, string> => {
    const record: Record<string, string> = {};
    if (!headers) {
      return record;
    }
    if (Array.isArray(headers)) {
      for (const [key, value] of headers) {
        record[key.toLowerCase()] = value;
      }
    } else if (typeof (headers as Headers).forEach === 'function') {
      (headers as Headers).forEach((value, key) => {
        record[key.toLowerCase()] = value;
      });
    } else {
      for (const [key, value] of Object.entries(headers as Record<string, string>)) {
        record[key.toLowerCase()] = value;
      }
    }
    return record;
  };

  beforeEach(() => {
    capturedUrl = undefined;
    capturedHeaders = {};
    // The delegate calls fetch with a single Request object rather than (url, init), so both
    // shapes are handled here to keep the probe independent of that detail.
    fetchImplementation = (async (input: Request | string, init?: RequestInit) => {
      const request = typeof input === 'string' ? undefined : input;
      capturedUrl = request ? request.url : String(input);
      capturedHeaders = headersToRecord(request ? request.headers : init?.headers);
      return new Response(JSON.stringify({ key: 'test-flag', value: true, reason: 'STATIC', variant: 'on' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as FetchAPI;
  });

  afterEach(() => {
    for (const name of OFREP_ENV_VARS) {
      delete process.env[name];
    }
  });

  const evaluatorFor = (options: Partial<GoFeatureFlagProviderOptions> = {}) =>
    new RemoteEvaluator({
      endpoint: 'https://configured.example.com',
      fetchImplementation,
      ...options,
    } as GoFeatureFlagProviderOptions);

  describe('environment isolation', () => {
    it('should evaluate against the configured endpoint, not OFREP_ENDPOINT', async () => {
      process.env['OFREP_ENDPOINT'] = 'https://attacker.example.com';

      await evaluatorFor().evaluateBoolean('test-flag', false, { targetingKey: 'user-1' });

      expect(capturedUrl).toContain('https://configured.example.com');
      expect(capturedUrl).not.toContain('attacker.example.com');
    });

    it('should not inherit headers from OFREP_HEADERS', async () => {
      process.env['OFREP_HEADERS'] = 'X-Injected=from-the-environment';

      await evaluatorFor().evaluateBoolean('test-flag', false, { targetingKey: 'user-1' });

      // `getConfig` merges env headers *underneath* ours and overrides only on key collision, so
      // passing an explicit baseUrl was never enough on its own to keep the environment out.
      expect(capturedHeaders).not.toHaveProperty('x-injected');
    });

    it.each(OFREP_ENV_VARS)('should restore %s after construction', (name) => {
      process.env[name] = 'original-value';

      evaluatorFor();

      expect(process.env[name]).toBe('original-value');
    });

    it('should restore the environment even when construction throws', () => {
      process.env['OFREP_ENDPOINT'] = 'original-value';

      // The OFREPProvider constructor throws on an invalid URL, which is why the restore lives in
      // a finally rather than after the call.
      expect(() => evaluatorFor({ endpoint: 'not-a-url' })).toThrow();

      expect(process.env['OFREP_ENDPOINT']).toBe('original-value');
    });

    it('should leave an unset variable unset rather than writing the string "undefined"', () => {
      evaluatorFor();

      // `process.env.X = undefined` stores "undefined", which passes the delegate's truthiness
      // guard - restoring by assignment would have been worse than not isolating at all.
      expect(process.env['OFREP_ENDPOINT']).toBeUndefined();
    });
  });

  describe('custom headers', () => {
    const evaluate = (options: Partial<GoFeatureFlagProviderOptions>) =>
      evaluatorFor(options).evaluateBoolean('test-flag', false, { targetingKey: 'user-1' });

    it('should send caller-supplied headers', async () => {
      await evaluate({ headers: { 'X-Api-Gateway-Key': 'gateway-secret' } });

      // The capability an API gateway needs, and the reason AUTH-004 exists.
      expect(capturedHeaders['x-api-gateway-key']).toBe('gateway-secret');
    });

    it('should authenticate with X-API-Key', async () => {
      await evaluate({ apiKey: 'goff-key' });

      expect(capturedHeaders['x-api-key']).toBe('goff-key');
      expect(capturedHeaders['authorization']).toBeUndefined();
    });

    it('should let apiKey win over a caller-supplied X-API-Key header', async () => {
      await evaluate({ apiKey: 'goff-key', headers: { 'X-API-Key': 'caller-supplied' } });

      expect(capturedHeaders['x-api-key']).toBe('goff-key');
      // A comma would mean the two were appended rather than one replacing the other.
      expect(capturedHeaders['x-api-key']).not.toContain(',');
    });

    it('should send a caller X-API-Key when no apiKey is configured', async () => {
      await evaluate({ headers: { 'X-API-Key': 'caller-supplied' } });

      // The provider sends none of its own here, so the caller's explicit value is what goes out.
      expect(capturedHeaders['x-api-key']).toBe('caller-supplied');
    });

    it('should send exactly one Content-Type', async () => {
      await evaluate({});

      // The delegate sets Content-Type itself and builds headers with `new Headers([...])`, which
      // appends on a duplicate name - so sending our own produced a comma-joined value.
      expect(capturedHeaders['content-type']).toBe('application/json; charset=utf-8');
    });
  });
});
