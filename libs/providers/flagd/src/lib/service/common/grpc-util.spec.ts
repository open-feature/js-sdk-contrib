import {
  buildClientOptions,
  buildRetryPolicy,
  createFatalStatusCodesSet,
  handleFatalStatusCodeError,
  isFatalStatusCodeError,
} from './grpc-util';
import type { ServiceError } from '@grpc/grpc-js';
import { status } from '@grpc/grpc-js';

import type { Config } from '../../configuration';
import type { Logger } from '@openfeature/server-sdk';

const createMockLogger = (): Logger => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
});

describe('buildClientOptions', () => {
  const baseConfig: Config = {
    host: 'localhost',
    port: 8013,
    tls: false,
    deadlineMs: 500,
    socketPath: '',
    retryBackoffMs: 100,
    retryBackoffMaxMs: 200,
  };

  it('should only return retry policy when no relevant options are set', () => {
    expect(Object.keys(buildClientOptions(baseConfig)).length).toBe(1);
    expect(Object.keys(buildClientOptions(baseConfig))).toEqual(['grpc.service_config']);
  });

  it.each([
    {
      configKey: 'defaultAuthority',
      value: 'test-authority',
      grpcKey: 'grpc.default_authority',
      expected: 'test-authority',
    },
    { configKey: 'keepAliveTime', value: 10000, grpcKey: 'grpc.keepalive_time_ms', expected: 10000 },
  ])('should include $configKey when set to valid value', ({ configKey, value, grpcKey, expected }) => {
    const config = { ...baseConfig, [configKey]: value };
    expect(buildClientOptions(config)).toMatchObject({ [grpcKey]: expected });
  });

  it.each([
    { configKey: 'keepAliveTime', value: 0, description: 'zero' },
    { configKey: 'keepAliveTime', value: -1, description: 'negative' },
  ])('should exclude $configKey when $description', ({ configKey, value }) => {
    const config = { ...baseConfig, [configKey]: value };
    expect(Object.keys(buildClientOptions(config))).not.toContain('grpc.keepalive_time_ms');
  });

  it('should combine multiple options', () => {
    const config: Config = { ...baseConfig, defaultAuthority: 'my-authority', keepAliveTime: 5000 };
    expect(buildClientOptions(config)).toEqual({
      'grpc.default_authority': 'my-authority',
      'grpc.keepalive_time_ms': 5000,
      'grpc.service_config': buildRetryPolicy('flagd.service.v1.FlagService', 100, 200),
    });
  });
});

describe('createFatalStatusCodesSet', () => {
  it('should return empty set when no codes provided', () => {
    const result = createFatalStatusCodesSet();
    expect(result.size).toBe(0);
  });

  it('should convert valid status code strings to numbers', () => {
    const result = createFatalStatusCodesSet(['UNAVAILABLE', 'UNAUTHENTICATED']);
    expect(result.has(status.UNAVAILABLE)).toBe(true);
    expect(result.has(status.UNAUTHENTICATED)).toBe(true);
  });

  it('should warn about invalid status codes', () => {
    const logger = createMockLogger();
    createFatalStatusCodesSet(['INVALID_CODE'], logger);
    expect(logger.warn).toHaveBeenCalledWith('Unknown gRPC status code: "INVALID_CODE"');
  });
});

describe('isFatalStatusCodeError', () => {
  it('should return true when error code is in fatal codes and not initialized', () => {
    const error = { code: status.UNAUTHENTICATED } as ServiceError;
    const fatalCodes = new Set([status.UNAUTHENTICATED]);

    const result = isFatalStatusCodeError(error, false, fatalCodes);
    expect(result).toBe(true);
  });

  it('should return false when error code is not in fatal codes', () => {
    const error = { code: status.UNAVAILABLE } as ServiceError;
    const fatalCodes = new Set([status.UNAUTHENTICATED]);

    const result = isFatalStatusCodeError(error, false, fatalCodes);
    expect(result).toBe(false);
  });

  it('should return false when error has no code', () => {
    const error = new Error('test error');
    const fatalCodes = new Set([status.UNAUTHENTICATED]);

    const result = isFatalStatusCodeError(error, false, fatalCodes);
    expect(result).toBe(false);
  });
});

describe('handleFatalStatusCodeError', () => {
  it('should log error and call callbacks', () => {
    const error = { code: status.UNAUTHENTICATED, message: 'auth failed' } as ServiceError;
    const logger = createMockLogger();
    const disconnectCallback = jest.fn();
    const rejectConnect = jest.fn();

    handleFatalStatusCodeError(error, logger, disconnectCallback, rejectConnect);

    expect(logger.error).toHaveBeenCalledWith(
      'Encountered fatal status code 16 (auth failed) on first connection, will not retry',
    );
    expect(disconnectCallback).toHaveBeenCalledWith('PROVIDER_FATAL: auth failed');
    expect(rejectConnect).toHaveBeenCalled();
  });
});
