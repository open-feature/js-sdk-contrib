import { TypeMismatchError } from '@openfeature/server-sdk';
import { FliptProvider } from './flipt-provider';

describe('FliptProvider', () => {
  let provider: FliptProvider;

  beforeAll(async () => {
    provider = new FliptProvider('default', { url: 'http://localhost:8080' });

    await provider.initialize();
  });

  describe('method resolveStringEvaluation', () => {
    it('should return default value for missing value', async () => {
      const value = await provider.resolveStringEvaluation('nonExistent', 'default', { fizz: 'buzz' });
      expect(value).toHaveProperty('value', 'default');
    });

    it('should return right value if key exists', async () => {
      const value = await provider.resolveStringEvaluation('flag_string', 'default', { fizz: 'buzz' });
      expect(value).toHaveProperty('value', 'string');
    });

    it('should throw TypeMismatchError on non-string value', async () => {
      await expect(provider.resolveStringEvaluation('flag_number', 'default', { fizz: 'buzz' })).rejects.toThrow(
        TypeMismatchError,
      );
    });
  });

  describe('method resolveBooleanEvaluation', () => {
    it('should return default value for disabled flag', async () => {
      const value = await provider.resolveBooleanEvaluation('flag_boolean_disabled', true, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', true);
    });

    it('should return right value if key exists', async () => {
      const value = await provider.resolveBooleanEvaluation('flag_boolean', true, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', true);
    });
  });

  describe('method resolveNumberEvaluation', () => {
    it('should return default value for missing value', async () => {
      const value = await provider.resolveNumberEvaluation('nonExistent', 0, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', 0);
    });

    it('should return right value if key exists', async () => {
      const value = await provider.resolveNumberEvaluation('flag_number', 0, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', 1);
    });

    it('should throw TypeMismatchError on non-number value', async () => {
      await expect(provider.resolveNumberEvaluation('flag_string', 0, { fizz: 'buzz' })).rejects.toThrow(
        TypeMismatchError,
      );
    });
  });

  describe('method resolveObjectEvaluation', () => {
    it('should return default value for missing value', async () => {
      const value = await provider.resolveObjectEvaluation('nonExistent', {}, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', 0);
    });

    it('should return right value if key exists', async () => {
      const value = await provider.resolveObjectEvaluation('flag_json', {}, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', { hello: 'world' });
    });

    it('should throw TypeMismatchError on non-number value', async () => {
      await expect(provider.resolveObjectEvaluation('flag_string', {}, { fizz: 'buzz' })).rejects.toThrow(
        TypeMismatchError,
      );
    });
  });
});
