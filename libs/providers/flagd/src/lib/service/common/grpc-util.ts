import { credentials } from '@grpc/grpc-js';
import type { ClientReadableStream, ChannelCredentials, ClientOptions } from '@grpc/grpc-js';
import { readFileSync, existsSync } from 'node:fs';
import type { Config } from '../../configuration';

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
export function buildClientOptions(config: Config): ClientOptions | undefined {
  const options: Partial<ClientOptions> = {};

  for (const { configKey, grpcKey, condition } of CONFIG_TO_GRPC_OPTIONS) {
    const value = config[configKey];
    if (value !== undefined && (!condition || condition(value))) {
      options[grpcKey] = value;
    }
  }

  return Object.keys(options).length > 0 ? options : undefined;
}
