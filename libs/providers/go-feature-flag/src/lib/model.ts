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
  errorCode?: ErrorCode | GOFeatureFlagErrorCode;
}

/**
 * GoFeatureFlagProviderOptions is the object containing all the provider options
 * when initializing the open-feature provider.
 */
export interface GoFeatureFlagProviderOptions {
  endpoint: string;
  timeout?: number; // in millisecond
}

// GOFeatureFlagResolutionReasons allows to extends resolution reasons
export declare enum GOFeatureFlagResolutionReasons {}

// GOFeatureFlagErrorCode allows to extends error codes
export declare enum GOFeatureFlagErrorCode {}
