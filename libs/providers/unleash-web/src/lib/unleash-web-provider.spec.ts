import { UnleashWebProvider } from './unleash-web-provider';
import fetchMock, { enableFetchMocks } from 'jest-fetch-mock';

import testdata from './testdata.json';
import TestLogger from './test-logger';

describe('UnleashWebProvider', () => {
  const endpoint = 'http://localhost:4242';
  const logger = new TestLogger();
  const valueProperty = 'value';

  let provider: UnleashWebProvider;

  beforeEach(() => {
    fetchMock.mockClear();
    fetchMock.mockReset();
  });

  beforeAll(async () => {
    enableFetchMocks();
    //fetchMock.mockResponseOnce(JSON.stringify({"toggles":[]}));
    fetchMock.mockResponseOnce(JSON.stringify(testdata));
    provider = new UnleashWebProvider({ url: endpoint, clientKey: 'clientsecret', appName: 'test',}, logger);
    await provider.initialize();
  });

  it('should be an instance of UnleashWebProvider', async () => {
    expect(provider).toBeInstanceOf(UnleashWebProvider);
  });

  describe('method resolveBooleanEvaluation', () => {
    it('should return false for missing toggle', async () => {
      const evaluation = await provider.resolveBooleanEvaluation('nonExistent');
      expect(evaluation).toHaveProperty(valueProperty, false);
    });

    it('should return true if enabled toggle exists', async () => {
      const evaluation = await provider.resolveBooleanEvaluation('simpleToggle');
      expect(evaluation).toHaveProperty(valueProperty, true);
    });

    it('should return false if a disabled toggle exists', async () => {
      const evaluation = await provider.resolveBooleanEvaluation('disabledToggle');
      expect(evaluation).toHaveProperty(valueProperty, false);
    });
  });

  describe('method resolveStringEvaluation', () => {
    it('should return default value for missing value', async () => {
      const evaluation = await provider.resolveStringEvaluation('nonExistent', 'defaultValue');
      expect(evaluation).toHaveProperty(valueProperty, 'defaultValue');
    });

    it('should return right value if variant toggle exists and is enabled', async () => {
      const evaluation = await provider.resolveStringEvaluation('variantToggleString', 'variant1');
      expect(evaluation).toHaveProperty(valueProperty, 'some-text');
    });

    it('should return default value if a toggle is disabled', async () => {
      const evaluation = await provider.resolveStringEvaluation('disabledVariant', 'defaultValue');
      expect(evaluation).toHaveProperty(valueProperty, 'defaultValue');
    });
  });

  describe('method resolveNumberEvaluation', () => {
    it('should return default value for missing value', async () => {
      const evaluation = await provider.resolveNumberEvaluation('nonExistent', 5);
      expect(evaluation).toHaveProperty(valueProperty, 5);
    });

    it('should return integer value if variant toggle exists and is enabled', async () => {
      const evaluation = await provider.resolveNumberEvaluation('variantToggleInteger', 0);
      expect(evaluation).toHaveProperty(valueProperty, 3);
    });

    it('should return double value if variant toggle exists and is enabled', async () => {
      const evaluation = await provider.resolveNumberEvaluation('variantToggleDouble', 0);
      expect(evaluation).toHaveProperty(valueProperty, 1.2);
    });

    it('should return default value if a toggle is disabled', async () => {
      const evaluation = await provider.resolveNumberEvaluation('disabledVariant', 0);
      expect(evaluation).toHaveProperty(valueProperty, 0);
    });
  });

  describe('method resolveObjectEvaluation', () => {
    it('should return default value for missing value', async () => {
      const defaultValue = '{"notFound" : true}';
      const evaluation = await provider.resolveObjectEvaluation('nonExistent', JSON.parse(defaultValue));
      expect(evaluation).toHaveProperty(valueProperty, JSON.parse(defaultValue));
    });

    it('should return json value if variant toggle exists and is enabled', async () => {
      const expectedVariant = '{hello: world}';
      const evaluation = await provider.resolveObjectEvaluation('variantToggleJson', JSON.parse('{"default": false}'));
      expect(evaluation).toHaveProperty(valueProperty, expectedVariant);
    });

    it('should return csv value if variant toggle exists and is enabled', async () => {
      const evaluation = await provider.resolveObjectEvaluation('variantToggleCsv', 'a,b,c,d');
      expect(evaluation).toHaveProperty(valueProperty, '1,2,3,4');
    });

    it('should return default value if a toggle is disabled', async () => {
      const defaultValue = '{foo: bar}';
      const evaluation = await provider.resolveObjectEvaluation('disabledVariant', defaultValue);
      expect(evaluation).toHaveProperty(valueProperty, defaultValue);
    });
  });
});
