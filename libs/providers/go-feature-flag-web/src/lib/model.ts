/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ErrorCode,
  EvaluationContext,
  EvaluationContextValue,
  FlagValue,
  TrackingEventDetails,
} from '@openfeature/web-sdk';

/**
 * GoFeatureFlagEvaluationContext is the representation of a user for GO Feature Flag
 * the key is used to do the repartition in GO Feature Flag this is the only
 * mandatory field when calling the API.
 */
export interface GoFeatureFlagEvaluationContext {
  key: string;
  custom?: {
    [key: string]: EvaluationContextValue;
  };
}

/**
 * GoFeatureFlagAllFlagRequest is the request format used to call the GO Feature Flag
 * API to retrieve all the feature flags for this user.
 */
export interface GoFeatureFlagAllFlagRequest {
  evaluationContext: GoFeatureFlagEvaluationContext;
}

/**
 * GoFeatureFlagProviderOptions is the object containing all the provider options
 * when initializing the open-feature provider.
 */
export interface GoFeatureFlagWebProviderOptions {
  // endpoint is the URL where your GO Feature Flag server is located.
  endpoint: string;

  // timeout is the time in millisecond we wait for an answer from the server.
  // Default: 10000 ms
  apiTimeout?: number;

  // apiKey (optional) If the relay proxy is configured to authenticate the requests, you should provide
  // an API Key to the provider. Please ask the administrator of the relay proxy to provide an API Key.
  // (This feature is available only if you are using GO Feature Flag relay proxy v1.7.0 or above)
  // Default: null
  apiKey?: string;

  // initial delay in millisecond to wait before retrying to connect to GO Feature Flag (websocket and API)
  // Default: 100 ms
  retryInitialDelay?: number;

  // retryDelayMultiplier (optional) multiplier of retryInitialDelay after each failure
  // (example: 1st connection retry will be after 100ms, second after 200ms, third after 400ms ...)
  // Default: 2
  retryDelayMultiplier?: number;

  // maximum number of retries before considering GO Feature Flag is unreachable
  // Default: 10
  maxRetries?: number;

  // dataFlushInterval (optional) interval time (in millisecond) we use to call the relay proxy to collect data.
  // The parameter is used only if the cache is enabled, otherwise the collection of the data is done directly
  // when calling the evaluation API.
  // default: 1 minute
  dataFlushInterval?: number;

  // disableDataCollection (optional) set to true if you don't want to collect the usage of flags retrieved in the cache.
  disableDataCollection?: boolean;

  // exporterMetadata (optional) exporter metadata is a set of key-value that will be added to the metadata when calling the
  // exporter API. All those information will be added to the event produce by the exporter.
  //
  // ‼️Important: If you are using a GO Feature Flag relay proxy before version v1.41.0, the information
  // of this field will not be added to your feature events.
  exporterMetadata?: Record<string, ExporterMetadataValue>;
}

// ExporterMetadataValue is the type of the value that can be used in the exporterMetadata
export type ExporterMetadataValue = string | number | boolean;

/**
 * FlagState is the object used to get the value return by GO Feature Flag.
 */
export interface FlagState<T extends FlagValue> {
  failed: boolean;
  trackEvents: boolean;
  value: T;
  variationType: string;
  version?: string;
  reason: string;
  metadata: Record<string, string | number | boolean>;
  errorCode?: ErrorCode;
  cacheable: boolean;
}

/**
 * GOFeatureFlagAllFlagsResponse is the object containing the results returned
 * by GO Feature Flag.
 */
export interface GOFeatureFlagAllFlagsResponse {
  valid: boolean;
  flags: Record<string, FlagState<FlagValue>>;
}

/**
 * Format of the websocket event we can receive.
 */
export interface GOFeatureFlagWebsocketResponse {
  deleted?: { [key: string]: any };
  added?: { [key: string]: any };
  updated?: { [key: string]: any };
}

export interface DataCollectorRequest<T> {
  events: Array<FeatureEvent<T> | TrackingEvent>;
  meta: Record<string, ExporterMetadataValue>;
}

export interface FeatureEvent<T> {
  contextKind: string;
  creationDate: number;
  default: boolean;
  key: string;
  kind: string;
  userKey: string;
  value: T;
  variation: string;
  version?: string;
  source?: string;
}

export interface TrackingEvent {
  kind: string;
  contextKind: string;
  userKey: string;
  creationDate: number;
  key: string;
  evaluationContext: EvaluationContext;
  trackingEventDetails: TrackingEventDetails;
}
