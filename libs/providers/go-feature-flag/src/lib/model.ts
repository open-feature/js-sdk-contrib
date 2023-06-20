import {
  ErrorCode,
  EvaluationContextValue,
} from '@openfeature/js-sdk';

/**
 * GoFeatureFlagUser is the representation of a user for GO Feature Flag
 * the key is used to do the repartition in GO Feature Flag this is the only
 * mandatory field when calling the API.
 */
export interface GoFeatureFlagUser {
  key: string;
  anonymous?: boolean;
  custom?: {
    [key: string]: EvaluationContextValue;
  };
}

/**
 * GoFeatureFlagProxyRequest is the request format used to call the GO Feature Flag
 * API in the relay-proxy.
 * The default value is used if something is failing.
 */
export interface GoFeatureFlagProxyRequest<T> {
  user: GoFeatureFlagUser;
  defaultValue: T;
}

/**
 * GoFeatureFlagProxyResponse is the response from the API.
 * It contains the information about the flag you are evaluating.
 */
export interface GoFeatureFlagProxyResponse<T> {
  failed: boolean;
  trackEvents: boolean;
  value: T;
  variationType: string;
  version?: string;
  reason: string | GOFeatureFlagResolutionReasons;
  metadata: Record<string, string | number | boolean>;
  errorCode?: ErrorCode | GOFeatureFlagErrorCode;
  cacheable: boolean;
}

/**
 * GoFeatureFlagProviderOptions is the object containing all the provider options
 * when initializing the open-feature provider.
 */
export interface GoFeatureFlagProviderOptions {
  endpoint: string;
  timeout?: number; // in millisecond

  // apiKey (optional) If the relay proxy is configured to authenticate the requests, you should provide
  // an API Key to the provider. Please ask the administrator of the relay proxy to provide an API Key.
  // (This feature is available only if you are using GO Feature Flag relay proxy v1.7.0 or above)
  // Default: null
  apiKey?: string;

  // disableCache (optional) set to true if you would like that every flag evaluation goes to the GO Feature Flag directly.
  disableCache?: boolean

  // flagCacheSize (optional) is the maximum number of flag events we keep in memory to cache your flags.
  // default: 10000
  flagCacheSize?: number

  // flagCacheTTL (optional) is the time we keep the evaluation in the cache before we consider it as obsolete.
  // If you want to keep the value forever you can set the FlagCacheTTL field to -1
  // default: 1 minute
  flagCacheTTL?: number

  // dataFlushInterval (optional) interval time (in millisecond) we use to call the relay proxy to collect data.
  // The parameter is used only if the cache is enabled, otherwise the collection of the data is done directly
  // when calling the evaluation API.
  // default: 1 minute
  dataFlushInterval?: number

  // disableDataCollection set to true if you don't want to collect the usage of flags retrieved in the cache.
  disableDataCollection?: boolean
}

// GOFeatureFlagResolutionReasons allows to extends resolution reasons
export declare enum GOFeatureFlagResolutionReasons {}

// GOFeatureFlagErrorCode allows to extends error codes
export declare enum GOFeatureFlagErrorCode {}


export interface DataCollectorRequest<T> {
  events: FeatureEvent<T>[];
  meta: Record<string, string>;
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
}

export interface DataCollectorResponse {
  ingestedContentCount: number;
}
