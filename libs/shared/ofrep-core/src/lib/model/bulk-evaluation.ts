import type { ErrorCode } from '@openfeature/core';
import type { EvaluationResponse, MetadataResponse } from './evaluation';
import type { EventStream } from './event-stream';

export interface BulkEvaluationFailureResponse extends MetadataResponse {
  /**
   * An appropriate code specific to the bulk evaluation error. See https://openfeature.dev/specification/types#error-code
   */
  errorCode: ErrorCode;
  /**
   * Optional error details description for logging or other needs
   */
  errorDetails?: string;
}

export function isBulkEvaluationFailureResponse(response: unknown): response is BulkEvaluationFailureResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }

  return 'errorCode' in response;
}

export interface BulkEvaluationSuccessResponse extends MetadataResponse {
  flags?: EvaluationResponse[];
  /**
   * Optional array of real-time change notification connections (ADR-0008).
   */
  eventStreams?: EventStream[];
}

export type BulkEvaluationNotModifiedResponse = undefined;

export function isBulkEvaluationSuccessResponse(response: unknown): response is BulkEvaluationSuccessResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }

  return 'flags' in response;
}

export type BulkEvaluationResponse =
  | BulkEvaluationFailureResponse
  | BulkEvaluationNotModifiedResponse
  | BulkEvaluationSuccessResponse;

/**
 * Optional metadata from an SSE `refetchEvaluation` event, passed as query parameters
 * to the bulk evaluation endpoint so the server can return an optimized diff response.
 * Per ADR-0008.
 */
export interface BulkEvaluationRefetchMetadata {
  /** ETag of the flag configuration that triggered the refetch event. */
  flagConfigEtag?: string;
  /** Last-modified timestamp of the flag configuration. */
  flagConfigLastModified?: string | number;
}
