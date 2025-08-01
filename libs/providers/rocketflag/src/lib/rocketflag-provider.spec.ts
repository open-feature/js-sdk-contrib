import type { EvaluationContext } from '@openfeature/web-sdk';
import { OpenFeature, StandardResolutionReasons, ErrorCode } from '@openfeature/web-sdk';
import type { FlagStatus, UserContext } from './rocketflag-provider';
import { createRocketFlagProvider } from './rocketflag-provider';

// Create a mock RocketFlag client for testing
const mockClient = {
  getFlag: jest.fn<Promise<FlagStatus>, [string, UserContext]>(),
};

// Mock Logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('RocketFlagProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should have the correct metadata name', () => {
    const provider = createRocketFlagProvider(mockClient);
    expect(provider.metadata.name).toBe('RocketFlagProvider');
  });

  describe('resolveBooleanEvaluation', () => {
    it('should return STALE initially, then resolve to the correct value with TARGETING_MATCH', async () => {
      const provider = createRocketFlagProvider(mockClient);
      const flagKey = 'test-flag-targeting';
      const targetingContext: EvaluationContext = { targetingKey: 'user@example.com' };

      mockClient.getFlag.mockResolvedValue({ enabled: true });

      const initialDetails = provider.resolveBooleanEvaluation(flagKey, false, targetingContext, mockLogger);
      expect(initialDetails.reason).toBe(StandardResolutionReasons.STALE);
      expect(initialDetails.value).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 0));

      const finalDetails = provider.resolveBooleanEvaluation(flagKey, false, targetingContext, mockLogger);

      expect(finalDetails.value).toBe(true);
      expect(finalDetails.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
      expect(mockClient.getFlag).toHaveBeenCalledWith(flagKey, { cohort: 'user@example.com' });
      expect(mockClient.getFlag).toHaveBeenCalledTimes(2);
    });

    it('should return STALE initially, then resolve with DEFAULT reason when no targetingKey is provided', async () => {
      const provider = createRocketFlagProvider(mockClient);
      const flagKey = 'test-flag-default';

      mockClient.getFlag.mockResolvedValue({ enabled: true });

      const initialDetails = provider.resolveBooleanEvaluation(flagKey, false, {}, mockLogger);
      expect(initialDetails.reason).toBe(StandardResolutionReasons.STALE);

      await new Promise((resolve) => setTimeout(resolve, 0));

      const finalDetails = provider.resolveBooleanEvaluation(flagKey, false, {}, mockLogger);

      expect(finalDetails.value).toBe(true);
      expect(finalDetails.reason).toBe(StandardResolutionReasons.DEFAULT);
      expect(mockClient.getFlag).toHaveBeenCalledWith(flagKey, {});
    });

    it('should return STALE initially, then resolve with an ERROR if the client rejects', async () => {
      const provider = createRocketFlagProvider(mockClient);
      OpenFeature.setProvider(provider);
      const client = OpenFeature.getClient();
      const flagKey = 'test-flag-error';
      const errorMessage = 'Network error';

      mockClient.getFlag.mockRejectedValue(new Error(errorMessage));

      const initialDetails = provider.resolveBooleanEvaluation(flagKey, false, {}, mockLogger);
      expect(initialDetails.reason).toBe(StandardResolutionReasons.STALE);

      await new Promise((resolve) => setTimeout(resolve, 0));

      const finalDetails = client.getBooleanDetails(flagKey, false);

      expect(finalDetails.value).toBe(false); // Default value
      expect(finalDetails.reason).toBe(StandardResolutionReasons.ERROR);
      expect(finalDetails.errorCode).toBe(ErrorCode.GENERAL);
      expect(finalDetails.errorMessage).toBe(errorMessage);
    });
  });

  // Tests for other evaluation types to ensure they return TYPE_MISMATCH
  describe('Unsupported Evaluations', () => {
    const provider = createRocketFlagProvider(mockClient);

    it('resolveStringEvaluation should return TYPE_MISMATCH error', () => {
      const details = provider.resolveStringEvaluation('flag', 'default', {}, mockLogger);
      expect(details.reason).toBe(StandardResolutionReasons.ERROR);
      expect(details.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
      expect(details.value).toBe('default');
    });

    it('resolveNumberEvaluation should return TYPE_MISMATCH error', () => {
      const details = provider.resolveNumberEvaluation('flag', 123, {}, mockLogger);
      expect(details.reason).toBe(StandardResolutionReasons.ERROR);
      expect(details.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
      expect(details.value).toBe(123);
    });

    it('resolveObjectEvaluation should return TYPE_MISMATCH error', () => {
      const defaultValue = { key: 'value' };
      const details = provider.resolveObjectEvaluation('flag', defaultValue, {}, mockLogger);
      expect(details.reason).toBe(StandardResolutionReasons.ERROR);
      expect(details.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
      expect(details.value).toEqual(defaultValue);
    });
  });
});
