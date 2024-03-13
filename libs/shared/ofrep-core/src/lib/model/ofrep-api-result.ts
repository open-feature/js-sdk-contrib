import { EvaluationFailureResponse, EvaluationSuccessResponse } from './evaluation';
import { BulkEvaluationFailureResponse, BulkEvaluationSuccessResponse } from './bulk-evaluation';

export interface OFREPApiResult<
  S extends OFREPEvaluationErrorHttpStatus | OFREPEvaluationSuccessHttpStatus,
  T,
  R extends Response | undefined = Response | undefined,
> {
  readonly httpStatus: S;
  readonly value: T;
  readonly httpResponse: R;
}

export const OFREPEvaluationErrorHttpStatuses = [400, 404, 500] as const;
export type OFREPEvaluationErrorHttpStatus = (typeof OFREPEvaluationErrorHttpStatuses)[number];

export const OFREPEvaluationSuccessHttpStatuses = [200] as const;
export type OFREPEvaluationSuccessHttpStatus = (typeof OFREPEvaluationSuccessHttpStatuses)[number];

export type OFREPApiEvaluationFailureResult = OFREPApiResult<OFREPEvaluationErrorHttpStatus, EvaluationFailureResponse>;
export type OFREPApiEvaluationSuccessResult = OFREPApiResult<
  OFREPEvaluationSuccessHttpStatus,
  EvaluationSuccessResponse,
  Response
>;
export type OFREPApiEvaluationResult = OFREPApiEvaluationFailureResult | OFREPApiEvaluationSuccessResult;

export type OFREPApiBulkEvaluationFailureResult = OFREPApiResult<
  OFREPEvaluationErrorHttpStatus,
  BulkEvaluationFailureResponse
>;
export type OFREPApiBulkEvaluationSuccessResult = OFREPApiResult<
  OFREPEvaluationSuccessHttpStatus,
  BulkEvaluationSuccessResponse,
  Response
>;
export type OFREPApiBulkEvaluationResult = OFREPApiBulkEvaluationFailureResult | OFREPApiBulkEvaluationSuccessResult;
