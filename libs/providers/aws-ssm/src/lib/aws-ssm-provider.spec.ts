import type { SSMClientConfig } from '@aws-sdk/client-ssm';
import { AwsSsmProvider } from './aws-ssm-provider';
import { ErrorCode, StandardResolutionReasons } from '@openfeature/core';

describe("aws-ssm-provider.ts - AwsSsmProvider", () => {

  let provider: AwsSsmProvider;
  let getBooleanValueSpy: jest.SpyInstance;
  let getStringValueSpy: jest.SpyInstance;
  let getNumberValueSpy: jest.SpyInstance;
  let getObjectValueSpy: jest.SpyInstance;

  const mockSsmClientConfig: SSMClientConfig = {
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'accessKeyId',
      secretAccessKey: 'secretAccessKey',
    },
  };

  beforeAll(() => {
    provider = new AwsSsmProvider({
      ssmClientConfig: mockSsmClientConfig,
      cacheOpts: {
        enabled: true,
        ttl: 1000,
        size: 100,
      },
    });

    getBooleanValueSpy = jest.spyOn(provider.service, 'getBooleanValue');
    getStringValueSpy = jest.spyOn(provider.service, 'getStringValue');
    getNumberValueSpy = jest.spyOn(provider.service, 'getNumberValue');
    getObjectValueSpy = jest.spyOn(provider.service, 'getObjectValue');
  });

  describe("resolveBooleanEvaluation", () => {

    it("should return cached value when flag is cached", async () => {
      provider.cache.set('test', {
        value: true,
        reason: StandardResolutionReasons.STATIC,
      });

      const result = await provider.resolveBooleanEvaluation('test', false, {});

      expect(result).toEqual({
        value: true,
        reason: StandardResolutionReasons.CACHED,
      });
    });

    it("should return default value when getBooleanValue rejects", async () => {
      getBooleanValueSpy.mockRejectedValue(new Error());

      const result = await provider.resolveBooleanEvaluation('test-error', false, {});

      expect(result).toEqual({
        value: false,
        reason: StandardResolutionReasons.ERROR,
        errorMessage: 'An unknown error occurred',
        errorCode: ErrorCode.GENERAL,
      });
    });

    it("should resolve with expected value when getBooleanValue resolves", async () => {
      getBooleanValueSpy.mockResolvedValue({
        value: true,
        reason: StandardResolutionReasons.STATIC,
      });

      const result = await provider.resolveBooleanEvaluation('test-success', false, {});

      expect(result).toEqual({
        value: true,
        reason: StandardResolutionReasons.STATIC,
      });
    });
  });

  describe("resolveStringEvaluation", () => {

    it("should return cached value when flag is cached", async () => {
      provider.cache.set('test-string', {
        value: 'somestring',
        reason: StandardResolutionReasons.STATIC,
      });

      const result = await provider.resolveStringEvaluation('test-string', 'default', {});

      expect(result).toEqual({
        value: 'somestring',
        reason: StandardResolutionReasons.CACHED,
      });
    });

    it("should return default value when getStringValue rejects", async () => {
      getStringValueSpy.mockRejectedValue(new Error());

      const result = await provider.resolveStringEvaluation('test-string-error', 'default', {});

      expect(result).toEqual({
        value: 'default',
        reason: StandardResolutionReasons.ERROR,
        errorMessage: 'An unknown error occurred',
        errorCode: ErrorCode.GENERAL,
      });
    });

    it("should resolve with expected value when getStringValue resolves", async () => {
      getStringValueSpy.mockResolvedValue({
        value: 'somestring',
        reason: StandardResolutionReasons.STATIC,
      });

      const result = await provider.resolveStringEvaluation('test-string-success', 'default', {});

      expect(result).toEqual({
        value: 'somestring',
        reason: StandardResolutionReasons.STATIC,
      });
    });
  });

  describe("resolveNumberEvaluation", () => {

    it("should return cached value when flag is cached", async () => {
      provider.cache.set('test-number', {
        value: 489,
        reason: StandardResolutionReasons.STATIC,
      });

      const result = await provider.resolveNumberEvaluation('test-number', -1, {});

      expect(result).toEqual({
        value: 489,
        reason: StandardResolutionReasons.CACHED,
      });
    });

    it("should return default value when getNumberValue rejects", async () => {
      getNumberValueSpy.mockRejectedValue(new Error());

      const result = await provider.resolveNumberEvaluation('test-number-error', -1, {});

      expect(result).toEqual({
        value: -1,
        reason: StandardResolutionReasons.ERROR,
        errorMessage: 'An unknown error occurred',
        errorCode: ErrorCode.GENERAL,
      });
    });

    it("should resolve with expected value when getNumberValue resolves", async () => {
      getNumberValueSpy.mockResolvedValue({
        value: 489,
        reason: StandardResolutionReasons.STATIC,
      });

      const result = await provider.resolveNumberEvaluation('test-number-success', -1, {});

      expect(result).toEqual({
        value: 489,
        reason: StandardResolutionReasons.STATIC,
      });
    });
  });

  describe("resolveObjectEvaluation", () => {

    it("should return cached value when flag is cached", async () => {
      provider.cache.set('test-object', {
        value: { default: false },
        reason: StandardResolutionReasons.STATIC,
      });

      const result = await provider.resolveObjectEvaluation('test-object', { default: true }, {});

      expect(result).toEqual({
        value: { default: false },
        reason: StandardResolutionReasons.CACHED,
      });
    });

    it("should return default value when getObjectValue rejects", async () => {
      getObjectValueSpy.mockRejectedValue(new Error());

      const result = await provider.resolveObjectEvaluation('test-object-error', { default: true }, {});

      expect(result).toEqual({
        value: { default: true },
        reason: StandardResolutionReasons.ERROR,
        errorMessage: 'An unknown error occurred',
        errorCode: ErrorCode.GENERAL,
      });
    });

    it("should resolve with expected value when getObjectValue resolves", async () => {
      getObjectValueSpy.mockResolvedValue({
        value: { default: true },
        reason: StandardResolutionReasons.STATIC,
      });

      const result = await provider.resolveObjectEvaluation('test-object-success', -1, {});

      expect(result).toEqual({
        value: { default: true },
        reason: StandardResolutionReasons.STATIC,
      });
    });
  });

  afterEach(() => {
    provider.cache.clear();
    jest.clearAllMocks();
  });
});
