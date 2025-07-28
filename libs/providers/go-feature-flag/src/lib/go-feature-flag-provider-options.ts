import type { EvaluationType, ExporterMetadata } from './model';
import type { FetchAPI } from './helper/fetch-api';

export interface GoFeatureFlagProviderOptions {
  /**
   * The endpoint of the GO Feature Flag relay-proxy.
   */
  endpoint: string;

  /**
   * The type of evaluation to use.
   * @default EvaluationType.InProcess
   */
  evaluationType?: EvaluationType;

  /**
   * The timeout for HTTP requests in milliseconds.
   * @default 10000
   */
  timeout?: number;

  /**
   * The interval for polling flag configuration changes in milliseconds.
   * @default 120000
   */
  flagChangePollingIntervalMs?: number;

  /**
   * The interval for flushing data collection events in milliseconds.
   * @default 1000
   */
  dataFlushInterval?: number;

  /**
   * The maximum number of pending events before flushing.
   * @default 10000
   */
  maxPendingEvents?: number;

  /**
   * Whether to disable data collection.
   * @default false
   */
  disableDataCollection?: boolean;

  /**
   * ‼️Important: If you are using a GO Feature Flag relay proxy before version v1.41.0, the information
   * of this field will not be added to your feature events.
   */
  exporterMetadata?: ExporterMetadata;

  /**
   * API key for authentication with the relay-proxy.
   */
  apiKey?: string;

  /**
   * Fetch implementation for HTTP requests.
   */
  fetchImplementation?: FetchAPI;
}
