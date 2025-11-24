import type { FlagMetadata, ResolutionDetails } from '@openfeature/core';
import { ErrorCode, StandardResolutionReasons } from '@openfeature/core';
import type {
  EvaluationFailureResponse,
  EvaluationFlagValue,
  EvaluationRequest,
  EvaluationSuccessResponse,
  OFREPApiBulkEvaluationResult,
  OFREPApiEvaluationResult,
  OFREPEvaluationErrorHttpStatus,
  OFREPEvaluationSuccessHttpStatus,
} from '../model';
import {
  isBulkEvaluationFailureResponse,
  isBulkEvaluationSuccessResponse,
  isEvaluationFailureResponse,
  OFREPEvaluationErrorHttpStatuses,
  OFREPEvaluationSuccessHttpStatuses,
} from '../model';
import type { OFREPProviderBaseOptions } from '../provider';
import { buildHeaders } from '../provider';
import {
  OFREPApiFetchError,
  OFREPApiTooManyRequestsError,
  OFREPApiUnauthorizedError,
  OFREPApiUnexpectedResponseError,
  OFREPForbiddenError,
} from './errors';
import { isDefined } from '../helpers';

export type FetchAPI = WindowOrWorkerGlobalScope['fetch'];

function isomorphicFetch(): FetchAPI {
  // We need to do this, as fetch needs the window as scope in the browser: https://fetch.spec.whatwg.org/#concept-request-window
  // Without this any request will fail in the browser https://stackoverflow.com/questions/69876859/why-does-bind-fix-failed-to-execute-fetch-on-window-illegal-invocation-err
  if (globalThis) {
    return globalThis.fetch.bind(globalThis);
  } else if (window) {
    return window.fetch.bind(window);
  } else if (self) {
    self.fetch.bind(self);
  }
  return fetch;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export const ErrorMessageMap: { [key in ErrorCode]: string } = {
  [ErrorCode.FLAG_NOT_FOUND]: 'Flag was not found',
  [ErrorCode.GENERAL]: 'General error',
  [ErrorCode.INVALID_CONTEXT]: 'Context is invalid or could be parsed',
  [ErrorCode.PARSE_ERROR]: 'Flag or flag configuration could not be parsed',
  [ErrorCode.PROVIDER_FATAL]: 'Provider is in a fatal error state',
  [ErrorCode.PROVIDER_NOT_READY]: 'Provider is not yet ready',
  [ErrorCode.TARGETING_KEY_MISSING]: 'Targeting key is missing',
  [ErrorCode.TYPE_MISMATCH]: 'Flag is not of expected type',
};

export class OFREPApi {
  private static readonly jsonRegex = new RegExp(/application\/[^+]*[+]?(json);?.*/, 'i');

  constructor(
    private baseOptions: OFREPProviderBaseOptions,
    private fetchImplementation: FetchAPI = isomorphicFetch(),
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

  private async doFetchRequest(
    req: Request,
  ): Promise<{ response: Response; body?: EvaluationSuccessResponse | EvaluationFailureResponse }> {
    let response: Response;
    try {
      const timeoutMs = this.baseOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const controller = new AbortController();
      // Uses a setTimeout instead of AbortSignal.timeout to support older runtimes.
      setTimeout(
        () => controller.abort(new DOMException(`This signal is timeout in ${timeoutMs}ms`, 'TimeoutError')),
        timeoutMs,
      );
      response = await this.fetchImplementation(req, {
        signal: controller.signal,
      });
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

  public async postEvaluateFlag(
    flagKey: string,
    evaluationRequest?: EvaluationRequest,
  ): Promise<OFREPApiEvaluationResult> {
    let url = `${this.baseOptions.baseUrl}/ofrep/v1/evaluate/flags/${flagKey}`;
    if (this.baseOptions.query) {
      url = url + `?${this.baseOptions.query.toString()}`;
    }

    const request = new Request(url, {
      headers: await buildHeaders(this.baseOptions),
      method: 'POST',
      body: JSON.stringify(evaluationRequest ?? {}),
    });

    const { response, body } = await this.doFetchRequest(request);
    if (response.status === 200 && body && !isEvaluationFailureResponse(body)) {
      return { httpStatus: response.status, value: body, httpResponse: response };
    } else if (OFREPApi.isOFREFErrorHttpStatus(response.status) && isEvaluationFailureResponse(body)) {
      return { httpStatus: response.status, value: body, httpResponse: response };
    }

    throw new OFREPApiUnexpectedResponseError(response, 'The OFREP response does not match the expected format');
  }

  public async postBulkEvaluateFlags(
    requestBody?: EvaluationRequest,
    etag: string | null = null,
  ): Promise<OFREPApiBulkEvaluationResult> {
    let url = `${this.baseOptions.baseUrl}/ofrep/v1/evaluate/flags`;
    if (this.baseOptions.query) {
      url = url + `?${this.baseOptions.query.toString()}`;
    }

    const request = new Request(url, {
      headers: await buildHeaders(this.baseOptions, etag),
      method: 'POST',
      body: JSON.stringify(requestBody ?? {}),
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

export function handleEvaluationError<T>(
  resultOrError: EvaluationFailureResponse | Error,
  defaultValue: T,
  callback?: (resultOrError: EvaluationFailureResponse | Error) => void,
): ResolutionDetails<T> {
  callback?.(resultOrError);

  if ('errorCode' in resultOrError) {
    const code = resultOrError.errorCode ?? ErrorCode.GENERAL;
    const message = resultOrError.errorDetails ?? ErrorMessageMap[resultOrError.errorCode] ?? resultOrError.errorCode;
    const metadata = toFlagMetadata(resultOrError.metadata);

    return {
      value: defaultValue,
      reason: StandardResolutionReasons.ERROR,
      flagMetadata: metadata,
      errorCode: code,
      errorMessage: message,
    };
  } else {
    throw resultOrError;
  }
}

export function toResolutionDetails<T extends EvaluationFlagValue>(
  result: EvaluationSuccessResponse,
  defaultValue: T,
): ResolutionDetails<T> {
  if (!isDefined(result.value)) {
    return {
      value: defaultValue,
      variant: result.variant,
      flagMetadata: result.metadata,
      reason: result.reason || StandardResolutionReasons.DEFAULT,
    };
  }

  if (typeof result.value !== typeof defaultValue) {
    return {
      value: defaultValue,
      reason: StandardResolutionReasons.ERROR,
      flagMetadata: result.metadata,
      errorCode: ErrorCode.TYPE_MISMATCH,
      errorMessage: ErrorMessageMap[ErrorCode.TYPE_MISMATCH],
    };
  }

  return {
    value: result.value as T,
    variant: result.variant,
    reason: result.reason,
    flagMetadata: toFlagMetadata(result.metadata),
  };
}

export function toFlagMetadata(metadata?: object): FlagMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  // OFREP metadata is defined as any object but OF metadata is defined as Record<string, string | number | boolean>
  const originalEntries = Object.entries(metadata);
  const onlyPrimitiveEntries = originalEntries.filter(([, value]) =>
    ['string', 'number', 'boolean'].includes(typeof value),
  );
  return Object.fromEntries(onlyPrimitiveEntries);
}
