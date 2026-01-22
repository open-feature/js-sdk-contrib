import type { OFREPProviderBaseOptions } from '@openfeature/ofrep-core';
import { getConfig } from './configuration';

describe('Configuration', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  describe('getConfig', () => {
    it('should return empty config when no options or env vars are provided', () => {
      const config = getConfig();
      expect(config).toEqual({
        baseUrl: '',
        headers: undefined,
      });
    });

    it('should use environment variables as defaults', () => {
      process.env['OFREP_ENDPOINT'] = 'https://api.example.com';
      process.env['OFREP_TIMEOUT_MS'] = '5000';
      process.env['OFREP_HEADERS'] = 'X-Custom-Header=value1,X-Another=value2';

      const config = getConfig();

      expect(config.baseUrl).toBe('https://api.example.com');
      expect(config.timeoutMs).toBe(5000);
      expect(config.headers).toStrictEqual([
        ['x-custom-header', 'value1'],
        ['x-another', 'value2'],
      ]);
    });

    it('should override environment variables with provided options', () => {
      process.env['OFREP_ENDPOINT'] = 'https://api.example.com';
      process.env['OFREP_TIMEOUT_MS'] = '5000';

      const options: OFREPProviderBaseOptions = {
        baseUrl: 'https://override.example.com',
        timeoutMs: 10000,
      };

      const config = getConfig(options);

      expect(config.baseUrl).toBe('https://override.example.com');
      expect(config.timeoutMs).toBe(10000);
    });

    it('should handle invalid timeoutMs value in environment variable', () => {
      process.env['OFREP_TIMEOUT_MS'] = 'invalid';

      const config = getConfig();

      expect(config.timeoutMs).toBeUndefined();
    });
  });
});
