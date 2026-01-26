import { credentials, status } from '@grpc/grpc-js';
import type { ClientReadableStream, ChannelCredentials, ClientOptions, ServiceError } from '@grpc/grpc-js';
import { readFileSync, existsSync } from 'node:fs';
import type { Config } from '../../configuration';
import type { Logger } from '@openfeature/server-sdk';
import { ProviderFatalError } from '@openfeature/server-sdk';

/**
 * Get the string name of a gRPC status code.
 */
const statusName = (code: status): string => status[code];

export const closeStreamIfDefined = (stream: ClientReadableStream<unknown> | undefined) => {
  /**
   * cancel() is necessary to prevent calls from hanging the process, so we need to we need to remove all the
   * handlers, and add a no-op for 'error' so we can cancel without bubbling up an exception
   */
  if (stream) {
    stream.removeAllListeners();
    stream.on('error', () => {
      // swallow errors after closed
    });
    stream.cancel();
    stream.destroy();
  }
};

/**
 * Creates gRPC channel credentials based on TLS and certificate path configuration.
 * @returns Channel credentials for gRPC connection
 */
export const createChannelCredentials = (tls: boolean, certPath?: string): ChannelCredentials => {
  if (!tls) {
    return credentials.createInsecure();
  }
  if (certPath && existsSync(certPath)) {
    const rootCerts = readFileSync(certPath);
    return credentials.createSsl(rootCerts);
  }
  return credentials.createSsl();
};

/**
 * Mapping of configuration options to gRPC client options.
 */
const CONFIG_TO_GRPC_OPTIONS: {
  configKey: keyof Config;
  grpcKey: string;
  condition?: (value: unknown) => boolean;
}[] = [
  { configKey: 'defaultAuthority', grpcKey: 'grpc.default_authority' },
  { configKey: 'keepAliveTime', grpcKey: 'grpc.keepalive_time_ms', condition: (time) => Number(time) > 0 },
];

/**
 * Builds gRPC client options from config.
 */
export function buildClientOptions(config: Config): ClientOptions {
  const options: Partial<ClientOptions> = {
    'grpc.service_config': buildRetryPolicy(
      'flagd.service.v1.FlagService',
      config.retryBackoffMs,
      config.retryBackoffMaxMs,
    ),
  };

  for (const { configKey, grpcKey, condition } of CONFIG_TO_GRPC_OPTIONS) {
    const value = config[configKey];
    if (value !== undefined && (!condition || condition(value))) {
      options[grpcKey] = value;
    }
  }

  return options;
}

/**
 * Builds RetryPolicy for gRPC client options.
 * @param serviceName
 * @param retryBackoffMs Initial backoff duration in milliseconds
 * @param retryBackoffMaxMs Maximum backoff duration in milliseconds
 * @returns gRPC client options with retry policy
 */
export const buildRetryPolicy = (serviceName: string, retryBackoffMs?: number, retryBackoffMaxMs?: number): string => {
  const initialBackoff = retryBackoffMs ?? 1000;
  const maxBackoff = retryBackoffMaxMs ?? 120000;

  return JSON.stringify({
    loadBalancingConfig: [],
    methodConfig: [
      {
        name: [{ service: serviceName }],
        retryPolicy: {
          maxAttempts: 3,
          initialBackoff: `${Math.round(initialBackoff / 1000).toFixed(2)}s`,
          maxBackoff: `${Math.round(maxBackoff / 1000).toFixed(2)}s`,
          backoffMultiplier: 2,
          retryableStatusCodes: [statusName(status.UNAVAILABLE), statusName(status.UNKNOWN)],
        },
      },
    ],
  });
};

/**
 * Converts an array of gRPC status code strings to a Set of numeric codes.
 * @param fatalStatusCodes Array of status code strings.
 * @param logger Optional logger for warning about unknown codes
 * @returns Set of numeric status codes
 */
export const createFatalStatusCodesSet = (fatalStatusCodes?: string[], logger?: Logger): Set<number> => {
  if (!fatalStatusCodes?.length) {
    return new Set<number>();
  }

  return fatalStatusCodes.reduce((codes, codeStr) => {
    const numericCode = status[codeStr as keyof typeof status];
    if (typeof numericCode === 'number') {
      codes.add(numericCode);
    } else {
      logger?.warn(`Unknown gRPC status code: "${codeStr}"`);
    }
    return codes;
  }, new Set<number>());
};

/**
 * Checks if an error is a fatal gRPC status code that should not be retried.
 * This should only be checked on the first connection attempt.
 *
 * @param err The error to check
 * @param initialized Whether the connection has been successfully initialized
 * @param fatalStatusCodes Set of numeric status codes considered fatal
 * @returns True if the error is fatal and should not be retried
 */
export const isFatalStatusCodeError = (err: Error, initialized: boolean, fatalStatusCodes: Set<number>): boolean => {
  if (initialized) {
    return false;
  }

  const serviceError = err as ServiceError;
  return serviceError?.code !== undefined && fatalStatusCodes.has(serviceError.code);
};

/**
 * Handles a fatal gRPC status code error by logging it.
 * Should only be called when isFatalStatusCodeError returns true.
 *
 * @param err The error to handle
 * @param logger Optional logger for error logging
 * @param disconnectCallback Callback to invoke with the error message
 * @param rejectConnect Optional callback to reject the connection promise
 */
export const handleFatalStatusCodeError = (
  err: Error,
  logger: Logger | undefined,
  disconnectCallback: (message: string) => void,
  rejectConnect?: (reason: Error) => void,
): void => {
  const serviceError = err as ServiceError;
  logger?.error(
    `Encountered fatal status code ${serviceError.code} (${serviceError.message}) on first connection, will not retry`,
  );
  const errorMessage = `PROVIDER_FATAL: ${serviceError.message}`;
  disconnectCallback(errorMessage);
  rejectConnect?.(new ProviderFatalError(serviceError.message));
};
