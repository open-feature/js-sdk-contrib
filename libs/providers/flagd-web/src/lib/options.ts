export interface Options {
  /**
   * The domain name or IP address of flagd.
   *
   * @default window
   */
  host: string;

  /**
   * The port flagd is listening on.
   *
   * @default 443
   */
  port: number;

  /**
   * Determines if TLS should be used.
   *
   * @default false
   */
  tls: boolean;

  /**
   * Sets maximum delay between connection retries in ms.
   *
   * @default 60000
   */
  maxDelay: number;

  /**
   * Sets the maximum number of retries for a connection to be made to the flagd instance
   * 0 means unlimited. A negative number means no retries.
   *
   * @default 0
   */
  maxRetries: number;
}

export type FlagdProviderOptions = Partial<Options> & Pick<Options, 'host'>;

export const DEFAULT_MAX_DELAY = 60000;

export function getOptions(options: FlagdProviderOptions): Options {
  return {
    ...{
      port: 443,
      tls: true,
      maxRetries: 0,
      maxDelay: DEFAULT_MAX_DELAY,
    },
    ...options,
  };
}
