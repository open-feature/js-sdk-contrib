import { DEFAULT_MAX_CACHE_SIZE } from './constants';

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
   * The deadline for connections.
   *
   * @default 500
   */
  deadlineMs: number;

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
   * File source of flags to be used by offline mode.
   * Setting this enables the offline mode of the in-process provider.
   */
  offlineFlagSourcePath?: string;

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

  /**
   * The target host (authority) when routing requests through a proxy (e.g. Envoy)
   *
   */
  defaultAuthority?: string;
}

export type FlagdProviderOptions = Partial<Config>;

const DEFAULT_CONFIG: Omit<Config, 'port' | 'resolverType'> = {
  deadlineMs: 500,
  host: 'localhost',
  tls: false,
  selector: '',
  cache: 'lru',
  maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
};

const DEFAULT_RPC_CONFIG: Config = { ...DEFAULT_CONFIG, resolverType: 'rpc', port: 8013 };

const DEFAULT_IN_PROCESS_CONFIG: Config = { ...DEFAULT_CONFIG, resolverType: 'in-process', port: 8015 };

enum ENV_VAR {
  FLAGD_HOST = 'FLAGD_HOST',
  FLAGD_PORT = 'FLAGD_PORT',
  FLAGD_DEADLINE_MS = 'FLAGD_DEADLINE_MS',
  FLAGD_TLS = 'FLAGD_TLS',
  FLAGD_SOCKET_PATH = 'FLAGD_SOCKET_PATH',
  FLAGD_CACHE = 'FLAGD_CACHE',
  FLAGD_MAX_CACHE_SIZE = 'FLAGD_MAX_CACHE_SIZE',
  FLAGD_SOURCE_SELECTOR = 'FLAGD_SOURCE_SELECTOR',
  FLAGD_RESOLVER = 'FLAGD_RESOLVER',
  FLAGD_OFFLINE_FLAG_SOURCE_PATH = 'FLAGD_OFFLINE_FLAG_SOURCE_PATH',
  FLAGD_DEFAULT_AUTHORITY = 'FLAGD_DEFAULT_AUTHORITY',
}

function checkEnvVarResolverType() {
  return (
    process.env[ENV_VAR.FLAGD_RESOLVER] &&
    (process.env[ENV_VAR.FLAGD_RESOLVER].toLowerCase() === 'rpc' ||
      process.env[ENV_VAR.FLAGD_RESOLVER].toLowerCase() === 'in-process')
  );
}

const getEnvVarConfig = (): Partial<Config> => {
  let provider = undefined;
  if (
    process.env[ENV_VAR.FLAGD_RESOLVER] &&
    (process.env[ENV_VAR.FLAGD_RESOLVER].toLowerCase() === 'rpc' ||
      process.env[ENV_VAR.FLAGD_RESOLVER].toLowerCase() === 'in-process')
  ) {
    provider = process.env[ENV_VAR.FLAGD_RESOLVER].toLowerCase();
  }

  return {
    ...(process.env[ENV_VAR.FLAGD_HOST] && {
      host: process.env[ENV_VAR.FLAGD_HOST],
    }),
    ...(Number(process.env[ENV_VAR.FLAGD_PORT]) && {
      port: Number(process.env[ENV_VAR.FLAGD_PORT]),
    }),
    ...(Number(process.env[ENV_VAR.FLAGD_DEADLINE_MS]) && {
      deadlineMs: Number(process.env[ENV_VAR.FLAGD_DEADLINE_MS]),
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
    ...(provider && {
      resolverType: provider as ResolverType,
    }),
    ...(process.env[ENV_VAR.FLAGD_OFFLINE_FLAG_SOURCE_PATH] && {
      offlineFlagSourcePath: process.env[ENV_VAR.FLAGD_OFFLINE_FLAG_SOURCE_PATH],
    }),
  ...(process.env[ENV_VAR.FLAGD_DEFAULT_AUTHORITY] && {
    defaultAuthority: process.env[ENV_VAR.FLAGD_DEFAULT_AUTHORITY],
  }),
};
};

export function getConfig(options: FlagdProviderOptions = {}) {
  const envVarConfig = getEnvVarConfig();
  const defaultConfig =
    options.resolverType == 'in-process' || envVarConfig.resolverType == 'in-process'
      ? DEFAULT_IN_PROCESS_CONFIG
      : DEFAULT_RPC_CONFIG;
  return {
    ...defaultConfig,
    ...envVarConfig,
    ...options,
  };
}
