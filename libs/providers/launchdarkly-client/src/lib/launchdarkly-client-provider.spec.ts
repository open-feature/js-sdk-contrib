import { LaunchDarklyClientProvider } from './launchdarkly-client-provider';
import { Client, ErrorCode, OpenFeature } from '@openfeature/web-sdk';

import TestLogger from './test-logger';
import translateContext from './translate-context';

jest.mock('launchdarkly-js-client-sdk', () => {
  const actualModule = jest.requireActual('launchdarkly-js-client-sdk');
  return {
    __esModule: true,
    ...actualModule,
    initialize: jest.fn(),
  };
});

import { initialize, type LDClient } from 'launchdarkly-js-client-sdk';

const logger: TestLogger = new TestLogger();
const testFlagKey = 'a-key';

describe('LaunchDarklyClientProvider', () => {
  let ldProvider: LaunchDarklyClientProvider;
  let ofClient: Client;
  const ldClientMock: jest.Mocked<LDClient> = {
    variationDetail: jest.fn(),
    identify: jest.fn(),
    waitForInitialization: jest.fn(),
    on: jest.fn(),
    close: jest.fn(),
  } as unknown as jest.Mocked<LDClient>;

  beforeAll(() => {
    ldProvider = new LaunchDarklyClientProvider('test-env-key', { logger });
    OpenFeature.setProvider(ldProvider);
    ofClient = OpenFeature.getClient();
  });
  beforeEach(() => {
    logger.reset();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set the environment key and logger correctly', () => {
      const envKey = 'your-env-key';
      const ldOptionsMock = {};

      const provider = new LaunchDarklyClientProvider(envKey, { logger, ...ldOptionsMock });

      expect(provider['envKey']).toEqual(envKey);
      expect(provider['logger']).toEqual(logger);
    });

    it('should set a default logger if not provided', () => {
      const envKey = 'your-env-key';
      const ldOptionsMock = {};

      const provider = new LaunchDarklyClientProvider(envKey, { ...ldOptionsMock });

      expect(provider['envKey']).toEqual(envKey);
      expect(provider['logger']).toBeDefined();
    });

    it('should initialize with LDOptions when provided', () => {
      const envKey = 'your-env-key';
      const ldOptionsMock = { hash: 'fooHash', streaming: true };

      const provider = new LaunchDarklyClientProvider(envKey, { logger, ...ldOptionsMock });

      expect(provider['ldOptions']).toStrictEqual({ ...ldOptionsMock, logger });
    });
  });

  describe('initialize', () => {
    (initialize as jest.Mock).mockReturnValue(ldClientMock);
    const envKey = 'your-env-key';
    const provider = new LaunchDarklyClientProvider(envKey, { logger });

    it('should call Ld initialize function with correct arguments', async () => {
      await provider.initialize();
      expect(initialize).toHaveBeenCalledTimes(1);
      /* when not set in open feauture LD sdk initialize should be called with the anonymous context*/
      expect(initialize).toHaveBeenCalledWith(envKey, { anonymous: true }, { logger });
    });

    it('should set the status to READY if initialization succeeds', async () => {
      ldClientMock.waitForInitialization.mockResolvedValue();
      await provider.initialize();
      expect(ldClientMock.waitForInitialization).toHaveBeenCalledTimes(1);
      expect(provider.status).toBe('READY');
    });

    it('should set the status to ERROR if initialization fails', async () => {
      ldClientMock.waitForInitialization.mockRejectedValueOnce(new Error('mock error in provider'));
      await provider.initialize();
      expect(provider.status).toBe('ERROR');
    });
  });

  describe('resolveBooleanEvaluation', () => {
    it('calls the client correctly for boolean variations', () => {
      ldClientMock.variationDetail = jest.fn().mockReturnValue({
        value: true,
        reason: {
          kind: 'OFF',
        },
      });
      ofClient.getBooleanDetails(testFlagKey, false);
      expect(ldClientMock.variationDetail).toHaveBeenCalledWith(testFlagKey, false);
      jest.clearAllMocks();
      ofClient.getBooleanValue(testFlagKey, false);
      expect(ldClientMock.variationDetail).toHaveBeenCalledWith(testFlagKey, false);
    });

    it('handles correct return types for boolean variations', () => {
      ldClientMock.variationDetail = jest.fn().mockReturnValue({
        value: true,
        variationIndex: 0,
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getBooleanDetails(testFlagKey, false);
      expect(res).toEqual({
        flagKey: testFlagKey,
        flagMetadata: {},
        value: true,
        reason: 'OFF',
        variant: '0',
      });
    });

    it('handles incorrect return types for boolean variations', () => {
      ldClientMock.variationDetail = jest.fn().mockReturnValue({
        value: 'badness',
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getBooleanDetails(testFlagKey, false);
      expect(res).toEqual(
        expect.objectContaining({
          flagKey: testFlagKey,
          flagMetadata: {},
          value: false,
          reason: 'ERROR',
          errorCode: 'TYPE_MISMATCH',
        }),
      );
    });
  });

  describe('resolveNumberEvaluation', () => {
    it('calls the client correctly for numeric variations', () => {
      ldClientMock.variationDetail = jest.fn().mockReturnValue({
        value: 8,
        reason: {
          kind: 'OFF',
        },
      });

      ofClient.getNumberDetails(testFlagKey, 0);
      expect(ldClientMock.variationDetail).toHaveBeenCalledWith(testFlagKey, 0);
      jest.clearAllMocks();
      ofClient.getNumberValue(testFlagKey, 0);
      expect(ldClientMock.variationDetail).toHaveBeenCalledWith(testFlagKey, 0);
    });

    it('handles correct return types for numeric variations', () => {
      ldClientMock.variationDetail = jest.fn().mockReturnValue({
        value: 17,
        variationIndex: 0,
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getNumberDetails(testFlagKey, 0);
      expect(res).toEqual({
        flagKey: testFlagKey,
        flagMetadata: {},
        value: 17,
        reason: 'OFF',
        variant: '0',
      });
    });

    it('handles incorrect return types for numeric variations', () => {
      ldClientMock.variationDetail = jest.fn().mockReturnValue({
        value: true,
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getNumberDetails(testFlagKey, 0);
      expect(res).toEqual(
        expect.objectContaining({
          flagKey: testFlagKey,
          flagMetadata: {},
          value: 0,
          reason: 'ERROR',
          errorCode: 'TYPE_MISMATCH',
        }),
      );
    });
  });

  describe('resolveObjectEvaluation', () => {
    it('calls the client correctly for object variations', async () => {
      ldClientMock.variationDetail = jest.fn().mockReturnValue({
        value: { yes: 'no' },
        reason: {
          kind: 'OFF',
        },
      });

      ofClient.getObjectDetails(testFlagKey, {});
      expect(ldClientMock.variationDetail).toHaveBeenCalledWith(testFlagKey, {});
      jest.clearAllMocks();
      ofClient.getObjectValue(testFlagKey, {});
      expect(ldClientMock.variationDetail).toHaveBeenCalledWith(testFlagKey, {});
    });

    it('handles correct return types for object variations', () => {
      ldClientMock.variationDetail = jest.fn().mockReturnValue({
        value: { some: 'value' },
        variationIndex: 0,
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getObjectDetails(testFlagKey, {});
      expect(res).toEqual({
        flagKey: testFlagKey,
        flagMetadata: {},
        value: { some: 'value' },
        reason: 'OFF',
        variant: '0',
      });
    });

    it('handles incorrect return types for object variations', () => {
      ldClientMock.variationDetail = jest.fn().mockReturnValue({
        value: 22,
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getObjectDetails(testFlagKey, {});
      expect(res).toEqual(
        expect.objectContaining({
          flagKey: testFlagKey,
          flagMetadata: {},
          value: {},
          reason: 'ERROR',
          errorCode: 'TYPE_MISMATCH',
        }),
      );
    });
  });

  describe('resolveStringEvaluation', () => {
    it('calls the client correctly for string variations', () => {
      ldClientMock.variationDetail = jest.fn().mockReturnValue({
        value: 'test',
        reason: {
          kind: 'OFF',
        },
      });

      ofClient.getStringDetails(testFlagKey, 'default');
      expect(ldClientMock.variationDetail).toHaveBeenCalledWith(testFlagKey, 'default');
      jest.clearAllMocks();
      ofClient.getStringValue(testFlagKey, 'default');
      expect(ldClientMock.variationDetail).toHaveBeenCalledWith(testFlagKey, 'default');
    });

    it('handles correct return types for string variations', () => {
      ldClientMock.variationDetail = jest.fn().mockReturnValue({
        value: 'good',
        variationIndex: 0,
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getStringDetails(testFlagKey, 'default');
      expect(res).toEqual({
        flagKey: testFlagKey,
        flagMetadata: {},
        value: 'good',
        reason: 'OFF',
        variant: '0',
      });
    });

    it('handles incorrect return types for string variations', () => {
      ldClientMock.variationDetail = jest.fn().mockReturnValue({
        value: true,
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getStringDetails(testFlagKey, 'default');
      expect(res).toEqual(
        expect.objectContaining({
          flagKey: testFlagKey,
          flagMetadata: {},
          value: 'default',
          reason: 'ERROR',
          errorCode: 'TYPE_MISMATCH',
        }),
      );
    });
  });

  it.each([
    ['CLIENT_NOT_READY', ErrorCode.PROVIDER_NOT_READY],
    ['MALFORMED_FLAG', ErrorCode.PARSE_ERROR],
    ['FLAG_NOT_FOUND', ErrorCode.FLAG_NOT_FOUND],
    ['USER_NOT_SPECIFIED', ErrorCode.TARGETING_KEY_MISSING],
    ['UNSPECIFIED', ErrorCode.GENERAL],
    [undefined, ErrorCode.GENERAL],
  ])('handles errors from the client', async (ldError, ofError) => {
    ldClientMock.variationDetail = jest.fn().mockReturnValue({
      value: { yes: 'no' },
      reason: {
        kind: 'ERROR',
        errorKind: ldError,
      },
    });

    const res = ofClient.getObjectDetails(testFlagKey, {});
    expect(res).toEqual(
      expect.objectContaining({
        flagKey: testFlagKey,
        flagMetadata: {},
        reason: 'ERROR',
        errorCode: ofError,
      }),
    );
  });

  it('includes the variant', async () => {
    ldClientMock.variationDetail = jest.fn().mockReturnValue({
      value: { yes: 'no' },
      variationIndex: 22,
      reason: {
        kind: 'OFF',
      },
    });

    const res = ofClient.getObjectDetails(testFlagKey, {});
    expect(res).toEqual({
      flagKey: testFlagKey,
      flagMetadata: {},
      value: { yes: 'no' },
      variant: '22',
      reason: 'OFF',
    });
  });

  describe('onContextChange', () => {
    it('logs information about missing keys', async () => {
      ldClientMock.identify = jest.fn().mockResolvedValue({});
      await OpenFeature.setContext({});
      expect(ldClientMock.identify).toHaveBeenCalledWith(translateContext(logger, {}));
      expect(logger.logs[0]).toEqual(
        "The EvaluationContext must contain either a 'targetingKey' " + "or a 'key' and the type must be a string.",
      );
    });

    it('logs information about double keys', async () => {
      ldClientMock.identify = jest.fn().mockResolvedValue({});
      await OpenFeature.setContext({ targetingKey: '1', key: '2' });
      expect(ldClientMock.identify).toHaveBeenCalledWith(translateContext(logger, { targetingKey: '1', key: '2' }));
      expect(logger.logs[0]).toEqual(
        "The EvaluationContext contained both a 'targetingKey' and a" +
          " 'key' attribute. The 'key' attribute will be discarded.",
      );
    });
  });
});
