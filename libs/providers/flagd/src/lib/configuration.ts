import { DEFAULT_MAX_CACHE_SIZE, DEFAULT_MAX_EVENT_STREAM_RETRIES } from './constants';

export type CacheOption = 'lru' | 'disabled';
export type ResolverType = 'rpc' | 'in-process';

export interface Config {
  /**
   * The domain name or IP address of flagd.
   *
   * @default localhost
   */
  host: string;

  /**
   * The port flagd is listen on.
   *
   * @default 8013
   */
  port: number;

  /**
   * Determines if TLS should be used.
   *
   * @default false
   */
  tls: boolean;

  /**
   * When set, a unix socket connection is used.
   *
   * @example "/tmp/flagd.socks"
   */
  socketPath?: string;

  /**
   * Resolver type to use by the provider.
   *
   * Options include rpc & in-process.
   *
   * rpc - flag resolving happens remotely over gRPC
   * in-process - flag resolving happens in-process, fetching flag definitions using the {@link https://github.com/open-feature/flagd-schemas/blob/main/protobuf/sync/v1/sync_service.proto|sync.proto}
   *
   * @default 'rpc'
   */
  resolverType?: ResolverType;

  /**
   * Selector to be used with flag sync gRPC contract.
   */
  selector?: string;

  /**
   * Cache implementation to use (or disabled).
   *
   * @default 'lru'
   */
  cache?: CacheOption;

  /**
   * Max cache size (items).
   *
   * @default 1000
   */
  maxCacheSize?: number;
}

export type FlagdProviderOptions = Partial<Config>;

const DEFAULT_CONFIG: Config = {
  host: 'localhost',
  port: 8013,
  tls: false,
  resolverType: 'rpc',
  selector: '',
  cache: 'lru',
  maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
};

enum ENV_VAR {
  FLAGD_HOST = 'FLAGD_HOST',
  FLAGD_PORT = 'FLAGD_PORT',
  FLAGD_TLS = 'FLAGD_TLS',
  FLAGD_SOCKET_PATH = 'FLAGD_SOCKET_PATH',
  FLAGD_CACHE = 'FLAGD_CACHE',
  FLAGD_MAX_CACHE_SIZE = 'FLAGD_MAX_CACHE_SIZE',
  FLAGD_SOURCE_SELECTOR = 'FLAGD_SOURCE_SELECTOR',
  FLAGD_RESOLVER = 'FLAGD_RESOLVER',
}

const getEnvVarConfig = (): Partial<Config> => ({
  ...(process.env[ENV_VAR.FLAGD_HOST] && {
    host: process.env[ENV_VAR.FLAGD_HOST],
  }),
  ...(Number(process.env[ENV_VAR.FLAGD_PORT]) && {
    port: Number(process.env[ENV_VAR.FLAGD_PORT]),
  }),
  ...(process.env[ENV_VAR.FLAGD_TLS] && {
    tls: process.env[ENV_VAR.FLAGD_TLS]?.toLowerCase() === 'true',
  }),
  ...(process.env[ENV_VAR.FLAGD_SOCKET_PATH] && {
    socketPath: process.env[ENV_VAR.FLAGD_SOCKET_PATH],
  }),
  ...((process.env[ENV_VAR.FLAGD_CACHE] === 'lru' || process.env[ENV_VAR.FLAGD_CACHE] === 'disabled') && {
    cache: process.env[ENV_VAR.FLAGD_CACHE],
  }),
  ...(process.env[ENV_VAR.FLAGD_MAX_CACHE_SIZE] && {
    maxCacheSize: Number(process.env[ENV_VAR.FLAGD_MAX_CACHE_SIZE]),
  }),
  ...(process.env[ENV_VAR.FLAGD_SOURCE_SELECTOR] && {
    selector: process.env[ENV_VAR.FLAGD_SOURCE_SELECTOR],
  }),
  ...((process.env[ENV_VAR.FLAGD_RESOLVER] === 'rpc' || process.env[ENV_VAR.FLAGD_RESOLVER] === 'in-process') && {
    resolverType: process.env[ENV_VAR.FLAGD_RESOLVER],
  }),
});

export function getConfig(options: FlagdProviderOptions = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...getEnvVarConfig(),
    ...options,
  };
}
