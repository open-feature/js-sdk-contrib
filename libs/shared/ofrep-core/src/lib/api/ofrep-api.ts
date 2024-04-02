import {
  EvaluationRequest,
  OFREPApiBulkEvaluationResult,
  OFREPApiEvaluationResult,
  OFREPEvaluationErrorHttpStatus,
  OFREPEvaluationErrorHttpStatuses,
  OFREPEvaluationSuccessHttpStatus,
  OFREPEvaluationSuccessHttpStatuses,
  isEvaluationFailureResponse,
  isEvaluationSuccessResponse,
  isBulkEvaluationFailureResponse,
  isBulkEvaluationSuccessResponse,
  EvaluationFailureErrorCode,
  OFREPApiEvaluationFailureResult,
  OFREPApiBulkEvaluationFailureResult,
  EvaluationSuccessResponse,
  EvaluationFlagValue,
} from '../model';
import {
  OFREPApiFetchError,
  OFREPApiUnexpectedResponseError,
  OFREPApiTooManyRequestsError,
  OFREPApiUnauthorizedError,
  OFREPForbiddenError,
} from './errors';
import {
  FlagMetadata,
  FlagNotFoundError,
  GeneralError,
  InvalidContextError,
  ParseError,
  TargetingKeyMissingError,
  ResolutionDetails,
} from '@openfeature/core';

export type FetchAPI = WindowOrWorkerGlobalScope['fetch'];
export type RequestOptions = Omit<RequestInit, 'method' | 'body'>;

export class OFREPApi {
  private static readonly jsonRegex = new RegExp(/application\/[^+]*[+]?(json);?.*/, 'i');

  constructor(
    private baseUrl: string,
    private fetchImplementation: FetchAPI = fetch,
  ) {}

  private isJsonMime(response: Response) {
    const contentTypeHeader = response.headers.get('Content-Type');
    return !!contentTypeHeader && OFREPApi.jsonRegex.test(contentTypeHeader);
  }

  public static isOFREFErrorHttpStatus(status: number): status is OFREPEvaluationErrorHttpStatus {
    return (OFREPEvaluationErrorHttpStatuses as readonly number[]).includes(status);
  }

  public static isOFREFSuccessHttpStatus(status: number): status is OFREPEvaluationSuccessHttpStatus {
    return (OFREPEvaluationSuccessHttpStatuses as readonly number[]).includes(status);
  }

  private async doFetchRequest(req: Request): Promise<{ response: Response; body?: unknown }> {
    let response: Response;
    try {
      response = await this.fetchImplementation(req);
    } catch (err) {
      throw new OFREPApiFetchError(err, 'The OFREP request failed.', { cause: err });
    }

    if (response.status === 401) {
      throw new OFREPApiUnauthorizedError(response);
    }

    if (response.status === 403) {
      throw new OFREPForbiddenError(response);
    }

    if (response.status === 429) {
      throw new OFREPApiTooManyRequestsError(response);
    }

    if (response.status === 200 && !this.isJsonMime(response)) {
      throw new OFREPApiUnexpectedResponseError(response, 'OFREP did not respond with expected MIME application/json');
    }

    try {
      return { response, body: await response.json() };
    } catch {
      return { response };
    }
  }

  public async postEvaluateFlags(
    flagKey: string,
    evaluationRequest?: EvaluationRequest,
    options?: RequestOptions,
  ): Promise<OFREPApiEvaluationResult> {
    const request = new Request(`${this.baseUrl}/ofrep/v1/evaluate/flags/${flagKey}`, {
      ...options,
      method: 'POST',
      body: JSON.stringify(evaluationRequest ?? {}),
    });

    const { response, body } = await this.doFetchRequest(request);
    if (response.status === 200 && isEvaluationSuccessResponse(body)) {
      return { httpStatus: response.status, value: body, httpResponse: response };
    } else if (OFREPApi.isOFREFErrorHttpStatus(response.status) && isEvaluationFailureResponse(body)) {
      return { httpStatus: response.status, value: body, httpResponse: response };
    }

    throw new OFREPApiUnexpectedResponseError(response, 'The OFREP response does not match the expected format');
  }

  public async postBulkEvaluateFlags(
    evaluationRequest?: EvaluationRequest,
    options?: RequestOptions,
  ): Promise<OFREPApiBulkEvaluationResult> {
    const request = new Request(`${this.baseUrl}/ofrep/v1/evaluate/flags`, {
      ...options,
      method: 'POST',
      body: JSON.stringify(evaluationRequest ?? {}),
    });

    const { response, body } = await this.doFetchRequest(request);
    if (response.status === 200 && isBulkEvaluationSuccessResponse(body)) {
      return { httpStatus: response.status, value: body, httpResponse: response };
    } else if (response.status === 304) {
      return { httpStatus: response.status, value: undefined, httpResponse: response };
    } else if (OFREPApi.isOFREFErrorHttpStatus(response.status) && isBulkEvaluationFailureResponse(body)) {
      return { httpStatus: response.status as OFREPEvaluationErrorHttpStatus, value: body, httpResponse: response };
    }

    throw new OFREPApiUnexpectedResponseError(response, 'The OFREP response does not match the expected format');
  }
}

export function handleEvaluationError(
  result: OFREPApiEvaluationFailureResult | OFREPApiBulkEvaluationFailureResult,
): never {
  const code = result.value.errorCode;
  const details = result.value.errorDetails;

  switch (code) {
    case EvaluationFailureErrorCode.ParseError:
      throw new ParseError(details);
    case EvaluationFailureErrorCode.TargetingKeyMissing:
      throw new TargetingKeyMissingError(details);
    case EvaluationFailureErrorCode.InvalidContext:
      throw new InvalidContextError(details);
    case EvaluationFailureErrorCode.FlagNotFound:
      throw new FlagNotFoundError(details);
    case EvaluationFailureErrorCode.General:
      throw new GeneralError(details);
    default:
      throw new GeneralError(details);
  }
}

export function toResolutionDetails<T extends EvaluationFlagValue>(
  result: EvaluationSuccessResponse,
): ResolutionDetails<T> {
  return {
    value: result.value as T,
    variant: result.variant,
    reason: result.reason,
    flagMetadata: result.metadata && toFlagMetadata(result.metadata),
  };
}

export function toFlagMetadata(metadata: object): FlagMetadata {
  // OFREP metadata is defined as any object but OF metadata is defined as Record<string, string | number | boolean>
  const originalEntries = Object.entries(metadata);
  const onlyPrimitiveEntries = originalEntries.filter(([, value]) =>
    ['string', 'number', 'boolean'].includes(typeof value),
  );
  return Object.fromEntries(onlyPrimitiveEntries);
}
