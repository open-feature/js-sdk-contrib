import { RemoteEvaluator } from './remote-evaluator';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import type { FetchAPI } from '../helper/fetch-api';
import { OFREP_ENV_VARS } from '../helper/ofrep';
import { OpenFeatureEventEmitter, ServerProviderEvents } from '@openfeature/server-sdk';

/**
 * These tests drive the real `OFREPProvider` and observe the request it makes, because the
 * behaviour under test is what the delegate ends up configured with - which is precisely what a
 * mocked delegate would hide.
 */
describe('RemoteEvaluator', () => {
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

  describe('provider events', () => {
    let events: OpenFeatureEventEmitter;
    /** Every event the evaluator emitted, in order. */
    let emitted: string[];
    /** Whether the next fetch should fail, and how. */
    let respond: () => Promise<Response>;

    const ok = () =>
      Promise.resolve(
        new Response(JSON.stringify({ key: 'test-flag', value: true, reason: 'STATIC', variant: 'on' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const unreachable = () => Promise.reject(new TypeError('fetch failed'));

    beforeEach(() => {
      events = new OpenFeatureEventEmitter();
      emitted = [];
      // Stale is watched too, so that emitting it here would fail a test rather than pass silently:
      // remote mode caches nothing, so there is no ageing configuration for it to describe.
      for (const event of [ServerProviderEvents.Error, ServerProviderEvents.Ready, ServerProviderEvents.Stale]) {
        events.addHandler(event, () => {
          emitted.push(event);
        });
      }
      respond = ok;
      fetchImplementation = (async () => respond()) as unknown as FetchAPI;
    });

    const evaluatorWithEvents = () =>
      new RemoteEvaluator(
        { endpoint: 'https://configured.example.com', fetchImplementation } as GoFeatureFlagProviderOptions,
        { eventChannel: events },
      );

    /** Runs `count` evaluations, swallowing the rejections a failing relay proxy produces. */
    const evaluateTimes = async (evaluator: RemoteEvaluator, count: number): Promise<void> => {
      for (let i = 0; i < count; i++) {
        await evaluator.evaluateBoolean('test-flag', false, { targetingKey: 'user-1' }).catch(() => undefined);
      }
    };

    it('should report an error on the very first failed evaluation', async () => {
      const evaluator = evaluatorWithEvents();
      respond = unreachable;

      await evaluateTimes(evaluator, 1);

      // No threshold to absorb: this mode caches nothing, so one relay proxy it cannot reach means
      // it cannot evaluate at all. Delaying the signal would only leave the application blind.
      expect(emitted).toEqual([ServerProviderEvents.Error]);
    });

    it('should never report stale', async () => {
      const evaluator = evaluatorWithEvents();
      respond = unreachable;

      await evaluateTimes(evaluator, 6);

      // Stale means a last-known-good configuration is ageing. Remote mode holds none, so the
      // condition it describes cannot arise here.
      expect(emitted).not.toContain(ServerProviderEvents.Stale);
    });

    it('should report the error only once while it stays down', async () => {
      const evaluator = evaluatorWithEvents();
      respond = unreachable;

      await evaluateTimes(evaluator, 6);

      expect(emitted).toEqual([ServerProviderEvents.Error]);
    });

    it('should report ready again once an evaluation succeeds', async () => {
      const evaluator = evaluatorWithEvents();
      respond = unreachable;
      await evaluateTimes(evaluator, 1);

      respond = ok;
      await evaluateTimes(evaluator, 1);

      expect(emitted).toEqual([ServerProviderEvents.Error, ServerProviderEvents.Ready]);
    });

    it('should not report ready when nothing had failed', async () => {
      const evaluator = evaluatorWithEvents();

      await evaluateTimes(evaluator, 3);

      // Nothing to recover from, so there is no recovery to announce.
      expect(emitted).toEqual([]);
    });

    it('should report each new outage after recovering', async () => {
      const evaluator = evaluatorWithEvents();
      respond = unreachable;
      await evaluateTimes(evaluator, 1);
      respond = ok;
      await evaluateTimes(evaluator, 1);
      emitted.length = 0;

      respond = unreachable;
      await evaluateTimes(evaluator, 1);

      expect(emitted).toEqual([ServerProviderEvents.Error]);
    });

    it('should carry the underlying failure in the event payload', async () => {
      const evaluator = evaluatorWithEvents();
      const messages: (string | undefined)[] = [];
      events.addHandler(ServerProviderEvents.Error, (details) => {
        messages.push(details?.message);
      });
      respond = () => Promise.reject(new TypeError('relay proxy unreachable'));

      await evaluateTimes(evaluator, 1);

      // The delegate wraps a transport failure in an OFREPApiFetchError whose own message is a
      // constant, so reporting only that would tell the handler something failed and nothing else.
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('relay proxy unreachable');
    });

    it('should not count a flag-level error as a failure', async () => {
      const evaluator = evaluatorWithEvents();
      respond = () =>
        Promise.resolve(
          new Response(JSON.stringify({ key: 'test-flag', errorCode: 'FLAG_NOT_FOUND' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      await evaluateTimes(evaluator, 5);

      // The relay proxy answered every time. A flag that does not exist says nothing about its
      // health, and reporting the whole provider broken over one missing key would be wrong.
      expect(emitted).toEqual([]);
    });

    it('should track every resolver, not just the boolean one', async () => {
      const evaluator = evaluatorWithEvents();
      respond = unreachable;

      await evaluator.evaluateString('test-flag', 'x', {}).catch(() => undefined);

      expect(emitted).toEqual([ServerProviderEvents.Error]);

      respond = ok;
      await evaluator.evaluateNumber('test-flag', 1, {}).catch(() => undefined);

      expect(emitted).toEqual([ServerProviderEvents.Error, ServerProviderEvents.Ready]);

      respond = unreachable;
      await evaluator.evaluateObject('test-flag', {}, {}).catch(() => undefined);

      expect(emitted).toEqual([ServerProviderEvents.Error, ServerProviderEvents.Ready, ServerProviderEvents.Error]);
    });

    it('should emit nothing when built without an emitter', async () => {
      // The §16 fallback is constructed this way, inside the in-process evaluator, which reports
      // its own health from the polling loop.
      const evaluator = new RemoteEvaluator({
        endpoint: 'https://configured.example.com',
        fetchImplementation,
      } as GoFeatureFlagProviderOptions);
      respond = unreachable;

      await expect(evaluateTimes(evaluator, 5)).resolves.toBeUndefined();
      expect(emitted).toEqual([]);
    });
  });
});
