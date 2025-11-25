import type { JsonValue } from '@openfeature/server-sdk';

/**
 * EvaluationResponse represents the response from the GO Feature Flag evaluation.
 */
export interface EvaluationResponse {
  /**
   * Variation is the variation of the flag that was returned by the evaluation.
   */
  variationType?: string;

  /**
   * trackEvents indicates whether events should be tracked for this evaluation.
   */
  trackEvents: boolean;

  /**
   * reason is the reason for the evaluation result.
   */
  reason?: string;

  /**
   * errorCode is the error code for the evaluation result, if any.
   */
  errorCode?: string;

  /**
   * errorDetails provides additional details about the error, if any.
   */
  errorDetails?: string;

  /**
   * value is the evaluated value of the flag.
   */
  value?: JsonValue;

  /**
   * metadata is a dictionary containing additional metadata about the evaluation.
   */
  metadata?: Record<string, JsonValue>;
}
