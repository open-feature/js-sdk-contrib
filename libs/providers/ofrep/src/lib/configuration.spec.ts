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

    it('should parse fully URL-encoded headers', () => {
      // Encoded: "Authorization=Bearer token123,X-Custom=value with spaces"
      process.env['OFREP_HEADERS'] = 'Authorization%3DBearer%20token123%2CX-Custom%3Dvalue%20with%20spaces';

      const config = getConfig();

      expect(config.headers).toStrictEqual([
        ['authorization', 'Bearer token123'],
        ['x-custom', 'value with spaces'],
      ]);
    });

    it('should parse partially URL-encoded headers (commas not encoded)', () => {
      // Only values are encoded, commas are not
      process.env['OFREP_HEADERS'] = 'Authorization=Bearer%20token123,X-Custom=value%20with%20spaces';

      const config = getConfig();

      expect(config.headers).toStrictEqual([
        ['authorization', 'Bearer token123'],
        ['x-custom', 'value with spaces'],
      ]);
    });

    it('should handle header values containing equals signs', () => {
      process.env['OFREP_HEADERS'] = 'X-Signature=key=value=another,Authorization=Bearer token';

      const config = getConfig();

      expect(config.headers).toStrictEqual([
        ['x-signature', 'key=value=another'],
        ['authorization', 'Bearer token'],
      ]);
    });

    it('should handle URL-encoded header values with equals signs', () => {
      // Encoded: "X-Data=param1=value1&param2=value2"
      process.env['OFREP_HEADERS'] = 'X-Data=param1%3Dvalue1%26param2%3Dvalue2';

      const config = getConfig();

      expect(config.headers).toStrictEqual([['x-data', 'param1=value1&param2=value2']]);
    });

    it('should skip malformed headers without equals sign and log warning', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      process.env['OFREP_HEADERS'] = 'ValidHeader=value,InvalidHeader,AnotherValid=value2';

      const config = getConfig();

      expect(config.headers).toStrictEqual([
        ['validheader', 'value'],
        ['anothervalid', 'value2'],
      ]);
      expect(consoleSpy).toHaveBeenCalledWith('Skipping malformed header entry (missing equals sign): "InvalidHeader"');
      consoleSpy.mockRestore();
    });

    it('should skip headers with empty keys and log warning', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      process.env['OFREP_HEADERS'] = 'ValidHeader=value,=valueWithoutKey,AnotherValid=value2';

      const config = getConfig();

      expect(config.headers).toStrictEqual([
        ['validheader', 'value'],
        ['anothervalid', 'value2'],
      ]);
      expect(consoleSpy).toHaveBeenCalledWith('Skipping malformed header entry (missing key): "=valueWithoutKey"');
      consoleSpy.mockRestore();
    });

    it('should skip headers with whitespace-only keys and log warning', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      process.env['OFREP_HEADERS'] = 'ValidHeader=value,  =valueWithSpaceKey,AnotherValid=value2';

      const config = getConfig();

      expect(config.headers).toStrictEqual([
        ['validheader', 'value'],
        ['anothervalid', 'value2'],
      ]);
      expect(consoleSpy).toHaveBeenCalledWith('Skipping malformed header entry (missing key): "  =valueWithSpaceKey"');
      consoleSpy.mockRestore();
    });

    it('should allow headers with empty values', () => {
      process.env['OFREP_HEADERS'] = 'X-Empty=,X-Valid=value';

      const config = getConfig();

      expect(config.headers).toStrictEqual([
        ['x-empty', ''],
        ['x-valid', 'value'],
      ]);
    });

    it('should trim whitespace from keys and values', () => {
      process.env['OFREP_HEADERS'] = '  X-Header1  =  value1  ,  X-Header2  =  value2  ';

      const config = getConfig();

      expect(config.headers).toStrictEqual([
        ['x-header1', 'value1'],
        ['x-header2', 'value2'],
      ]);
    });
  });
});
