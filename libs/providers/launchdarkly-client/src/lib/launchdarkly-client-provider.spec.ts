import { LaunchDarklyClientProvider } from './launchdarkly-client-provider';
import {LDClient} from 'launchdarkly-js-client-sdk';
import {Client, ErrorCode, OpenFeature} from '@openfeature/web-sdk';

import TestLogger from './test-logger';
import translateContext from './translate-context';

const logger: TestLogger = new TestLogger();
const testFlagKey = 'a-key';
describe('LaunchDarklyClientProvider', () => {
  let ldClient: Partial<LDClient>;
  let ldProvider: LaunchDarklyClientProvider
  let ofClient: Client;

  beforeAll(() => {
    ldClient = {
      variationDetail: jest.fn(),
      waitUntilReady: jest.fn().mockResolvedValue({}),
      getContext: jest.fn().mockReturnValue({}),
    };
    ldProvider = new LaunchDarklyClientProvider(ldClient as LDClient, { logger });
    OpenFeature.setProvider(ldProvider);
    ofClient = OpenFeature.getClient();
  })
  beforeEach(() => {
    logger.reset();
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    test('should not update context if it did not change', async () => {
      const newContext = {kind: 'user', targetingKey: 'test-key'};
      const oldContext = {kind: 'user', key: 'test-key'};
      ldClient.getContext = jest.fn().mockReturnValue(oldContext);
      ldClient.identify = jest.fn().mockResolvedValue(undefined);
      await ldProvider.initialize(newContext);
      expect(ldClient.identify).not.toHaveBeenCalled();
    });

    test('should update context if it changed', async() => {
      const newContext = {kind: 'organization', targetingKey: 'test-key'};
      const oldContext = {kind: 'user', key: 'test-key'};
      ldClient.getContext = jest.fn().mockReturnValue(oldContext);
      ldClient.identify = jest.fn().mockResolvedValue(undefined);
      await ldProvider.initialize(newContext);
      expect(ldClient.identify).toHaveBeenCalledTimes(1);
      expect(ldClient.identify).toHaveBeenCalledWith(translateContext(logger, newContext));
    });

    test('should not update context if anonymous and no key', async() => {
      const newContext = {anonymous: true};
      const oldContext = {kind: 'user', anonymous: true, key: 'generated-key'};
      ldClient.getContext = jest.fn().mockReturnValue(oldContext);
      ldClient.identify = jest.fn().mockResolvedValue(undefined);
      await ldProvider.initialize(newContext);
      expect(ldClient.identify).not.toHaveBeenCalled();
    });

    test('should update context if anonymous and custom key', async() => {
      const newContext = {anonymous: true, key: 'custom-key'};
      const oldContext = {kind: 'user', anonymous: true, key: 'generated-key'};
      ldClient.getContext = jest.fn().mockReturnValue(oldContext);
      ldClient.identify = jest.fn().mockResolvedValue(undefined);
      await ldProvider.initialize(newContext);
      expect(ldClient.identify).toHaveBeenCalledTimes(1);
      expect(ldClient.identify).toHaveBeenCalledWith(translateContext(logger, newContext));
    });

  });

  describe('resolveBooleanEvaluation', () => {
    it('calls the client correctly for boolean variations', () => {
      ldClient.variationDetail = jest.fn(() => ({
        value: true,
        reason: {
          kind: 'OFF',
        },
      }));
      ofClient.getBooleanDetails(testFlagKey, false);
      expect(ldClient.variationDetail)
        .toHaveBeenCalledWith(testFlagKey, false);
      jest.clearAllMocks();
      ofClient.getBooleanValue(testFlagKey, false);
      expect(ldClient.variationDetail)
        .toHaveBeenCalledWith(testFlagKey, false);
    });

    it('handles correct return types for boolean variations', () => {
      ldClient.variationDetail = jest.fn().mockReturnValue({
        value: true,
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getBooleanDetails(testFlagKey, false);
      expect(res).toEqual({
        flagKey: testFlagKey,
        value: true,
        reason: 'OFF',
      });
    });

    it('handles incorrect return types for boolean variations', () => {
      ldClient.variationDetail = jest.fn().mockReturnValue({
        value: 'badness',
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getBooleanDetails(testFlagKey, false);
      expect(res).toEqual({
        flagKey: testFlagKey,
        value: false,
        reason: 'ERROR',
        errorCode: 'TYPE_MISMATCH',
      });
    });

  });

  describe('resolveNumberEvaluation', () => {
    it('calls the client correctly for numeric variations', () => {
      ldClient.variationDetail = jest.fn().mockReturnValue({
        value: 8,
        reason: {
          kind: 'OFF',
        },
      });

      ofClient.getNumberDetails(testFlagKey, 0);
      expect(ldClient.variationDetail)
        .toHaveBeenCalledWith(testFlagKey, 0);
      jest.clearAllMocks();
      ofClient.getNumberValue(testFlagKey, 0);
      expect(ldClient.variationDetail)
        .toHaveBeenCalledWith(testFlagKey, 0);
    });

    it('handles correct return types for numeric variations', () => {
      ldClient.variationDetail = jest.fn().mockReturnValue({
        value: 17,
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getNumberDetails(testFlagKey, 0);
      expect(res).toEqual({
        flagKey: testFlagKey,
        value: 17,
        reason: 'OFF',
      });
    });

    it('handles incorrect return types for numeric variations', () => {
      ldClient.variationDetail = jest.fn().mockReturnValue({
        value: true,
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getNumberDetails(testFlagKey, 0);
      expect(res).toEqual({
        flagKey: testFlagKey,
        value: 0,
        reason: 'ERROR',
        errorCode: 'TYPE_MISMATCH',
      });
    });
  });

  describe('resolveObjectEvaluation', () => {
    it('calls the client correctly for object variations', async () => {
      ldClient.variationDetail = jest.fn().mockReturnValue({
        value: { yes: 'no' },
        reason: {
          kind: 'OFF',
        },
      });

      ofClient.getObjectDetails(testFlagKey, {});
      expect(ldClient.variationDetail)
        .toHaveBeenCalledWith(testFlagKey, {});
      jest.clearAllMocks();
      ofClient.getObjectValue(testFlagKey, {});
      expect(ldClient.variationDetail)
        .toHaveBeenCalledWith(testFlagKey, {});
    });

    it('handles correct return types for object variations', () => {
      ldClient.variationDetail = jest.fn().mockReturnValue({
        value: { some: 'value' },
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getObjectDetails(testFlagKey, {});
      expect(res).toEqual({
        flagKey: testFlagKey,
        value: { some: 'value' },
        reason: 'OFF',
      });
    });

    it('handles incorrect return types for object variations', () => {
      ldClient.variationDetail = jest.fn().mockReturnValue({
        value: 22,
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getObjectDetails(testFlagKey, {});
      expect(res).toEqual({
        flagKey: testFlagKey,
        value: {},
        reason: 'ERROR',
        errorCode: 'TYPE_MISMATCH',
      });
    });
  })

  describe('resolveStringEvaluation', ( ) => {
    it('calls the client correctly for string variations', () => {
      ldClient.variationDetail = jest.fn().mockReturnValue({
        value: 'test',
        reason: {
          kind: 'OFF',
        },
      });

      ofClient.getStringDetails(testFlagKey, 'default');
      expect(ldClient.variationDetail)
        .toHaveBeenCalledWith(testFlagKey, 'default');
      jest.clearAllMocks();
      ofClient.getStringValue(testFlagKey, 'default');
      expect(ldClient.variationDetail)
        .toHaveBeenCalledWith(testFlagKey, 'default');
    });

    it('handles correct return types for string variations', () => {
      ldClient.variationDetail = jest.fn().mockReturnValue({
        value: 'good',
        reason: {
          kind: 'OFF',
        },
      });

      const res = ofClient.getStringDetails(testFlagKey, 'default');
      expect(res).toEqual({
        flagKey: testFlagKey,
        value: 'good',
        reason: 'OFF',
      });
    });

    it('handles incorrect return types for string variations', () => {
      ldClient.variationDetail = jest.fn().mockReturnValue({
        value: true,
        reason: {
          kind: 'OFF',
        },
      });

      const res =  ofClient.getStringDetails(testFlagKey, 'default');
      expect(res).toEqual({
        flagKey: testFlagKey,
        value: 'default',
        reason: 'ERROR',
        errorCode: 'TYPE_MISMATCH',
      });
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
    ldClient.variationDetail = jest.fn().mockReturnValue({
      value: { yes: 'no' },
      reason: {
        kind: 'ERROR',
        errorKind: ldError,
      },
    });

    const res = await ofClient.getObjectDetails(testFlagKey, {});
    expect(res).toEqual({
      flagKey: testFlagKey,
      value: { yes: 'no' },
      reason: 'ERROR',
      errorCode: ofError,
    });
  });

  it('includes the variant', async () => {
    ldClient.variationDetail = jest.fn().mockReturnValue({
      value: { yes: 'no' },
      variationIndex: 22,
      reason: {
        kind: 'OFF',
      },
    });

    const res = await ofClient.getObjectDetails(testFlagKey, {});
    expect(res).toEqual({
      flagKey: testFlagKey,
      value: { yes: 'no' },
      variant: '22',
      reason: 'OFF',
    });
  });

  describe('onContextChange', () => {
    it('logs information about missing keys', async () => {
      ldClient.identify = jest.fn().mockResolvedValue({});
      await OpenFeature.setContext({});
      expect(ldClient.identify).toHaveBeenCalledWith(translateContext(logger, {}))
      expect(logger.logs[0]).toEqual("The EvaluationContext must contain either a 'targetingKey' "
        + "or a 'key' and the type must be a string.");
    });

    it('logs information about double keys', async () => {
      ldClient.identify = jest.fn().mockResolvedValue({});
      await OpenFeature.setContext({ targetingKey: '1', key: '2' });
      expect(ldClient.identify).toHaveBeenCalledWith(translateContext(logger, { targetingKey: '1', key: '2' }))
      expect(logger.logs[0]).toEqual("The EvaluationContext contained both a 'targetingKey' and a"
        + " 'key' attribute. The 'key' attribute will be discarded.");
    });
  });
});
