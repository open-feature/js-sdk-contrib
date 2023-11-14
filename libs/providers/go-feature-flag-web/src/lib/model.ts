import { FlagValue, ErrorCode, EvaluationContextValue } from '@openfeature/web-sdk';

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
  apiTimeout?: number;

  // apiKey (optional) If the relay proxy is configured to authenticate the requests, you should provide
  // an API Key to the provider. Please ask the administrator of the relay proxy to provide an API Key.
  // (This feature is available only if you are using GO Feature Flag relay proxy v1.7.0 or above)
  // Default: null
  apiKey?: string;

  // initial delay in millisecond to wait before retrying to connect to GO Feature Flag (websocket and API)
  // Default: 100 ms
  retryInitialDelay?: number;

  // multiplier of retryInitialDelay after each failure
  // (example: 1st connection retry will be after 100ms, second after 200ms, third after 400ms ...)
  // Default: 2
  retryDelayMultiplier?: number;

  // maximum number of retries before considering GO Feature Flag is unreachable
  // Default: 10
  maxRetries?: number;
}

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
