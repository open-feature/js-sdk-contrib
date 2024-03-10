import {
  EvaluationFailureResponse,
  EvaluationRequest,
  EvaluationSuccessResponse,
  isEvaluationFailureResponse,
  isEvaluationSuccessResponse,
} from '../types/evaluation';
import {
  OFREPApiFetchError,
  OFREPApiInvalidResponseError,
  OFREPApiTooManyRequestsError,
  OFREPApiUnauthorizedError,
} from './errors';

export type FetchAPI = WindowOrWorkerGlobalScope['fetch'];
export type RequestOptions = Omit<RequestInit, 'method' | 'body'>;

export interface OFREPApiResult<
  S extends number | undefined,
  T,
  R extends Response | undefined = Response | undefined,
> {
  readonly status: S;
  readonly value: T;
  readonly response: R;
}

export type OFREPApiFailureResult = OFREPApiResult<Exclude<number, 200>, EvaluationFailureResponse>;
export type OFREPApiSuccessResult = OFREPApiResult<200, EvaluationSuccessResponse, Response>;

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

    if (response.status === 409) {
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
  ): Promise<OFREPApiFailureResult | OFREPApiSuccessResult> {
    const request = new Request(`${this.baseUrl}/ofrep/v1/evaluate/flags/${flagKey}`, {
      ...options,
      method: 'POST',
      body: JSON.stringify(evaluationRequest),
    });

    const { response, body } = await this.doFetchRequest(request);
    if (response.status === 200 && isEvaluationSuccessResponse(body)) {
      return { status: response.status, value: body, response };
    } else if (isEvaluationFailureResponse(body)) {
      return { status: response.status, value: body, response };
    }

    throw new OFREPApiInvalidResponseError(response, 'The JSON returned by OFREP does not match the expected format');
  }
}
