import { ErrorCode, FlagMetadata, ResolutionDetails, StandardResolutionReasons } from '@openfeature/core';
import {
  EvaluationFlagValue,
  EvaluationRequest,
  EvaluationSuccessResponse,
  OFREPApiBulkEvaluationFailureResult,
  OFREPApiBulkEvaluationResult,
  OFREPApiEvaluationResult,
  OFREPEvaluationErrorHttpStatus,
  OFREPEvaluationErrorHttpStatuses,
  OFREPEvaluationSuccessHttpStatus,
  OFREPEvaluationSuccessHttpStatuses,
  isBulkEvaluationFailureResponse,
  isBulkEvaluationSuccessResponse,
  isEvaluationFailureResponse,
  isEvaluationSuccessResponse,
} from '../model';
import { OFREPProviderBaseOptions, buildHeaders } from '../provider';
import {
  OFREPApiFetchError,
  OFREPApiTooManyRequestsError,
  OFREPApiUnauthorizedError,
  OFREPApiUnexpectedResponseError,
  OFREPForbiddenError,
} from './errors';

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

  private async doFetchRequest(req: Request): Promise<{ response: Response; body?: unknown }> {
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
    if (response.status === 200 && isEvaluationSuccessResponse(body)) {
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
  resultOrError: OFREPApiBulkEvaluationFailureResult | Error,
  defaultValue: T,
  callback?: (resultOrError: OFREPApiBulkEvaluationFailureResult | Error) => void,
): ResolutionDetails<T> {
  callback?.(resultOrError);

  if ('value' in resultOrError) {
    const code = resultOrError.value.errorCode || ErrorCode.GENERAL;
    const message = resultOrError.value.errorCode;
    const metadata = resultOrError.value.metadata;

    const resolution: ResolutionDetails<T> = {
      value: defaultValue,
      reason: StandardResolutionReasons.ERROR,
      flagMetadata: metadata,
      errorCode: code,
      errorMessage: message,
    };

    return resolution;
  } else {
    if (resultOrError instanceof Error) {
      throw resultOrError;
    } else {
      throw new Error('OFREP flag evaluation error', { cause: resultOrError });
    }
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
