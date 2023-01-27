import { FlagdProviderOptions, getConfig } from './configuration';
import { DEFAULT_MAX_CACHE_SIZE, DEFAULT_MAX_EVENT_STREAM_RETRIES } from './constants';

describe('Configuration', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules(); // Most important - it clears the cache
    process.env = { ...OLD_ENV }; // Make a copy
  });

  it('should return the default values', () => {
    expect(getConfig()).toStrictEqual({
      host: 'localhost',
      port: 8013,
      tls: false,
      maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
      maxEventStreamRetries: DEFAULT_MAX_EVENT_STREAM_RETRIES,
      cache: 'lru',
    });
  });

  it('should override defaults with environment variables', () => {
    const host = 'dev';
    const port = 8080;
    const tls = true;
    const socketPath = '/tmp/flagd.socks';
    const maxCacheSize = 333;
    const maxEventStreamRetries = 10;
    const cache = 'disabled';

    process.env['FLAGD_HOST'] = host;
    process.env['FLAGD_PORT'] = `${port}`;
    process.env['FLAGD_TLS'] = `${tls}`;
    process.env['FLAGD_SOCKET_PATH'] = socketPath;
    process.env['FLAGD_CACHE'] = cache;
    process.env['FLAGD_MAX_CACHE_SIZE'] = `${maxCacheSize}`;
    process.env['FLAGD_MAX_EVENT_STREAM_RETRIES'] = `${maxEventStreamRetries}`;

    expect(getConfig()).toStrictEqual({
      host,
      port,
      tls,
      socketPath,
      maxCacheSize,
      maxEventStreamRetries,
      cache,
    });
  });

  it('should use incoming options over defaults and environment variable', () => {
    const options: FlagdProviderOptions = {
      host: 'test',
      port: 3000,
      tls: true,
      maxCacheSize: 1000,
      maxEventStreamRetries: 5,
      cache: 'lru',
    };

    process.env['FLAGD_HOST'] = 'override';
    process.env['FLAGD_PORT'] = '8080';
    process.env['FLAGD_TLS'] = 'false';

    expect(getConfig(options)).toStrictEqual(options);
  });

  it('should ignore an valid port set as an environment variable', () => {
    process.env['FLAGD_PORT'] = 'invalid number';
    expect(getConfig()).toStrictEqual(expect.objectContaining({ port: 8013 }));
  });
});
