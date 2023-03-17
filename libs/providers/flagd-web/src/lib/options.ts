export interface Options {
  /**
   * The domain name or IP address of flagd.
   */
  host: string;

  /**
   * The port flagd is listening on.
   *
   * @default 443
   */
  port: number;

  /**
   * The path at which the flagd gRPC service is available, for example: /flagd-api (optional).
   * 
   * @default ""
   */
  pathPrefix: string;

  /**
   * Determines if TLS (https) should be used.
   *
   * @default true
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
      pathPrefix: ""
    },
    ...options,
  };
}
