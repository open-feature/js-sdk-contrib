import { DEFAULT_MAX_EVENT_STREAM_RETRIES } from "./constants";

export type CacheOption = 'lru' | 'disabled';

export const DEFAULT_MAX_CACHE_SIZE = 1000;

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

  /**
   * Amount of times to attempt to reconnect to the event stream.
   *
   * @default 5
   */
  maxEventStreamRetries?: number;
}

export type FlagdProviderOptions = Partial<Config>;

const DEFAULT_CONFIG: Config = {
  host: 'localhost',
  port: 8013,
  tls: false,
  cache: 'lru',
  maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
  maxEventStreamRetries: DEFAULT_MAX_EVENT_STREAM_RETRIES,
};

enum ENV_VAR {
  FLAGD_HOST = 'FLAGD_HOST',
  FLAGD_PORT = 'FLAGD_PORT',
  FLAGD_TLS = 'FLAGD_TLS',
  FLAGD_SOCKET_PATH = 'FLAGD_SOCKET_PATH',
  FLAGD_CACHE = 'FLAGD_CACHE',
  FLAGD_MAX_CACHE_SIZE = 'FLAGD_MAX_CACHE_SIZE',
  FLAGD_MAX_EVENT_STREAM_RETRIES = 'FLAGD_MAX_EVENT_STREAM_RETRIES',
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
  ...(process.env[ENV_VAR.FLAGD_CACHE] && {
    cache: process.env[ENV_VAR.FLAGD_CACHE] as CacheOption,
  }),
  ...(process.env[ENV_VAR.FLAGD_MAX_CACHE_SIZE] && {
    maxCacheSize:  Number(process.env[ENV_VAR.FLAGD_MAX_CACHE_SIZE]),
  }),
  ...(process.env[ENV_VAR.FLAGD_MAX_EVENT_STREAM_RETRIES] && {
    maxEventStreamRetries: Number(process.env[ENV_VAR.FLAGD_MAX_EVENT_STREAM_RETRIES]),
  }),
});

export function getConfig(options: FlagdProviderOptions = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...getEnvVarConfig(),
    ...options,
  };
}
