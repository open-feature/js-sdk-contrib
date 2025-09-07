import { InProcessEvaluator } from './inprocess-evaluator';
import type { GoFeatureFlagApi } from '../service/api';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import { FlagNotFoundError, type Logger, OpenFeatureEventEmitter } from '@openfeature/server-sdk';
import { EvaluationType } from '../model';

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
});
