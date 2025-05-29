import type { SSMClientConfig } from '@aws-sdk/client-ssm';
import { AwsSsmProvider } from './aws-ssm-provider';
import { ErrorCode, StandardResolutionReasons } from '@openfeature/core';

const MOCK_SSM_CLIENT_CONFIG: SSMClientConfig = {
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'accessKeyId',
    secretAccessKey: 'secretAccessKey',
  },
};

const provider: AwsSsmProvider = new AwsSsmProvider({
  ssmClientConfig: MOCK_SSM_CLIENT_CONFIG,
  cacheOpts: {
    enabled: true,
    ttl: 1000,
    size: 100,
  },
});

describe(AwsSsmProvider.name, () => {
  describe(AwsSsmProvider.prototype.resolveBooleanEvaluation.name, () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    describe('when flag is cached', () => {
      afterAll(() => {
        provider.cache.clear();
      });
      it('should return cached value', async () => {
        provider.cache.set('test', {
          value: true,
          reason: StandardResolutionReasons.STATIC,
        });
        await expect(provider.resolveBooleanEvaluation('test', false, {})).resolves.toEqual({
          value: true,
          reason: StandardResolutionReasons.CACHED,
        });
      });
    });
    describe('when flag is not cached', () => {
      describe('when getBooleanValue rejects', () => {
        it('should return default value', async () => {
          jest.spyOn(provider.service, 'getBooleanValue').mockRejectedValue(new Error());
          await expect(provider.resolveBooleanEvaluation('test', false, {})).resolves.toEqual({
            value: false,
            reason: StandardResolutionReasons.ERROR,
            errorMessage: 'An unknown error occurred',
            errorCode: ErrorCode.GENERAL,
          });
        });
      });
      describe('when getBooleanValue resolves', () => {
        it('should resolve with expected value', async () => {
          jest.spyOn(provider.service, 'getBooleanValue').mockResolvedValue({
            value: true,
            reason: StandardResolutionReasons.STATIC,
          });
          await expect(provider.resolveBooleanEvaluation('test', false, {})).resolves.toEqual({
            value: true,
            reason: StandardResolutionReasons.STATIC,
          });
        });
      });
    });
  });
  describe(AwsSsmProvider.prototype.resolveStringEvaluation.name, () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    describe('when flag is cached', () => {
      afterAll(() => {
        provider.cache.clear();
      });
      it('should return cached value', async () => {
        provider.cache.set('test', {
          value: 'somestring',
          reason: StandardResolutionReasons.STATIC,
        });
        await expect(provider.resolveStringEvaluation('test', 'default', {})).resolves.toEqual({
          value: 'somestring',
          reason: StandardResolutionReasons.CACHED,
        });
      });
    });
    describe('when flag is not cached', () => {
      describe('when getStringValue rejects', () => {
        it('should return default value', async () => {
          jest.spyOn(provider.service, 'getStringValue').mockRejectedValue(new Error());
          await expect(provider.resolveStringEvaluation('test', 'default', {})).resolves.toEqual({
            value: 'default',
            reason: StandardResolutionReasons.ERROR,
            errorMessage: 'An unknown error occurred',
            errorCode: ErrorCode.GENERAL,
          });
        });
      });
      describe('when getStringValue resolves', () => {
        it('should resolve with expected value', async () => {
          jest.spyOn(provider.service, 'getStringValue').mockResolvedValue({
            value: 'somestring',
            reason: StandardResolutionReasons.STATIC,
          });
          await expect(provider.resolveStringEvaluation('test', 'default', {})).resolves.toEqual({
            value: 'somestring',
            reason: StandardResolutionReasons.STATIC,
          });
        });
      });
    });
  });
  describe(AwsSsmProvider.prototype.resolveNumberEvaluation.name, () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    describe('when flag is cached', () => {
      afterAll(() => {
        provider.cache.clear();
      });
      it('should return cached value', async () => {
        provider.cache.set('test', {
          value: 489,
          reason: StandardResolutionReasons.STATIC,
        });
        await expect(provider.resolveNumberEvaluation('test', -1, {})).resolves.toEqual({
          value: 489,
          reason: StandardResolutionReasons.CACHED,
        });
      });
    });
    describe('when flag is not cached', () => {
      describe('when getNumberValue rejects', () => {
        it('should return default value', async () => {
          jest.spyOn(provider.service, 'getNumberValue').mockRejectedValue(new Error());
          await expect(provider.resolveNumberEvaluation('test', -1, {})).resolves.toEqual({
            value: -1,
            reason: StandardResolutionReasons.ERROR,
            errorMessage: 'An unknown error occurred',
            errorCode: ErrorCode.GENERAL,
          });
        });
      });
      describe('when getNumberValue resolves', () => {
        it('should resolve with expected value', async () => {
          jest.spyOn(provider.service, 'getNumberValue').mockResolvedValue({
            value: 489,
            reason: StandardResolutionReasons.STATIC,
          });
          await expect(provider.resolveNumberEvaluation('test', -1, {})).resolves.toEqual({
            value: 489,
            reason: StandardResolutionReasons.STATIC,
          });
        });
      });
    });
  });
  describe(AwsSsmProvider.prototype.resolveObjectEvaluation.name, () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    describe('when flag is cached', () => {
      afterAll(() => {
        provider.cache.clear();
      });
      it('should return cached value', async () => {
        provider.cache.set('test', {
          value: { default: false },
          reason: StandardResolutionReasons.STATIC,
        });
        await expect(provider.resolveObjectEvaluation('test', { default: true }, {})).resolves.toEqual({
          value: { default: false },
          reason: StandardResolutionReasons.CACHED,
        });
      });
    });
    describe('when flag is not cached', () => {
      describe('when getObjectValue rejects', () => {
        it('should return default value', async () => {
          jest.spyOn(provider.service, 'getObjectValue').mockRejectedValue(new Error());
          await expect(provider.resolveObjectEvaluation('test', { default: true }, {})).resolves.toEqual({
            value: { default: true },
            reason: StandardResolutionReasons.ERROR,
            errorMessage: 'An unknown error occurred',
            errorCode: ErrorCode.GENERAL,
          });
        });
      });
      describe('when getObjectValue resolves', () => {
        it('should resolve with expected value', async () => {
          jest.spyOn(provider.service, 'getObjectValue').mockResolvedValue({
            value: { default: true },
            reason: StandardResolutionReasons.STATIC,
          });
          await expect(provider.resolveObjectEvaluation('test', -1, {})).resolves.toEqual({
            value: { default: true },
            reason: StandardResolutionReasons.STATIC,
          });
        });
      });
    });
  });
});
