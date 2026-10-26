import type { EvaluationType, ExporterMetadata } from './model';
import type { FetchAPI } from './helper/fetch-api';

export interface GoFeatureFlagProviderOptions {
  /**
   * The endpoint of the GO Feature Flag relay-proxy.
   *
   * Required in both evaluation modes. Remote mode used to exempt it so that `OFREP_ENDPOINT`
   * could supply it instead, which meant the process environment could silently redirect
   * evaluation traffic to another host.
   */
  endpoint: string;

  /**
   * The type of evaluation to use.
   * @default EvaluationType.InProcess
   */
  evaluationType?: EvaluationType;

  /**
   * Base URL for the data-collector endpoint, when it is served separately from the relay proxy.
   *
   * Replaces the whole base - scheme, host, port and path prefix - for data collection **only**.
   * Flag-configuration and evaluation requests continue to use `endpoint`. Authentication, custom
   * `headers` and `timeout` apply to it identically.
   * @default the value of `endpoint`
   */
  dataCollectorBaseURL?: string;

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
   * Restricts the configuration this provider retrieves to the named flags.
   *
   * A service using a handful of flags from a configuration of several thousand otherwise
   * downloads and holds all of them on every poll. Leave unset — or empty — to retrieve
   * everything. In-process evaluation only; remote evaluation resolves one flag per request.
   * @default all flags
   */
  evaluationFlagList?: string[];

  /**
   * The interval for flushing data collection events in milliseconds.
   * @default 60000
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

  /**
   * Path to the WASM binary file.
   * If specified, the provider will load the WASM file from this location
   * instead of using the default resolution strategies.
   * This is useful when the WASM file is bundled in a custom location.
   */
  wasmBinaryPath?: string;

  /**
   * Additional headers sent on every request to the relay proxy, for deployments behind an API
   * gateway that requires its own authentication.
   *
   * Applied in both evaluation modes and to all three endpoints — flag configuration, data
   * collection and remote evaluation.
   *
   * `Content-Type` and `If-None-Match` are transport details owned by the provider and a value
   * supplied here under either name is ignored, whatever its casing.
   *
   * `X-API-Key` is different: it is ignored here only while `apiKey` is set, since that option is
   * the supported way to authenticate. With no `apiKey` configured you may supply one through
   * these headers instead.
   */
  headers?: Record<string, string>;
}
