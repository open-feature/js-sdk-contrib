import type { Config, FlagdProviderOptions } from './configuration';
import { getConfig } from './configuration';
import { DEFAULT_MAX_CACHE_SIZE } from './constants';
import type { EvaluationContext } from '@openfeature/server-sdk';

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
      cache: 'lru',
      resolverType: 'rpc',
      selector: '',
      deadlineMs: 500,
      contextEnricher: expect.any(Function),
    });
  });

  it('should override defaults with environment variables', () => {
    const host = 'dev';
    const port = 8080;
    const tls = true;
    const socketPath = '/tmp/flagd.socks';
    const maxCacheSize = 333;
    const cache = 'disabled';
    const resolverType = 'in-process';
    const selector = 'app=weather';
    const offlineFlagSourcePath = '/tmp/flags.json';
    const defaultAuthority = 'test-authority';

    process.env['FLAGD_HOST'] = host;
    process.env['FLAGD_PORT'] = `${port}`;
    process.env['FLAGD_TLS'] = `${tls}`;
    process.env['FLAGD_SOCKET_PATH'] = socketPath;
    process.env['FLAGD_CACHE'] = cache;
    process.env['FLAGD_MAX_CACHE_SIZE'] = `${maxCacheSize}`;
    process.env['FLAGD_SOURCE_SELECTOR'] = `${selector}`;
    process.env['FLAGD_RESOLVER'] = `${resolverType}`;
    process.env['FLAGD_OFFLINE_FLAG_SOURCE_PATH'] = offlineFlagSourcePath;
    process.env['FLAGD_DEFAULT_AUTHORITY'] = defaultAuthority;

    expect(getConfig()).toEqual(
      expect.objectContaining({
        host,
        port,
        tls,
        socketPath,
        maxCacheSize,
        cache,
        resolverType,
        selector,
        offlineFlagSourcePath,
        defaultAuthority,
        deadlineMs: 500,
      }),
    );
  });

  it('should override context enricher', () => {
    const contextEnricher = (syncContext: EvaluationContext | null): EvaluationContext => {
      return { ...syncContext, extraKey: 'extraValue' };
    };

    expect(getConfig({ contextEnricher }).contextEnricher({})).toEqual({ extraKey: 'extraValue' });
  });

  it('should return identity function', () => {
    expect(getConfig().contextEnricher({})).toStrictEqual({});
  });

  it('should use incoming options over defaults and environment variable', () => {
    const contextEnricher = (syncContext: EvaluationContext | null): EvaluationContext => {
      return { ...syncContext, extraKey: 'extraValue' };
    };
    const options: FlagdProviderOptions = {
      host: 'test',
      port: 3000,
      tls: true,
      maxCacheSize: 1000,
      cache: 'lru',
      resolverType: 'rpc',
      selector: '',
      defaultAuthority: '',
      deadlineMs: 500,
      contextEnricher: contextEnricher,
    };

    process.env['FLAGD_HOST'] = 'override';
    process.env['FLAGD_PORT'] = '8080';
    process.env['FLAGD_TLS'] = 'false';
    process.env['FLAGD_DEFAULT_AUTHORITY'] = 'test-authority-override';

    expect(getConfig(options)).toStrictEqual(options);
  });

  it('should ignore an valid port set as an environment variable', () => {
    process.env['FLAGD_PORT'] = 'invalid number';
    expect(getConfig()).toStrictEqual(expect.objectContaining({ port: 8013 }));
  });

  describe('port handling', () => {
    describe('for "in-process" evaluation', () => {
      const resolverType = 'in-process';
      const port = 8015;
      it('should use default in-process port if resolver type is set per envVar and no port is provided', () => {
        process.env['FLAGD_RESOLVER'] = resolverType;
        expect(getConfig()).toStrictEqual(expect.objectContaining({ port, resolverType }));
      });
      it('should use default in-process port if resolver type is set per options and no port is provided', () => {
        const options: Partial<Config> = { resolverType };
        expect(getConfig(options)).toStrictEqual(expect.objectContaining({ port, resolverType }));
      });
      it('should use provided port if resolver type is set per options and port', () => {
        const port = 1111;
        const options: Partial<Config> = { resolverType, port };
        expect(getConfig(options)).toStrictEqual(expect.objectContaining({ port, resolverType }));
      });
    });
    describe('for "rpc" evaluation', () => {
      const resolverType = 'rpc';
      const port = 8013;
      it('should use default in-process port if resolver type is set per envVar and no port is provided', () => {
        process.env['FLAGD_RESOLVER'] = resolverType;
        expect(getConfig()).toStrictEqual(expect.objectContaining({ port, resolverType }));
      });
      it('should use default in-process port if resolver type is set per options and no port is provided', () => {
        const options: Partial<Config> = { resolverType };
        expect(getConfig(options)).toStrictEqual(expect.objectContaining({ port, resolverType }));
      });
      it('should use provided port if resolver type is set per options and port', () => {
        const port = 1111;
        const options: Partial<Config> = { resolverType, port };
        expect(getConfig(options)).toStrictEqual(expect.objectContaining({ port, resolverType }));
      });
    });
  });
});
