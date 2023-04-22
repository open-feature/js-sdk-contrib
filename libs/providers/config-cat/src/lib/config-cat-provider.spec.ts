import { ConfigCatProvider } from './config-cat-provider';
import { ParseError, TypeMismatchError } from '@openfeature/js-sdk';
import {
  IConfigCatClient,
  getClient,
  createFlagOverridesFromMap,
  OverrideBehaviour,
  createConsoleLogger,
} from 'configcat-js';
import { LogLevel } from 'configcat-common';

describe('ConfigCatProvider', () => {
  const targetingKey = '';

  let client: IConfigCatClient;
  let provider: ConfigCatProvider;

  const values = {
    booleanFalse: false,
    booleanTrue: true,
    number1: 1,
    number2: 2,
    stringTest: 'Test',
    jsonValid: JSON.stringify({ valid: true }),
    jsonInvalid: '{test:123',
    jsonPrimitive: JSON.stringify(123),
  };

  beforeAll(() => {
    client = getClient('__key__', undefined, {
      logger: createConsoleLogger(LogLevel.Off),
      offline: true,
      flagOverrides: createFlagOverridesFromMap(values, OverrideBehaviour.LocalOnly),
    });
    provider = ConfigCatProvider.createFromClient(client);
  });

  afterAll(() => {
    client.dispose();
  });

  it('should be an instance of ConfigCatProvider', () => {
    expect(provider).toBeInstanceOf(ConfigCatProvider);
  });

  describe('method resolveBooleanEvaluation', () => {
    it('should return default value for missing value', async () => {
      const value = await provider.resolveBooleanEvaluation('nonExistent', false, { targetingKey });
      expect(value).toHaveProperty('value', false);
    });

    it('should return right value if key exists', async () => {
      const value = await provider.resolveBooleanEvaluation('booleanTrue', false, { targetingKey });
      expect(value).toHaveProperty('value', values.booleanTrue);
    });

    it('should throw TypeMismatchError if type is different than expected', async () => {
      await expect(provider.resolveBooleanEvaluation('number1', false, { targetingKey })).rejects.toThrow(
        TypeMismatchError
      );
    });
  });

  describe('method resolveStringEvaluation', () => {
    it('should return default value for missing value', async () => {
      const value = await provider.resolveStringEvaluation('nonExistent', 'default', { targetingKey });
      expect(value).toHaveProperty('value', 'default');
    });

    it('should return right value if key exists', async () => {
      const value = await provider.resolveStringEvaluation('stringTest', 'default', { targetingKey });
      expect(value).toHaveProperty('value', values.stringTest);
    });

    it('should throw TypeMismatchError if type is different than expected', async () => {
      await expect(provider.resolveStringEvaluation('number1', 'default', { targetingKey })).rejects.toThrow(
        TypeMismatchError
      );
    });
  });

  describe('method resolveNumberEvaluation', () => {
    it('should return default value for missing value', async () => {
      const value = await provider.resolveNumberEvaluation('nonExistent', 0, { targetingKey });
      expect(value).toHaveProperty('value', 0);
    });

    it('should return right value if key exists', async () => {
      const value = await provider.resolveNumberEvaluation('number1', 0, { targetingKey });
      expect(value).toHaveProperty('value', values.number1);
    });

    it('should throw TypeMismatchError if type is different than expected', async () => {
      await expect(provider.resolveNumberEvaluation('stringTest', 0, { targetingKey })).rejects.toThrow(
        TypeMismatchError
      );
    });
  });

  describe('method resolveObjectEvaluation', () => {
    it('should return default value for missing value', async () => {
      const value = await provider.resolveObjectEvaluation('nonExistent', {}, { targetingKey });
      expect(value).toHaveProperty('value', {});
    });

    it('should return right value if key exists', async () => {
      const value = await provider.resolveObjectEvaluation('jsonValid', {}, { targetingKey });
      expect(value).toHaveProperty('value', JSON.parse(values.jsonValid));
    });

    it('should throw ParseError if string is not valid JSON', async () => {
      await expect(provider.resolveObjectEvaluation('jsonInvalid', {}, { targetingKey })).rejects.toThrow(ParseError);
    });

    it('should throw TypeMismatchError if string is only a JSON primitive', async () => {
      await expect(provider.resolveObjectEvaluation('jsonPrimitive', {}, { targetingKey })).rejects.toThrow(
        TypeMismatchError
      );
    });
  });
});
