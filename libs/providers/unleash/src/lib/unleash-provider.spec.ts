import { UnleashProvider } from './unleash-provider';
import { TypeMismatchError } from '@openfeature/server-sdk';
import testdata from './testdata.json';
import TestLogger from './test-logger';

const endpoint = 'http://localhost:4242/api/';
const logger = new TestLogger();
const valueProperty = 'value';

jest.mock('make-fetch-happen', () =>
  jest.fn(async (url, options) => {
    console.log(`Intercepted fetch to: ${url}`, options); // Debugging output

    return {
      status: 200,
      statusCode: 200,
      ok: true,
      json: async () => testdata,
      headers: {
        get: jest.fn(() => 'application/json'), // Mock header retrieval
      },
    };
  }),
);

describe('UnleashProvider', () => {
  let provider: UnleashProvider;

  it('should be an instance of UnleashProvider', async () => {
    provider = new UnleashProvider(
      {
        url: endpoint,
        appName: 'test',
        customHeaders: { Authorization: 'test' },
        disableMetrics: true,
      },
      logger,
    );
    await provider.initialize();
    expect(provider).toBeInstanceOf(UnleashProvider);
  });
});

describe('UnleashProvider evaluations', () => {
  let provider: UnleashProvider;

  beforeAll(async () => {
    provider = new UnleashProvider(
      {
        url: endpoint,
        appName: 'test',
        customHeaders: { Authorization: 'test' },
        disableMetrics: true,
      },
      logger,
    );
    await provider.initialize();
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

    it('should throw TypeMismatchError if requested variant type is not a string', async () => {
      await expect(provider.resolveStringEvaluation('variantToggleJson', 'default string')).rejects.toThrow(
        TypeMismatchError,
      );
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

    it('should throw TypeMismatchError if requested variant type is not a number', async () => {
      await expect(provider.resolveNumberEvaluation('variantToggleCsv', 0)).rejects.toThrow(TypeMismatchError);
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

    it('should throw TypeMismatchError if requested variant type is not json or csv', async () => {
      await expect(provider.resolveObjectEvaluation('variantToggleInteger', 'a,b,c,d')).rejects.toThrow(
        TypeMismatchError,
      );
    });
  });
});
