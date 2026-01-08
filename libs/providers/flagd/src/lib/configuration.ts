import { DEFAULT_MAX_CACHE_SIZE, DEFAULT_RETRY_GRACE_PERIOD } from './constants';
import type { EvaluationContext } from '@openfeature/server-sdk';

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
   * TLS certificate path to use when TLS connectivity is enabled.
   *
   * @example "/etc/cert/ca.crt"
   */
  certPath?: string;

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

  /**
   * Initial retry backoff in milliseconds.
   */
  retryBackoffMs?: number;

  /**
   * Maximum retry backoff in milliseconds.
   */
  retryBackoffMaxMs?: number;

  /**
   * gRPC client KeepAlive in milliseconds. Disabled with 0.
   * Only applies to RPC and in-process resolvers.
   *
   * @default 0
   */
  keepAliveTime?: number;

  /**
   * Grace period in seconds before provider moves from STALE to ERROR.
   * When the provider disconnects, it emits STALE. If disconnected for longer
   * than retryGracePeriod, it emits ERROR.
   *
   * @default 5
   */
  retryGracePeriod?: number;
}

interface FlagdConfig extends Config {
  /**
   * Function providing an EvaluationContext to mix into every evaluation.
   * The syncContext from the SyncFlagsResponse
   * (https://buf.build/open-feature/flagd/docs/main:flagd.sync.v1#flagd.sync.v1.SyncFlagsResponse),
   * represented as a {@link dev.openfeature.sdk.Structure}, is passed as an argument.
   *
   * This function runs every time the provider (re)connects, and its result is cached and used in every evaluation.
   * By default, the entire sync response (as a JSON Object) is used.
   */
  contextEnricher: (syncContext: EvaluationContext | null) => EvaluationContext;
}

export type FlagdProviderOptions = Partial<FlagdConfig>;

const DEFAULT_CONFIG: Omit<FlagdConfig, 'port' | 'resolverType'> = {
  deadlineMs: 500,
  host: 'localhost',
  tls: false,
  selector: '',
  cache: 'lru',
  maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
  contextEnricher: (syncContext: EvaluationContext | null) => syncContext ?? {},
  retryBackoffMs: 1000,
  retryBackoffMaxMs: 120000,
  keepAliveTime: 0,
  retryGracePeriod: DEFAULT_RETRY_GRACE_PERIOD,
};

const DEFAULT_RPC_CONFIG: FlagdConfig = { ...DEFAULT_CONFIG, resolverType: 'rpc', port: 8013 };

const DEFAULT_IN_PROCESS_CONFIG: FlagdConfig = { ...DEFAULT_CONFIG, resolverType: 'in-process', port: 8015 };

enum ENV_VAR {
  FLAGD_HOST = 'FLAGD_HOST',
  FLAGD_PORT = 'FLAGD_PORT',
  FLAGD_SYNC_PORT = 'FLAGD_SYNC_PORT',
  FLAGD_DEADLINE_MS = 'FLAGD_DEADLINE_MS',
  FLAGD_TLS = 'FLAGD_TLS',
  FLAGD_SOCKET_PATH = 'FLAGD_SOCKET_PATH',
  FLAGD_SERVER_CERT_PATH = 'FLAGD_SERVER_CERT_PATH',
  FLAGD_CACHE = 'FLAGD_CACHE',
  FLAGD_MAX_CACHE_SIZE = 'FLAGD_MAX_CACHE_SIZE',
  FLAGD_SOURCE_SELECTOR = 'FLAGD_SOURCE_SELECTOR',
  FLAGD_RESOLVER = 'FLAGD_RESOLVER',
  FLAGD_OFFLINE_FLAG_SOURCE_PATH = 'FLAGD_OFFLINE_FLAG_SOURCE_PATH',
  FLAGD_DEFAULT_AUTHORITY = 'FLAGD_DEFAULT_AUTHORITY',
  FLAGD_RETRY_BACKOFF_MS = 'FLAGD_RETRY_BACKOFF_MS',
  FLAGD_RETRY_BACKOFF_MAX_MS = 'FLAGD_RETRY_BACKOFF_MAX_MS',
  FLAGD_KEEP_ALIVE_TIME_MS = 'FLAGD_KEEP_ALIVE_TIME_MS',
  FLAGD_RETRY_GRACE_PERIOD = 'FLAGD_RETRY_GRACE_PERIOD',
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
    ...(Number(process.env[ENV_VAR.FLAGD_SYNC_PORT]) && {
      port: Number(process.env[ENV_VAR.FLAGD_SYNC_PORT]),
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
    ...(process.env[ENV_VAR.FLAGD_SERVER_CERT_PATH] && {
      certPath: process.env[ENV_VAR.FLAGD_SERVER_CERT_PATH],
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
    ...(Number(process.env[ENV_VAR.FLAGD_RETRY_BACKOFF_MS]) && {
      retryBackoffMs: Number(process.env[ENV_VAR.FLAGD_RETRY_BACKOFF_MS]),
    }),
    ...(Number(process.env[ENV_VAR.FLAGD_RETRY_BACKOFF_MAX_MS]) && {
      retryBackoffMaxMs: Number(process.env[ENV_VAR.FLAGD_RETRY_BACKOFF_MAX_MS]),
    }),
    ...(Number(process.env[ENV_VAR.FLAGD_KEEP_ALIVE_TIME_MS]) && {
      keepAliveTime: Number(process.env[ENV_VAR.FLAGD_KEEP_ALIVE_TIME_MS]),
    }),
    ...(process.env[ENV_VAR.FLAGD_RETRY_GRACE_PERIOD] && {
      retryGracePeriod: Number(process.env[ENV_VAR.FLAGD_RETRY_GRACE_PERIOD]),
    }),
  };
};

export function getConfig(options: FlagdProviderOptions = {}): FlagdConfig {
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
