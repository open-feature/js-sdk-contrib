import { FlagValue, ResolutionReason, FlagMetadata, ErrorCode } from '@openfeature/web-sdk';

export type EvaluateResponse = SingleEvaluationResponse[];

export interface SingleEvaluationResponse {
  errorCode?: ErrorCode;
  errorDetails?: string;
  key: string;
  metadata?: FlagMetadata;
  reason: ResolutionReason;
  value: FlagValue;
  variant: string;
}
