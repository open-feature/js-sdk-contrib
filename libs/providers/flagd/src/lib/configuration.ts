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
}

export type FlagdProviderOptions = Partial<Config>;

const DEFAULT_CONFIG: Config = {
  host: 'localhost',
  port: 8013,
  tls: false,
};

enum ENV_VAR {
  FLAGD_HOST = 'FLAGD_HOST',
  FLAGD_PORT = 'FLAGD_PORT',
  FLAGD_TLS = 'FLAGD_TLS',
  FLAGD_SOCKET_PATH = 'FLAGD_SOCKET_PATH',
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
});

export function getConfig(options: FlagdProviderOptions = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...getEnvVarConfig(),
    ...options,
  };
}
