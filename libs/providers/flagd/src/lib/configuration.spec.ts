import type { Config, FlagdProviderOptions } from './configuration';
import { getConfig } from './configuration';
import { DEFAULT_MAX_BACKOFF_MS, DEFAULT_MAX_CACHE_SIZE, DEFAULT_RETRY_GRACE_PERIOD } from './constants';
import type { EvaluationContext } from '@openfeature/server-sdk';
import { configSteps } from '../e2e/step-definitions/configSteps';
import type { State } from '../e2e/step-definitions/state';
import { autoBindSteps, loadFeatures } from 'jest-cucumber';
import { CONFIG_FEATURE } from '../e2e';

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
      retryBackoffMaxMs: DEFAULT_MAX_BACKOFF_MS,
      retryBackoffMs: 1000,
      selector: '',
      deadlineMs: 500,
      streamDeadlineMs: 600000,
      contextEnricher: expect.any(Function),
      keepAliveTime: 0,
      retryGracePeriod: DEFAULT_RETRY_GRACE_PERIOD,
    });
  });

  it('should override defaults with environment variables', () => {
    const host = 'dev';
    const port = 8080;
    const tls = true;
    const socketPath = '/tmp/flagd.socks';
    const certPath = '/etc/cert/ca.crt';
    const maxCacheSize = 333;
    const cache = 'disabled';
    const resolverType = 'in-process';
    const selector = 'app=weather';
    const offlineFlagSourcePath = '/tmp/flags.json';
    const defaultAuthority = 'test-authority';
    const keepAliveTime = 30000;
    const streamDeadlineMs = 700000;
    const retryGracePeriod = 10;

    process.env['FLAGD_HOST'] = host;
    process.env['FLAGD_PORT'] = `${port}`;
    process.env['FLAGD_TLS'] = `${tls}`;
    process.env['FLAGD_SOCKET_PATH'] = socketPath;
    process.env['FLAGD_SERVER_CERT_PATH'] = certPath;
    process.env['FLAGD_CACHE'] = cache;
    process.env['FLAGD_MAX_CACHE_SIZE'] = `${maxCacheSize}`;
    process.env['FLAGD_SOURCE_SELECTOR'] = `${selector}`;
    process.env['FLAGD_RESOLVER'] = `${resolverType}`;
    process.env['FLAGD_OFFLINE_FLAG_SOURCE_PATH'] = offlineFlagSourcePath;
    process.env['FLAGD_DEFAULT_AUTHORITY'] = defaultAuthority;
    process.env['FLAGD_KEEP_ALIVE_TIME_MS'] = `${keepAliveTime}`;
    process.env['FLAGD_RETRY_GRACE_PERIOD'] = `${retryGracePeriod}`;
    process.env['FLAGD_STREAM_DEADLINE_MS'] = `${streamDeadlineMs}`;

    expect(getConfig()).toEqual(
      expect.objectContaining({
        host,
        port,
        tls,
        socketPath,
        certPath,
        maxCacheSize,
        cache,
        resolverType,
        selector,
        offlineFlagSourcePath,
        defaultAuthority,
        deadlineMs: 500,
        streamDeadlineMs,
        keepAliveTime,
        retryGracePeriod,
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

  it('should use flagd sync port over flagd port environment option', () => {
    const port = 8080;
    const syncPort = 9090;

    process.env['FLAGD_PORT'] = `${port}`;
    process.env['FLAGD_SYNC_PORT'] = `${syncPort}`;

    expect(getConfig()).toStrictEqual(
      expect.objectContaining({
        port: syncPort,
      }),
    );
  });

  it('should use incoming options over defaults and environment variable', () => {
    const contextEnricher = (syncContext: EvaluationContext | null): EvaluationContext => {
      return { ...syncContext, extraKey: 'extraValue' };
    };
    const options: FlagdProviderOptions = {
      host: 'test',
      port: 3000,
      tls: true,
      certPath: '/custom/cert.pem',
      maxCacheSize: 1000,
      cache: 'lru',
      resolverType: 'rpc',
      retryBackoffMaxMs: DEFAULT_MAX_BACKOFF_MS,
      retryBackoffMs: 1000,
      selector: '',
      defaultAuthority: '',
      deadlineMs: 500,
      streamDeadlineMs: 600000,
      contextEnricher: contextEnricher,
      keepAliveTime: 30000,
      retryGracePeriod: 15,
    };

    process.env['FLAGD_HOST'] = 'override';
    process.env['FLAGD_PORT'] = '8080';
    process.env['FLAGD_SYNC_PORT'] = '9090';
    process.env['FLAGD_TLS'] = 'false';
    process.env['FLAGD_SERVER_CERT_PATH'] = '/env/cert.pem';
    process.env['FLAGD_DEFAULT_AUTHORITY'] = 'test-authority-override';
    process.env['FLAGD_KEEP_ALIVE_TIME_MS'] = '30000';
    process.env['FLAGD_RETRY_GRACE_PERIOD'] = '20';

    expect(getConfig(options)).toStrictEqual(options);
  });

  it('should ignore an valid port set as an environment variable', () => {
    process.env['FLAGD_PORT'] = 'invalid number';
    expect(getConfig()).toStrictEqual(expect.objectContaining({ port: 8013 }));
  });

  it('should ignore an invalid sync port set as an environment variable', () => {
    process.env['FLAGD_SYNC_PORT'] = 'invalid number';
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

  describe('config.feature', () => {
    const state: State = {
      resolverType: 'in-process',
      options: {},
      config: undefined,
      events: [],
    };

    autoBindSteps(
      loadFeatures(CONFIG_FEATURE, {
        scenarioNameTemplate: (vars) => {
          const tags = [...new Set([...vars.scenarioTags, ...vars.featureTags])];
          return `${vars.scenarioTitle}${tags.length > 0 ? ` (${tags.join(', ')})` : ''}`;
        },
      }),
      [configSteps(state)],
    );
  });
});
