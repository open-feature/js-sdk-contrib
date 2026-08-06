import { InProcessEvaluator } from './inprocess-evaluator';
import type { GoFeatureFlagApi } from '../service/api';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import {
  FlagNotFoundError,
  type Logger,
  OpenFeatureEventEmitter,
  ProviderNotReadyError,
} from '@openfeature/server-sdk';
import { EvaluationType, NOT_MODIFIED } from '../model';
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
