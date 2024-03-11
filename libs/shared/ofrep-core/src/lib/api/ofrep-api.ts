import { EvaluationRequest, isEvaluationFailureResponse, isEvaluationSuccessResponse } from '../model/evaluation';
import {
  OFREPApiFetchError,
  OFREPApiInvalidResponseError,
  OFREPApiTooManyRequestsError,
  OFREPApiUnauthorizedError,
} from './errors';
import { isBulkEvaluationFailureResponse, isBulkEvaluationSuccessResponse } from '../model/bulk-evaluation';
import {
  OFREPApiBulkEvaluationResult,
  OFREPApiEvaluationResult,
  OFREPEvaluationErrorHttpStatus,
  OFREPEvaluationErrorHttpStatuses,
  OFREPEvaluationSuccessHttpStatus,
  OFREPEvaluationSuccessHttpStatuses,
} from '../model/ofrep-api-result';

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

  private async doFetchRequest(req: Request): Promise<{ response: Response; body: object }> {
    let response: Response;
    try {
      response = await this.fetchImplementation(req);
    } catch (err) {
      throw new OFREPApiFetchError(err, 'The OFREP request failed.', { cause: err });
    }

    if (response.status === 401) {
      throw new OFREPApiUnauthorizedError(response);
    }

    if (response.status === 429) {
      throw new OFREPApiTooManyRequestsError(response);
    }

    if (!this.isJsonMime(response)) {
      throw new OFREPApiInvalidResponseError(response, 'OFREP did not respond with expected MIME application/json');
    }

    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') {
      throw new OFREPApiInvalidResponseError(response, 'OFREP did not respond with an object as body');
    }

    return { response, body };
  }

  public async postEvaluateFlags(
    flagKey: string,
    evaluationRequest: EvaluationRequest,
    options?: RequestOptions,
  ): Promise<OFREPApiEvaluationResult> {
    const request = new Request(`${this.baseUrl}/ofrep/v1/evaluate/flags/${flagKey}`, {
      ...options,
      method: 'POST',
      body: JSON.stringify(evaluationRequest),
    });

    const { response, body } = await this.doFetchRequest(request);
    if (response.status === 200 && isEvaluationSuccessResponse(body)) {
      return { status: response.status, value: body, response };
    } else if (OFREPApi.isOFREFErrorHttpStatus(response.status) && isEvaluationFailureResponse(body)) {
      return { status: response.status, value: body, response };
    }

    throw new OFREPApiInvalidResponseError(response, 'The JSON returned by OFREP does not match the expected format');
  }

  public async postBulkEvaluateFlags(
    evaluationRequest: EvaluationRequest,
    options?: RequestOptions,
  ): Promise<OFREPApiBulkEvaluationResult> {
    const request = new Request(`${this.baseUrl}/ofrep/v1/evaluate/flags`, {
      ...options,
      method: 'POST',
      body: JSON.stringify(evaluationRequest),
    });

    const { response, body } = await this.doFetchRequest(request);
    if (response.status === 200 && isBulkEvaluationSuccessResponse(body)) {
      return { status: response.status, value: body, response };
    } else if (OFREPApi.isOFREFErrorHttpStatus(response.status) && isBulkEvaluationFailureResponse(body)) {
      return { status: response.status as OFREPEvaluationErrorHttpStatus, value: body, response };
    }

    throw new OFREPApiInvalidResponseError(response, 'The JSON returned by OFREP does not match the expected format');
  }
}
