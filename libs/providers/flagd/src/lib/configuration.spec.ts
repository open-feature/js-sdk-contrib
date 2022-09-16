import { FlagdProviderOptions, getConfig } from './configuration';

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
    });
  });

  it('should override defaults with environment variables', () => {
    const host = 'dev';
    const port = 8080;
    const tls = true;
    const socketPath = '/tmp/flagd.socks';

    process.env['FLAGD_HOST'] = host;
    process.env['FLAGD_PORT'] = `${port}`;
    process.env['FLAGD_TLS'] = `${tls}`;
    process.env['FLAGD_SOCKET_PATH'] = socketPath;

    expect(getConfig()).toStrictEqual({
      host,
      port,
      tls,
      socketPath,
    });
  });

  it('should use incoming options over defaults and environment variable', () => {
    const options: FlagdProviderOptions = {
      host: 'test',
      port: 3000,
      tls: true,
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
