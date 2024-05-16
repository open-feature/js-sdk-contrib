import { Context, GrowthBook, InitOptions } from '@growthbook/growthbook';
import { GrowthbookClientProvider } from './growthbook-client-provider';
import { Client, OpenFeature } from '@openfeature/web-sdk';

jest.mock('@growthbook/growthbook');

const testFlagKey = 'flag-key';
const growthbookContextMock: Context = {
  apiHost: 'http://api.growthbook.io',
  clientKey: 'sdk-test-key',
  attributes: {
    id: 1,
  },
};

const initOptionsMock: InitOptions = {
  timeout: 5000,
};

describe('GrowthbookClientProvider', () => {
  let gbProvider: GrowthbookClientProvider;
  let ofClient: Client;

  beforeAll(() => {
    gbProvider = new GrowthbookClientProvider(growthbookContextMock, initOptionsMock);
    OpenFeature.setProvider(gbProvider);
    ofClient = OpenFeature.getClient();
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be and instance of GrowthbookClientProvider', () => {
    expect(new GrowthbookClientProvider(growthbookContextMock, initOptionsMock)).toBeInstanceOf(
      GrowthbookClientProvider,
    );
  });

  describe('constructor', () => {
    it('should set the growthbook context & initOptions correctly', () => {
      const provider = new GrowthbookClientProvider(growthbookContextMock, initOptionsMock);

      expect(provider['context']).toEqual(growthbookContextMock);
      expect(provider['_initOptions']).toEqual(initOptionsMock);
    });
  });

  describe('initialize', () => {
    const provider = new GrowthbookClientProvider(growthbookContextMock);

    it('should call growthbook initialize function with correct arguments', async () => {
      const evalContext = { deviceId: 5 };
      await provider.initialize({ deviceId: 5 });

      expect(provider['_client']?.setAttributes).toHaveBeenCalledWith(evalContext);
    });
  });

  describe('resolveBooleanEvaluation', () => {
    it('handles correct return types for boolean variations', () => {
      jest.spyOn(GrowthBook.prototype, 'evalFeature').mockImplementation(() => ({
        value: true,
        source: 'experiment',
        on: true,
        off: false,
        ruleId: 'test',
        experimentResult: {
          value: true,
          variationId: 1,
          key: 'treatment',
          inExperiment: true,
          hashAttribute: 'id',
          hashValue: 'abc',
          featureId: testFlagKey,
        },
      }));

      const res = ofClient.getBooleanDetails(testFlagKey, false);
      expect(res).toEqual({
        flagKey: testFlagKey,
        flagMetadata: {},
        value: true,
        reason: 'experiment',
        variant: 'treatment',
      });
    });
  });

  describe('resolveStringEvaluation', () => {
    it('handles correct return types for string variations', () => {
      jest.spyOn(GrowthBook.prototype, 'evalFeature').mockImplementation(() => ({
        value: 'Experiment fearlessly, deliver confidently',
        source: 'experiment',
        on: true,
        off: false,
        ruleId: 'test',
        experimentResult: {
          value: 'Experiment fearlessly, deliver confidently',
          variationId: 1,
          key: 'treatment',
          inExperiment: true,
          hashAttribute: 'id',
          hashValue: 'abc',
          featureId: testFlagKey,
        },
      }));

      const res = ofClient.getStringDetails(testFlagKey, '');
      expect(res).toEqual({
        flagKey: testFlagKey,
        flagMetadata: {},
        value: 'Experiment fearlessly, deliver confidently',
        reason: 'experiment',
        variant: 'treatment',
      });
    });
  });

  describe('resolveNumberEvaluation', () => {
    it('handles correct return types for number variations', () => {
      jest.spyOn(GrowthBook.prototype, 'evalFeature').mockImplementation(() => ({
        value: 12345,
        source: 'experiment',
        on: true,
        off: false,
        ruleId: 'test',
        experimentResult: {
          value: 12345,
          variationId: 1,
          key: 'treatment',
          inExperiment: true,
          hashAttribute: 'id',
          hashValue: 'abc',
          featureId: testFlagKey,
        },
      }));

      const res = ofClient.getNumberDetails(testFlagKey, 1);
      expect(res).toEqual({
        flagKey: testFlagKey,
        flagMetadata: {},
        value: 12345,
        reason: 'experiment',
        variant: 'treatment',
      });
    });
  });

  describe('resolveObjectEvaluation', () => {
    it('handles correct return types for object variations', () => {
      jest.spyOn(GrowthBook.prototype, 'evalFeature').mockImplementation(() => ({
        value: { test: true },
        source: 'experiment',
        on: true,
        off: false,
        ruleId: 'test',
        experimentResult: {
          value: { test: true },
          variationId: 1,
          key: 'treatment',
          inExperiment: true,
          hashAttribute: 'id',
          hashValue: 'abc',
          featureId: testFlagKey,
        },
      }));

      const res = ofClient.getObjectDetails(testFlagKey, {});
      expect(res).toEqual({
        flagKey: testFlagKey,
        flagMetadata: {},
        value: { test: true },
        reason: 'experiment',
        variant: 'treatment',
      });
    });
  });
});
