export interface Options {
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
   * When set to true the provider will use client side caching
   *
   * @default false
   */
  caching: boolean;

  /**
   * Sets the timeout for items in the cache in seconds, a value of 0 disables the timeout
   *
   * @default 0
   */
  cacheTtl: number;

  /**
   * Sets maximum delay between connection retries in ms.
   *
   * @default 60000
   */
  maxDelay: number;

  /**
   * Sets the maximum number of retries for a connection to be made to the flagd instance
   * 0 means unlimited.
   *
   * @default 0
   */
  maxRetries: number;

  /**
   * Enables or disables streaming and event features.
   * If false, no events will be fired and the provider will start up in a "ready" state.
   *
   * @default true
   */
  eventStreaming: boolean;
}

export type FlagdProviderOptions = Partial<Options>;

export const DEFAULT_MAX_DELAY = 60000;

const DEFAULT_CONFIG: Options = {
  host: 'localhost',
  port: 8013,
  tls: false,
  caching: true,
  cacheTtl: 0,
  maxRetries: 0,
  maxDelay: DEFAULT_MAX_DELAY,
  eventStreaming: true,
};

export function getOptions(options: FlagdProviderOptions = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...options,
  };
}
