import { Logger } from '@openfeature/web-sdk';

export enum ChangePropagationStrategy {
  DISABLED = 'DISABLED',
  POLLING = 'POLLING', // Polling strategy is the default strategy
}

export interface OfrepWebProviderOptions {
  /**
   * bearerToken is the Bearer Token used to authenticate the requests to the provider.
   * If configured, the provider will use this Bearer Token to authenticate the requests by adding
   * the header Authorization to each request with the value of the Bearer Token.
   */
  bearerToken?: string;

  /**
   * apiKeyAuth is the API Key used to authenticate the requests to the provider.
   * If configured, the provider will use this API Key to authenticate the requests by adding
   * the header X-API-Key to each request with the value of the API Key.
   */
  apiKeyAuth?: string;

  /**
   * logger is the Open Feature logger used by the provider.
   */
  logger?: Logger;

  /**
   * changePropagationStrategy is the strategy used by the provider to propagate the changes
   * from the server to the client.
   */
  changePropagationStrategy?: ChangePropagationStrategy;

  /**
   * if changePropagationStrategy is POLLING, pollingOptions is the configuration of the polling.
   */
  pollingOptions?: PollingOptions;
}

export interface PollingOptions {
  /**
   * interval is the time in millisecond between each polling request.
   * Default: 10000 ms
   */
  interval?: number;
}
