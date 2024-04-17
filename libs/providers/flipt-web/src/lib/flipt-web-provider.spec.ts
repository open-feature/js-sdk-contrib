import { GeneralError, TypeMismatchError } from '@openfeature/web-sdk';
import { FliptWebProvider } from './flipt-web-provider';
import fs from 'fs';
import path from 'path';

describe('FliptWebProvider', () => {
  const endpoint = 'http://localhost:8080';

  const pathToData = path.resolve(__dirname, '..', '__mocks__/state.json');
  const data = JSON.parse(fs.readFileSync(pathToData, 'utf-8'));

  const fetcher = (): Promise<Response> => {
    return Promise.resolve(new Response(JSON.stringify(data)));
  };

  let provider: FliptWebProvider;

  beforeEach(async () => {
    provider = new FliptWebProvider('default', { url: endpoint, fetcher });

    await provider.initialize();
  });

  it('should be and instance of FliptWebProvider', () => {
    expect(provider).toBeInstanceOf(FliptWebProvider);
  });

  describe('method resolveStringEvaluation', () => {
    it('should throw general error for non-existent flag', () => {
      expect(() => {
        provider.resolveStringEvaluation('nonExistent', 'default', { fizz: 'buzz' });
      }).toThrow(GeneralError);
    });

    it('should return right value if key exists', () => {
      const value = provider.resolveStringEvaluation('flag_string', 'default', { fizz: 'buzz' });
      expect(value).toHaveProperty('value', 'variant1');
      expect(value).toHaveProperty('reason', 'TARGETING_MATCH');
    });
  });

  describe('method resolveNumberEvaluation', () => {
    it('should throw general error for non-existent flag', () => {
      expect(() => {
        provider.resolveNumberEvaluation('nonExistent', 1, { fizz: 'buzz' });
      }).toThrow(GeneralError);
    });

    it('should return right value if key exists', () => {
      const value = provider.resolveNumberEvaluation('flag_number', 0, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', 5);
      expect(value).toHaveProperty('reason', 'TARGETING_MATCH');
    });
  });

  describe('method resolveBooleanEvaluation', () => {
    it('should throw general error for non-existent flag', () => {
      expect(() => {
        provider.resolveBooleanEvaluation('nonExistent', false, { fizz: 'buzz' });
      }).toThrow(GeneralError);
    });

    it('should return right value if key exists', () => {
      const value = provider.resolveBooleanEvaluation('flag_boolean', false, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', true);
      expect(value).toHaveProperty('reason', 'TARGETING_MATCH');
    });
  });

  describe('method resolveObjectEvaluation', () => {
    it('should throw general error for non-existent flag', () => {
      expect(() => {
        provider.resolveObjectEvaluation('nonExistent', {}, { fizz: 'buzz' });
      }).toThrow(GeneralError);
    });

    it('should return right value if key exists', () => {
      const value = provider.resolveObjectEvaluation('flag_object', { fizz: 'buzz' }, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', { foo: 'bar' });
      expect(value).toHaveProperty('reason', 'TARGETING_MATCH');
    });
  });

  it('should throw TypeMismatchError on non-number value', () => {
    expect(() => {
      provider.resolveNumberEvaluation('flag_string', 0, { fizz: 'buzz' });
    }).toThrow(TypeMismatchError);
  });
});
