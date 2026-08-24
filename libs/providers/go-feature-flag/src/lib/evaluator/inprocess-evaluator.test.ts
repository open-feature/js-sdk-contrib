import { InProcessEvaluator } from './inprocess-evaluator';
import type { GoFeatureFlagApi } from '../service/api';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import {
  FlagNotFoundError,
  type Logger,
  OpenFeatureEventEmitter,
  ParseError,
  ProviderNotReadyError,
  ServerProviderEvents,
  TypeMismatchError,
} from '@openfeature/server-sdk';
import type { EvaluationContextValue } from '@openfeature/server-sdk';
import { EvaluationType, NOT_MODIFIED } from '../model';
import type { Flag, FlagConfigResponse } from '../model';
import { EvaluateWasm } from '../wasm/evaluate-wasm';
import { ImpossibleToRetrieveConfigurationException } from '../exception';
import { DEFAULT_POLLING_INTERVAL_MS } from '../helper/constants';

// Mock the EvaluateWasm class
jest.mock('../wasm/evaluate-wasm', () => ({
  EvaluateWasm: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValue({
      value: true,
      reason: 'TARGETING_MATCH',
      trackEvents: true,
    }),
    dispose: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('InProcessEvaluator', () => {
  let evaluator: InProcessEvaluator;
  let mockApi: jest.Mocked<GoFeatureFlagApi>;
  let mockOptions: GoFeatureFlagProviderOptions;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Polling delays are jittered, so an unseeded clock would make every `advanceTimersByTime` in
    // this file a coin flip. 0.5 is the midpoint of the jitter window and yields exactly the
    // configured interval; the jitter tests below drive the ends of the window explicitly.
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    mockApi = {
      retrieveFlagConfiguration: jest.fn().mockResolvedValue({
        flags: {
          'test-flag': {
            key: 'test-flag',
            trackEvents: true,
            variations: {},
            rules: [],
            defaultSdkValue: true,
          },
        },
        evaluationContextEnrichment: {},
        etag: 'test-etag',
        lastUpdated: new Date(),
      }),
    } as any;

    mockOptions = {
      endpoint: 'http://localhost:1031',
      evaluationType: EvaluationType.InProcess,
      timeout: 10000,
      flagChangePollingIntervalMs: 120000,
    };

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    evaluator = new InProcessEvaluator(mockOptions, mockApi, new OpenFeatureEventEmitter(), mockLogger);
  });

  afterEach(async () => {
    // Every initialize() schedules a refresh, so a test that initializes without disposing leaves a
    // live timer holding the event loop open.
    await evaluator.dispose();
    jest.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await expect(evaluator.initialize()).resolves.not.toThrow();
      expect(mockApi.retrieveFlagConfiguration).toHaveBeenCalledWith(undefined, undefined);
    });
  });

  describe('evaluateBoolean', () => {
    it('should evaluate boolean flag successfully', async () => {
      await evaluator.initialize();

      const result = await evaluator.evaluateBoolean('test-flag', false, { user: 'test' });

      const want = {
        value: true,
        reason: 'TARGETING_MATCH',
      };
      expect(result).toEqual(want);
    });

    it('should throw error when flag not found', async () => {
      await evaluator.initialize();

      await expect(evaluator.evaluateBoolean('non-existent-flag', false, { user: 'test' })).rejects.toThrow(
        FlagNotFoundError,
      );
    });
  });

  describe('null evaluation results', () => {
    /** The engine instance most recently constructed by the evaluator under test. */
    const engine = () => (EvaluateWasm as unknown as jest.Mock).mock.results.at(-1)?.value;

    /**
     * A successful evaluation that produced no value, in the shape the engine actually emits for it.
     *
     * The engine reaches this state through exactly one path: GetVariationValue returns nil when the
     * selected variation's configured value is JSON null, or when a rule names a variation absent
     * from `variations`. That path reports the *selected variation's name*, the real reason, and no
     * error code — so handleError, which runs first, never intercepts it.
     *
     * The variant is deliberately not `SdkDefault`. That sentinel belongs to the engine, which sets
     * it itself on every path where it serves the SDK default (disabled, targeting-key missing,
     * scheduled-rollout error, type mismatch). The provider must pass the variant through rather
     * than synthesise it, or the name of the misconfigured variation is lost.
     */
    const noValue = {
      value: null,
      reason: 'STATIC',
      variationType: 'null_variation',
      metadata: { description: 'a flag with no value' },
      trackEvents: true,
    };

    beforeEach(async () => {
      await evaluator.initialize();
      engine().evaluate.mockResolvedValue(noValue);
    });

    it('should return the caller default from the boolean resolver', async () => {
      await expect(evaluator.evaluateBoolean('test-flag', true, { user: 'test' })).resolves.toEqual({
        value: true,
        reason: 'STATIC',
        variant: 'null_variation',
        flagMetadata: { description: 'a flag with no value' },
      });
    });

    it('should return the caller default from the string resolver', async () => {
      await expect(evaluator.evaluateString('test-flag', 'fallback', { user: 'test' })).resolves.toMatchObject({
        value: 'fallback',
        reason: 'STATIC',
        variant: 'null_variation',
      });
    });

    it('should return the caller default from the number resolver', async () => {
      await expect(evaluator.evaluateNumber('test-flag', 42, { user: 'test' })).resolves.toMatchObject({
        value: 42,
        reason: 'STATIC',
        variant: 'null_variation',
      });
    });

    it('should return the caller default from the object resolver', async () => {
      await expect(evaluator.evaluateObject('test-flag', { a: 1 }, { user: 'test' })).resolves.toMatchObject({
        value: { a: 1 },
        reason: 'STATIC',
        variant: 'null_variation',
      });
    });

    it('should report the engine variant, not SdkDefault, for a null variation', async () => {
      // Naming the variation is what tells an operator which one is misconfigured, so the provider
      // must not overwrite it with SdkDefault just because the value it serves is the caller's.
      engine().evaluate.mockResolvedValue({
        value: null,
        reason: 'TARGETING_MATCH',
        variationType: 'varB',
        trackEvents: true,
      });

      await expect(evaluator.evaluateString('test-flag', 'fallback', {})).resolves.toMatchObject({
        value: 'fallback',
        reason: 'TARGETING_MATCH',
        variant: 'varB',
      });
    });

    it('should pass through SdkDefault when the engine is the one serving the default', async () => {
      // The disabled path sets variationType itself, so preserving the variant is what makes
      // GOFF-EVAL-008 hold — the provider needs no special case of its own.
      engine().evaluate.mockResolvedValue({
        value: null,
        reason: 'DISABLED',
        variationType: 'SdkDefault',
        trackEvents: true,
      });

      await expect(evaluator.evaluateBoolean('test-flag', true, {})).resolves.toMatchObject({
        value: true,
        reason: 'DISABLED',
        variant: 'SdkDefault',
      });
    });

    it('should not return the language zero value', async () => {
      // false, '' and 0 are what a naive "return the zero value" implementation would produce.
      await expect(evaluator.evaluateBoolean('test-flag', true, {})).resolves.toMatchObject({ value: true });
      await expect(evaluator.evaluateString('test-flag', 'fallback', {})).resolves.toMatchObject({
        value: 'fallback',
      });
      await expect(evaluator.evaluateNumber('test-flag', 42, {})).resolves.toMatchObject({ value: 42 });
    });

    it('should treat an absent value the same as an explicit null', async () => {
      engine().evaluate.mockResolvedValue({ reason: 'STATIC', variationType: 'null_variation', trackEvents: true });

      await expect(evaluator.evaluateBoolean('test-flag', true, {})).resolves.toMatchObject({
        value: true,
        reason: 'STATIC',
        variant: 'null_variation',
      });
    });

    it('should still report a type mismatch for a genuinely wrong type', async () => {
      engine().evaluate.mockResolvedValue({ value: 'a string', reason: 'STATIC', trackEvents: true });

      await expect(evaluator.evaluateBoolean('test-flag', false, {})).rejects.toThrow(TypeMismatchError);
    });
  });

  describe('flag keys that collide with Object.prototype', () => {
    // A flag map is decoded with JSON.parse and so inherits from Object.prototype. Looking a flag up
    // by one of those member names must not resolve to the inherited member.
    const inheritedNames = ['toString', 'constructor', 'valueOf', 'hasOwnProperty'];

    it.each(inheritedNames)('should report FLAG_NOT_FOUND for a flag named %s', async (flagKey) => {
      await evaluator.initialize();

      await expect(evaluator.evaluateBoolean(flagKey, false, { user: 'test' })).rejects.toThrow(FlagNotFoundError);
    });

    it.each(inheritedNames)('should not invoke the engine for a flag named %s', async (flagKey) => {
      await evaluator.initialize();
      const engine = (EvaluateWasm as unknown as jest.Mock).mock.results.at(-1)?.value;

      await expect(evaluator.evaluateBoolean(flagKey, false, { user: 'test' })).rejects.toThrow(FlagNotFoundError);

      expect(engine.evaluate).not.toHaveBeenCalled();
    });

    it('should still evaluate a flag genuinely named __proto__', async () => {
      mockApi.retrieveFlagConfiguration.mockResolvedValue({
        flags: JSON.parse('{"__proto__":{"trackEvents":true,"defaultRule":{"variation":"on"}}}'),
        evaluationContextEnrichment: {},
        etag: 'test-etag',
        lastUpdated: new Date(),
      } as FlagConfigResponse);
      await evaluator.initialize();

      // Copying onto a null-prototype target keeps __proto__ as an ordinary own property.
      await expect(evaluator.evaluateBoolean('__proto__', false, { user: 'test' })).resolves.toEqual({
        value: true,
        reason: 'TARGETING_MATCH',
      });
    });
  });

  describe('isFlagTrackable', () => {
    it('should return true for existing flag', async () => {
      await evaluator.initialize();

      const result = evaluator.isFlagTrackable('test-flag');

      expect(result).toBe(true);
    });

    it('should return true for non-existent flag', async () => {
      await evaluator.initialize();

      const result = evaluator.isFlagTrackable('non-existent-flag');

      expect(result).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should dispose successfully', async () => {
      await evaluator.initialize();

      await expect(evaluator.dispose()).resolves.not.toThrow();
    });
  });

  describe('before a configuration has loaded', () => {
    it('should report PROVIDER_NOT_READY when never initialized', async () => {
      await expect(evaluator.evaluateBoolean('test-flag', false, { user: 'test' })).rejects.toThrow(
        ProviderNotReadyError,
      );
    });

    it('should report PROVIDER_NOT_READY after a failed initialization', async () => {
      mockApi.retrieveFlagConfiguration.mockRejectedValue(
        new ImpossibleToRetrieveConfigurationException('relay proxy unreachable'),
      );

      await expect(evaluator.initialize()).rejects.toThrow(ImpossibleToRetrieveConfigurationException);

      // The SDK short-circuits NOT_READY and FATAL, but not ERROR, so a failed initialization still
      // lets evaluations reach the provider. They must not be answered with a generic error.
      await expect(evaluator.evaluateBoolean('test-flag', false, { user: 'test' })).rejects.toThrow(
        ProviderNotReadyError,
      );
    });

    it('should not report FLAG_NOT_FOUND for an unknown flag before initialization', async () => {
      // Reporting FLAG_NOT_FOUND here would blame the caller's flag key for an infrastructure
      // failure, so the readiness check has to precede the flag lookup.
      await expect(evaluator.evaluateBoolean('no-such-flag', false, { user: 'test' })).rejects.not.toThrow(
        FlagNotFoundError,
      );
    });
  });

  describe('remote fallback', () => {
    /** Makes the engine return a raw error code, as it does for a trap or a malformed flag. */
    const engineReturns = (errorCode: string) => {
      (evaluator as unknown as { evaluationEngine: { evaluate: jest.Mock } }).evaluationEngine.evaluate = jest
        .fn()
        .mockResolvedValue({ value: null, reason: 'ERROR', errorCode, errorDetails: 'engine said no' });
    };

    /** Replaces the lazily-built fallback evaluator, and reports how it was used. */
    const stubRemote = (result: unknown, shouldReject = false) => {
      const evaluateBoolean = shouldReject
        ? jest.fn().mockRejectedValue(new Error('relay proxy unreachable'))
        : jest.fn().mockResolvedValue(result);
      (evaluator as unknown as { fallbackEvaluator: unknown }).fallbackEvaluator = {
        evaluateBoolean,
      };
      return evaluateBoolean;
    };

    beforeEach(async () => {
      await evaluator.initialize();
    });

    it.each(['PARSE_ERROR', 'GENERAL'])('should fall back to remote on raw engine code %s', async (code) => {
      engineReturns(code);
      const remote = stubRemote({ value: true, reason: 'TARGETING_MATCH', variant: 'on', flagMetadata: {} });

      const result = await evaluator.evaluateBoolean('test-flag', false, { targetingKey: 'user-1' });

      expect(remote).toHaveBeenCalledWith('test-flag', false, { targetingKey: 'user-1' });
      expect(result.value).toBe(true);
    });

    it.each(['FLAG_CONFIG', 'TYPE_MISMATCH', 'TARGETING_KEY_MISSING', 'FLAG_NOT_FOUND'])(
      'should not fall back on raw engine code %s',
      async (code) => {
        engineReturns(code);
        const remote = stubRemote({ value: true, reason: 'TARGETING_MATCH', variant: 'on', flagMetadata: {} });

        await expect(evaluator.evaluateBoolean('test-flag', false)).rejects.toThrow();

        // FLAG_CONFIG especially: a deterministic misconfiguration the relay proxy would reproduce
        // identically, so a fallback buys a round trip and the same answer.
        expect(remote).not.toHaveBeenCalled();
      },
    );

    it('should stamp the result as evaluated remotely', async () => {
      engineReturns('PARSE_ERROR');
      stubRemote({ value: true, reason: 'TARGETING_MATCH', variant: 'on', flagMetadata: { version: '1.0' } });

      const result = await evaluator.evaluateBoolean('test-flag', false);

      // Preserved alongside the relay proxy's own metadata, not instead of it.
      expect(result.flagMetadata).toEqual({ version: '1.0', gofeatureflag_evaluated_remotely: true });
    });

    it('should log every fallback at warning level', async () => {
      engineReturns('GENERAL');
      stubRemote({ value: true, reason: 'TARGETING_MATCH', variant: 'on', flagMetadata: {} });

      await evaluator.evaluateBoolean('test-flag', false);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('falling back to remote'));
    });

    it('should fall back on every occurrence, with no circuit breaker', async () => {
      engineReturns('PARSE_ERROR');
      const remote = stubRemote({ value: true, reason: 'TARGETING_MATCH', variant: 'on', flagMetadata: {} });

      await evaluator.evaluateBoolean('test-flag', false);
      await evaluator.evaluateBoolean('test-flag', false);
      await evaluator.evaluateBoolean('test-flag', false);

      // The specification's choice, and the reason the warning above exists: a persistently
      // malformed flag turns every evaluation into a network round trip.
      expect(remote).toHaveBeenCalledTimes(3);
    });

    it('should return the original in-process error when the remote call also fails', async () => {
      engineReturns('PARSE_ERROR');
      stubRemote(undefined, true);

      // The in-process failure is the root cause, so it is what the caller sees.
      await expect(evaluator.evaluateBoolean('test-flag', false)).rejects.toThrow(ParseError);
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('also failed'), expect.any(Error));
    });

    /**
     * Builds an evaluator running the real WASM binary, with the relay proxy stood up at the
     * network boundary. Nothing between the flag configuration and the OFREP request is replaced,
     * so a guard breach travels the whole path the way it would in production.
     *
     * Every flag here resolves to `disable` locally, so a value of `true` can only have come from
     * the relay proxy - the assertion discriminates rather than merely observing a `true`.
     */
    const realEngineEvaluator = (
      flags: Record<string, unknown>,
      extraOptions: Partial<GoFeatureFlagProviderOptions> = {},
    ) => {
      const fetchImplementation = jest
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ key: 'guarded-flag', value: true, reason: 'TARGETING_MATCH', variant: 'enable' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      const guardBreachingApi = {
        retrieveFlagConfiguration: jest.fn().mockResolvedValue({
          flags,
          evaluationContextEnrichment: {},
          etag: 'guard-etag',
          lastUpdated: new Date(),
        }),
      } as unknown as jest.Mocked<GoFeatureFlagApi>;

      const { EvaluateWasm: RealEvaluateWasm } = jest.requireActual('../wasm/evaluate-wasm');
      const guarded = new InProcessEvaluator(
        { ...mockOptions, fetchImplementation, ...extraOptions },
        guardBreachingApi,
        new OpenFeatureEventEmitter(),
        mockLogger,
      );
      // Swapped in before initialize(), so the real module is the one that gets instantiated.
      (guarded as unknown as { evaluationEngine: unknown }).evaluationEngine = new RealEvaluateWasm();

      return { guarded, fetchImplementation };
    };

    /** Asserts the answer came from the relay proxy rather than from the embedded engine. */
    const expectAnsweredRemotely = (result: { value: boolean; flagMetadata?: Record<string, unknown> }) => {
      expect(result.value).toBe(true);
      expect(result.flagMetadata?.['gofeatureflag_evaluated_remotely']).toBe(true);
    };

    it('should fall back when a targeting list breaches the real engine guard', async () => {
      // §10.1 caps a nikunjy `[...]` list at 1,000 items, and the 0.2.4 binary returns a structured
      // PARSE_ERROR rather than trapping. §10.1 says in terms that §16 is meant to turn that into a
      // remote evaluation - "the relay proxy evaluates on a full stack and has no equivalent limit".
      const oversizedList = Array.from({ length: 1500 }, (_, index) => `"v${index}"`).join(',');
      const { guarded, fetchImplementation } = realEngineEvaluator({
        'guarded-flag': {
          variations: { enable: true, disable: false },
          targeting: [{ name: 'oversized', query: `targetingKey in [${oversizedList}]`, variation: 'enable' }],
          defaultRule: { variation: 'disable' },
        },
      });

      try {
        await guarded.initialize();

        const result = await guarded.evaluateBoolean('guarded-flag', false, { targetingKey: 'random-key' });

        expectAnsweredRemotely(result);
        expect(fetchImplementation).toHaveBeenCalledTimes(1);
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('PARSE_ERROR'));
      } finally {
        await guarded.dispose();
      }
    });

    it('should fall back when the evaluation context is nested too deeply', async () => {
      // The other half of the guard table: §10.1 caps input JSON at 128 levels. This breach comes
      // from the *caller's context* rather than from the flag configuration, which is the case the
      // section describes - "a context the embedded engine cannot handle still resolves correctly".
      let deeplyNested: EvaluationContextValue = { leaf: true };
      for (let level = 0; level < 200; level++) {
        deeplyNested = { child: deeplyNested };
      }

      const { guarded, fetchImplementation } = realEngineEvaluator({
        'guarded-flag': {
          variations: { enable: true, disable: false },
          defaultRule: { variation: 'disable' },
        },
      });

      try {
        await guarded.initialize();

        const result = await guarded.evaluateBoolean('guarded-flag', false, {
          targetingKey: 'random-key',
          deep: deeplyNested,
        });

        // The flag itself is trivial and resolves locally to `disable`; only the depth of the
        // context makes the engine give up, so a `true` here is the relay proxy answering.
        expectAnsweredRemotely(result);
        expect(fetchImplementation).toHaveBeenCalledTimes(1);
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('PARSE_ERROR'));
      } finally {
        await guarded.dispose();
      }
    });

    it('should authenticate the fallback evaluation like any other remote call', async () => {
      // GOFF-FALLBACK-009: authentication applies identically on the fallback path. Asserted on the
      // request that actually leaves rather than on the options object the evaluator holds - the
      // requirement is about what reaches the relay proxy, and a defensive copy of the options
      // somewhere in between must not read as a breach of it.
      const { guarded, fetchImplementation } = realEngineEvaluator(
        {
          'guarded-flag': {
            variations: { enable: true, disable: false },
            defaultRule: { variation: 'disable' },
          },
        },
        { endpoint: 'https://relay.example.com', apiKey: 'fallback-key', headers: { 'X-Tenant': 'acme' } },
      );

      let deeplyNested: EvaluationContextValue = { leaf: true };
      for (let level = 0; level < 200; level++) {
        deeplyNested = { child: deeplyNested };
      }

      try {
        await guarded.initialize();

        const result = await guarded.evaluateBoolean('guarded-flag', false, {
          targetingKey: 'random-key',
          deep: deeplyNested,
        });

        expectAnsweredRemotely(result);
        // The delegate calls fetch with a single Request rather than a (url, init) pair.
        const sent = fetchImplementation.mock.calls[0][0] as Request;
        expect(sent.url).toContain('https://relay.example.com');
        expect(sent.headers.get('X-API-Key')).toBe('fallback-key');
        expect(sent.headers.get('X-Tenant')).toBe('acme');
      } finally {
        await guarded.dispose();
      }
    });

    it('should not build a fallback evaluator until one is needed', () => {
      expect((evaluator as unknown as { fallbackEvaluator?: unknown }).fallbackEvaluator).toBeUndefined();
    });
  });

  describe('evaluationFlagList', () => {
    /** Initializes an evaluator with the given list and returns the `flags` argument it sent. */
    const flagsSentFor = async (evaluationFlagList?: string[]): Promise<string[] | undefined> => {
      const scoped = new InProcessEvaluator(
        { ...mockOptions, evaluationFlagList },
        mockApi,
        new OpenFeatureEventEmitter(),
        mockLogger,
      );
      try {
        await scoped.initialize();
      } finally {
        await scoped.dispose();
      }
      return mockApi.retrieveFlagConfiguration.mock.calls[0][1];
    };

    it('should request only the configured flags', async () => {
      // A service using three flags out of several thousand otherwise downloads all of them on
      // every poll.
      await expect(flagsSentFor(['flagA', 'flagB'])).resolves.toEqual(['flagA', 'flagB']);
    });

    it('should request everything when the option is unset', async () => {
      await expect(flagsSentFor(undefined)).resolves.toBeUndefined();
    });

    it('should treat an empty list as unset', async () => {
      // The relay proxy reads an empty `flags` array as "send everything", so normalising here
      // keeps the two spellings of that intent from diverging later.
      await expect(flagsSentFor([])).resolves.toBeUndefined();
    });

    it('should keep sending the list on subsequent refreshes', async () => {
      jest.useFakeTimers();
      const scoped = new InProcessEvaluator(
        { ...mockOptions, evaluationFlagList: ['flagA'] },
        mockApi,
        new OpenFeatureEventEmitter(),
        mockLogger,
      );
      try {
        await scoped.initialize();
        await jest.advanceTimersByTimeAsync(mockOptions.flagChangePollingIntervalMs as number);

        // Guards the guard: without a second call the assertion below would pass vacuously.
        expect(mockApi.retrieveFlagConfiguration.mock.calls.length).toBeGreaterThan(1);
        // The list is not an initialization-only concern; a poll that dropped it would silently
        // pull the whole configuration back.
        for (const call of mockApi.retrieveFlagConfiguration.mock.calls) {
          expect(call[1]).toEqual(['flagA']);
        }
      } finally {
        await scoped.dispose();
        jest.useRealTimers();
      }
    });
  });

  describe('polling', () => {
    let pollingEvaluator: InProcessEvaluator;

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(async () => {
      await pollingEvaluator?.dispose();
      jest.useRealTimers();
    });

    /** Options with no polling interval at all, i.e. the documented default configuration. */
    const optionsWithoutInterval: GoFeatureFlagProviderOptions = {
      endpoint: 'http://localhost:1031',
      evaluationType: EvaluationType.InProcess,
    };

    it('should poll on the default interval when none is configured', async () => {
      pollingEvaluator = new InProcessEvaluator(
        optionsWithoutInterval,
        mockApi,
        new OpenFeatureEventEmitter(),
        mockLogger,
      );
      await pollingEvaluator.initialize();
      expect(mockApi.retrieveFlagConfiguration).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL_MS);

      expect(mockApi.retrieveFlagConfiguration).toHaveBeenCalledTimes(2);
    });

    it('should not poll before the default interval has elapsed', async () => {
      pollingEvaluator = new InProcessEvaluator(
        optionsWithoutInterval,
        mockApi,
        new OpenFeatureEventEmitter(),
        mockLogger,
      );
      await pollingEvaluator.initialize();

      await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL_MS - 1);

      // Guards against handing the unset option straight to setTimeout, which would schedule with a
      // zero delay and turn polling into a tight loop against the relay proxy.
      expect(mockApi.retrieveFlagConfiguration).toHaveBeenCalledTimes(1);
    });

    it('should keep using the default interval when rescheduling', async () => {
      pollingEvaluator = new InProcessEvaluator(
        optionsWithoutInterval,
        mockApi,
        new OpenFeatureEventEmitter(),
        mockLogger,
      );
      await pollingEvaluator.initialize();

      await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL_MS * 3);

      expect(mockApi.retrieveFlagConfiguration).toHaveBeenCalledTimes(4);
    });

    it('should honour a configured interval', async () => {
      pollingEvaluator = new InProcessEvaluator(
        { ...optionsWithoutInterval, flagChangePollingIntervalMs: 5000 },
        mockApi,
        new OpenFeatureEventEmitter(),
        mockLogger,
      );
      await pollingEvaluator.initialize();

      await jest.advanceTimersByTimeAsync(5000);

      expect(mockApi.retrieveFlagConfiguration).toHaveBeenCalledTimes(2);
    });

    it('should not start a second polling chain when initialized twice', async () => {
      pollingEvaluator = new InProcessEvaluator(
        optionsWithoutInterval,
        mockApi,
        new OpenFeatureEventEmitter(),
        mockLogger,
      );
      await pollingEvaluator.initialize();
      await pollingEvaluator.initialize();
      mockApi.retrieveFlagConfiguration.mockClear();

      await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL_MS);

      // One refresh per interval. Two chains would double the request rate against the relay proxy
      // for every subsequent interval, indefinitely.
      expect(mockApi.retrieveFlagConfiguration).toHaveBeenCalledTimes(1);
    });

    it('should not leave a second polling chain after many re-initializations', async () => {
      pollingEvaluator = new InProcessEvaluator(
        optionsWithoutInterval,
        mockApi,
        new OpenFeatureEventEmitter(),
        mockLogger,
      );
      for (let i = 0; i < 4; i++) {
        await pollingEvaluator.initialize();
      }
      mockApi.retrieveFlagConfiguration.mockClear();

      await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL_MS * 2);

      expect(mockApi.retrieveFlagConfiguration).toHaveBeenCalledTimes(2);
    });

    it('should stop polling once disposed', async () => {
      pollingEvaluator = new InProcessEvaluator(
        optionsWithoutInterval,
        mockApi,
        new OpenFeatureEventEmitter(),
        mockLogger,
      );
      await pollingEvaluator.initialize();
      await pollingEvaluator.dispose();

      await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL_MS * 2);

      expect(mockApi.retrieveFlagConfiguration).toHaveBeenCalledTimes(1);
    });

    describe('jitter', () => {
      const INTERVAL_MS = 10000;

      /**
       * Initializes an evaluator on a fixed random draw and returns how long the next refresh
       * actually waited, by advancing one millisecond at a time until it fires.
       */
      const measureDelay = async (randomDraw: number): Promise<number> => {
        (Math.random as jest.Mock).mockReturnValue(randomDraw);
        pollingEvaluator = new InProcessEvaluator(
          { ...optionsWithoutInterval, flagChangePollingIntervalMs: INTERVAL_MS },
          mockApi,
          new OpenFeatureEventEmitter(),
          mockLogger,
        );
        await pollingEvaluator.initialize();
        mockApi.retrieveFlagConfiguration.mockClear();

        for (let elapsed = 1; elapsed <= INTERVAL_MS * 2; elapsed++) {
          await jest.advanceTimersByTimeAsync(1);
          if (mockApi.retrieveFlagConfiguration.mock.calls.length > 0) {
            return elapsed;
          }
        }
        throw new Error('the scheduled refresh never fired');
      };

      it('should shorten the delay on the low end of the draw', async () => {
        // A fleet restarted together polls in lockstep forever without this, turning a steady
        // trickle of requests against the relay proxy into a spike every interval.
        expect(await measureDelay(0)).toBe(9000);
      });

      it('should lengthen the delay on the high end of the draw', async () => {
        expect(await measureDelay(0.999999)).toBe(11000);
      });

      it('should jitter the reschedule as well as the first delay', async () => {
        // measureDelay covers the timer initialize() installs; this covers the one poll() installs
        // in its finally. Jittering only the first would let the fleet drift back into lockstep,
        // and jittering only the reschedule would leave the poll after a rolling restart aligned.
        expect(await measureDelay(0)).toBe(9000);

        mockApi.retrieveFlagConfiguration.mockClear();
        for (let elapsed = 1; elapsed <= INTERVAL_MS * 2; elapsed++) {
          await jest.advanceTimersByTimeAsync(1);
          if (mockApi.retrieveFlagConfiguration.mock.calls.length > 0) {
            expect(elapsed).toBe(9000);
            return;
          }
        }
        throw new Error('the rescheduled refresh never fired');
      });

      it('should keep every delay within ten percent of the configured interval', async () => {
        // Real draws, not the seeded midpoint: the bound has to hold across the whole distribution.
        (Math.random as jest.Mock).mockRestore();

        const delays: number[] = [];
        const realSetTimeout = globalThis.setTimeout;
        const timeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((
          handler: TimerHandler,
          timeout?: number,
          ...rest: unknown[]
        ) => {
          delays.push(timeout ?? 0);
          return (realSetTimeout as any)(handler, timeout, ...rest);
        }) as unknown as typeof globalThis.setTimeout);

        try {
          pollingEvaluator = new InProcessEvaluator(
            { ...optionsWithoutInterval, flagChangePollingIntervalMs: INTERVAL_MS },
            mockApi,
            new OpenFeatureEventEmitter(),
            mockLogger,
          );
          await pollingEvaluator.initialize();
          await jest.advanceTimersByTimeAsync(INTERVAL_MS * 1.1 * 20);
        } finally {
          timeoutSpy.mockRestore();
        }

        expect(delays.length).toBeGreaterThanOrEqual(20);
        for (const delay of delays) {
          expect(delay).toBeGreaterThanOrEqual(INTERVAL_MS * 0.9);
          expect(delay).toBeLessThanOrEqual(INTERVAL_MS * 1.1);
        }
        // A constant delay would satisfy the bound too, so check the draws actually vary.
        expect(new Set(delays).size).toBeGreaterThan(1);
      });
    });
  });

  describe('configuration changed events', () => {
    let changeEvaluator: InProcessEvaluator;
    let events: OpenFeatureEventEmitter;
    /** Payload of each ConfigurationChanged event, in order. */
    let changes: (string[] | undefined)[];

    const asFlags = (flags: Record<string, unknown>) => flags as unknown as Record<string, Flag>;

    const flagsFixture = asFlags({
      flagA: { trackEvents: true, defaultRule: { variation: 'on' } },
      flagB: { trackEvents: true, defaultRule: { variation: 'off' } },
    });

    /** A 200 response carrying no ETag at all, which is what makes content comparison necessary. */
    const responseWithoutEtag = (flags: Record<string, Flag>): FlagConfigResponse => ({
      flags,
      evaluationContextEnrichment: {},
      etag: undefined,
      lastUpdated: undefined,
    });

    beforeEach(() => {
      jest.useFakeTimers();
      changes = [];
      events = new OpenFeatureEventEmitter();
      events.addHandler(ServerProviderEvents.ConfigurationChanged, (details) => {
        changes.push(details?.flagsChanged as string[] | undefined);
      });
      changeEvaluator = new InProcessEvaluator(mockOptions, mockApi, events, mockLogger);
    });

    afterEach(async () => {
      await changeEvaluator.dispose();
      jest.useRealTimers();
    });

    const pollTimes = async (n: number) => {
      for (let i = 0; i < n; i++) {
        await jest.advanceTimersByTimeAsync(mockOptions.flagChangePollingIntervalMs as number);
      }
    };

    it('should not emit when an ETag-less server keeps returning the same configuration', async () => {
      mockApi.retrieveFlagConfiguration.mockResolvedValue(responseWithoutEtag(flagsFixture));
      await changeEvaluator.initialize();

      await pollTimes(5);

      // Without content comparison this emits once per poll, forever.
      expect(changes).toEqual([]);
    });

    it('should report only the flag whose configuration changed', async () => {
      mockApi.retrieveFlagConfiguration.mockResolvedValue(responseWithoutEtag(flagsFixture));
      await changeEvaluator.initialize();

      mockApi.retrieveFlagConfiguration.mockResolvedValue(
        responseWithoutEtag(
          asFlags({
            flagA: { trackEvents: true, defaultRule: { variation: 'on' } },
            flagB: { trackEvents: false, defaultRule: { variation: 'on' } },
          }),
        ),
      );
      await pollTimes(1);

      expect(changes).toEqual([['flagB']]);
    });

    it('should report an added flag', async () => {
      mockApi.retrieveFlagConfiguration.mockResolvedValue(responseWithoutEtag(flagsFixture));
      await changeEvaluator.initialize();

      mockApi.retrieveFlagConfiguration.mockResolvedValue(
        responseWithoutEtag(asFlags({ ...flagsFixture, flagC: { defaultRule: { variation: 'on' } } })),
      );
      await pollTimes(1);

      expect(changes).toEqual([['flagC']]);
    });

    it('should report a removed flag', async () => {
      mockApi.retrieveFlagConfiguration.mockResolvedValue(responseWithoutEtag(flagsFixture));
      await changeEvaluator.initialize();

      mockApi.retrieveFlagConfiguration.mockResolvedValue(
        responseWithoutEtag(asFlags({ flagA: { trackEvents: true, defaultRule: { variation: 'on' } } })),
      );
      await pollTimes(1);

      expect(changes).toEqual([['flagB']]);
    });

    it('should emit once per distinct configuration, not once per poll', async () => {
      mockApi.retrieveFlagConfiguration.mockResolvedValue(responseWithoutEtag(flagsFixture));
      await changeEvaluator.initialize();

      mockApi.retrieveFlagConfiguration.mockResolvedValue(responseWithoutEtag(asFlags({ other: { defaultRule: {} } })));
      await pollTimes(3);

      expect(changes).toHaveLength(1);
    });

    it('should report every flag when the enrichment changes', async () => {
      mockApi.retrieveFlagConfiguration.mockResolvedValue(responseWithoutEtag(flagsFixture));
      await changeEvaluator.initialize();

      mockApi.retrieveFlagConfiguration.mockResolvedValue({
        ...responseWithoutEtag(flagsFixture),
        evaluationContextEnrichment: { env: 'production' },
      });
      await pollTimes(1);

      // The enrichment feeds every evaluation, so any flag's result may have changed.
      expect(changes).toHaveLength(1);
      expect(changes[0]?.sort()).toEqual(['flagA', 'flagB']);
    });

    it('should not emit for the initial load', async () => {
      mockApi.retrieveFlagConfiguration.mockResolvedValue(responseWithoutEtag(flagsFixture));

      await changeEvaluator.initialize();

      // Consumers must not observe a configuration-changed event before the provider is ready.
      expect(changes).toEqual([]);
    });

    it('should not emit when the server reports not-modified', async () => {
      await changeEvaluator.initialize();
      mockApi.retrieveFlagConfiguration.mockResolvedValue(NOT_MODIFIED);

      await pollTimes(3);

      expect(changes).toEqual([]);
    });
  });

  describe('staleness', () => {
    let staleEvaluator: InProcessEvaluator;
    let events: OpenFeatureEventEmitter;
    let emitted: string[];

    beforeEach(() => {
      jest.useFakeTimers();
      emitted = [];
      events = new OpenFeatureEventEmitter();
      events.addHandler(ServerProviderEvents.Stale, () => emitted.push('stale'));
      events.addHandler(ServerProviderEvents.Ready, () => emitted.push('ready'));
      staleEvaluator = new InProcessEvaluator(mockOptions, mockApi, events, mockLogger);
    });

    afterEach(async () => {
      await staleEvaluator.dispose();
      jest.useRealTimers();
    });

    const failRefreshes = () =>
      mockApi.retrieveFlagConfiguration.mockRejectedValue(
        new ImpossibleToRetrieveConfigurationException('relay proxy unreachable'),
      );

    const pollTimes = async (n: number) => {
      for (let i = 0; i < n; i++) {
        await jest.advanceTimersByTimeAsync(mockOptions.flagChangePollingIntervalMs as number);
      }
    };

    it('should not report stale before three consecutive failures', async () => {
      await staleEvaluator.initialize();
      failRefreshes();

      await pollTimes(2);

      expect(emitted).toEqual([]);
    });

    it('should report stale on the third consecutive failure', async () => {
      await staleEvaluator.initialize();
      failRefreshes();

      await pollTimes(3);

      expect(emitted).toEqual(['stale']);
    });

    it('should report stale only once while it keeps failing', async () => {
      await staleEvaluator.initialize();
      failRefreshes();

      await pollTimes(6);

      expect(emitted).toEqual(['stale']);
    });

    it('should keep serving the last known-good configuration while stale', async () => {
      await staleEvaluator.initialize();
      failRefreshes();

      await pollTimes(4);

      // Going stale reports that the configuration is ageing, not that evaluation has stopped.
      await expect(staleEvaluator.evaluateBoolean('test-flag', false, { user: 'test' })).resolves.toEqual({
        value: true,
        reason: 'TARGETING_MATCH',
      });
    });

    it('should return to ready once a refresh succeeds again', async () => {
      await staleEvaluator.initialize();
      failRefreshes();
      await pollTimes(3);
      expect(emitted).toEqual(['stale']);

      mockApi.retrieveFlagConfiguration.mockResolvedValue(NOT_MODIFIED);
      await pollTimes(1);

      expect(emitted).toEqual(['stale', 'ready']);
    });

    it('should not report ready when it was never stale', async () => {
      await staleEvaluator.initialize();
      failRefreshes();
      await pollTimes(2);

      mockApi.retrieveFlagConfiguration.mockResolvedValue(NOT_MODIFIED);
      await pollTimes(1);

      expect(emitted).toEqual([]);
    });

    it('should require three fresh failures after recovering', async () => {
      await staleEvaluator.initialize();
      failRefreshes();
      await pollTimes(2);
      mockApi.retrieveFlagConfiguration.mockResolvedValue(NOT_MODIFIED);
      await pollTimes(1);

      // The counter resets on success, so two more failures must not be enough to go stale.
      failRefreshes();
      await pollTimes(2);

      expect(emitted).toEqual([]);
    });
  });

  describe('configuration refresh', () => {
    const evaluatedFlag = { value: true, reason: 'TARGETING_MATCH' };

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(async () => {
      await evaluator.dispose();
      jest.useRealTimers();
    });

    const pollOnce = () => jest.advanceTimersByTimeAsync(mockOptions.flagChangePollingIntervalMs as number);

    it('should keep the flag configuration when a refresh reports not-modified', async () => {
      await evaluator.initialize();
      mockApi.retrieveFlagConfiguration.mockResolvedValue(NOT_MODIFIED);

      await pollOnce();

      await expect(evaluator.evaluateBoolean('test-flag', false, { user: 'test' })).resolves.toEqual(evaluatedFlag);
    });

    it('should not overwrite the stored ETag when a refresh reports not-modified', async () => {
      await evaluator.initialize();
      mockApi.retrieveFlagConfiguration.mockResolvedValue(NOT_MODIFIED);

      await pollOnce();
      await pollOnce();

      // Every refresh still presents the validator captured at initialization. If a 304 were
      // allowed to write back an absent ETag, the next poll would send none at all.
      expect(mockApi.retrieveFlagConfiguration).toHaveBeenLastCalledWith('test-etag', undefined);
    });

    it('should keep the flag configuration when a refresh fails', async () => {
      await evaluator.initialize();
      mockApi.retrieveFlagConfiguration.mockRejectedValue(
        new ImpossibleToRetrieveConfigurationException('unparseable body'),
      );

      await pollOnce();

      await expect(evaluator.evaluateBoolean('test-flag', false, { user: 'test' })).resolves.toEqual(evaluatedFlag);
    });

    it('should keep polling after a failed refresh', async () => {
      await evaluator.initialize();
      mockApi.retrieveFlagConfiguration.mockRejectedValue(
        new ImpossibleToRetrieveConfigurationException('unparseable body'),
      );

      await pollOnce();
      await pollOnce();

      // one initial load plus two polls
      expect(mockApi.retrieveFlagConfiguration).toHaveBeenCalledTimes(3);
    });
  });

  describe('wasmBinaryPath', () => {
    it('should pass wasmBinaryPath to EvaluateWasm constructor', () => {
      const customWasmPath = '/custom/path/to/gofeatureflag-evaluation.wasm';
      const optionsWithWasmPath: GoFeatureFlagProviderOptions = {
        ...mockOptions,
        wasmBinaryPath: customWasmPath,
      };

      new InProcessEvaluator(optionsWithWasmPath, mockApi, new OpenFeatureEventEmitter(), mockLogger);

      expect(EvaluateWasm).toHaveBeenCalledWith(mockLogger, customWasmPath);
    });

    it('should pass undefined wasmBinaryPath when not provided', () => {
      new InProcessEvaluator(mockOptions, mockApi, new OpenFeatureEventEmitter(), mockLogger);

      expect(EvaluateWasm).toHaveBeenCalledWith(mockLogger, undefined);
    });
  });
});
