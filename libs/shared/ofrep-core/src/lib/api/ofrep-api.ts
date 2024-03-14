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
} from '../model';
import {
  OFREPApiFetchError,
  OFREPApiUnexpectedResponseError,
  OFREPApiTooManyRequestsError,
  OFREPApiUnauthorizedError,
  OFREPForbiddenError,
} from './errors';

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
