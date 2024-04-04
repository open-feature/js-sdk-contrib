import {
  ErrorCode,
  EvaluationContext,
  JsonValue,
  Provider,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/server-sdk';
import {
  EvaluationFlagValue,
  handleEvaluationError,
  HttpHeaders,
  mergeHeaders,
  OFREPApi,
  OFREPApiEvaluationResult,
  OFREPApiTooManyRequestsError,
  OFREPProviderBaseOptions,
  RequestOptions,
  toRequestOptions,
  toResolutionDetails,
} from '@openfeature/ofrep-core';

export type OFREPProviderOptions = Omit<OFREPProviderBaseOptions, 'headersFactory'> & {
  headersFactory?: () => Promise<HttpHeaders> | HttpHeaders;
};

export class OFREPProvider implements Provider {
  private notBefore: Date | null = null;
  private ofrepApi: OFREPApi;

  readonly runsOn = 'server';
  readonly metadata = {
    name: 'OpenFeature Remote Evaluation Protocol Server',
  };

  constructor(private options: OFREPProviderOptions) {
    try {
      // Cannot use URL.canParse as it is only available from Node 19.x
      new URL(this.options.baseUrl);
    } catch {
      throw new Error(`The given OFREP URL "${this.options.baseUrl}" is not a valid URL.`);
    }

    this.ofrepApi = new OFREPApi(options.baseUrl, options.fetchImplementation);
  }

  public async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.evaluate(flagKey, defaultValue, context);
  }

  public async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.evaluate(flagKey, defaultValue, context);
  }

  public async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.evaluate(flagKey, defaultValue, context);
  }

  public async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    return this.evaluate(flagKey, defaultValue, context);
  }

  private async evaluate<T extends EvaluationFlagValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    const currentDate = new Date();
    if (this.notBefore && this.notBefore > currentDate) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DEFAULT,
        errorCode: ErrorCode.GENERAL,
        flagMetadata: {
          retryAfter: this.notBefore.toISOString(),
        },
        errorMessage: `OFREP evaluation paused due to TooManyRequests until ${this.notBefore.toISOString()}`,
      };
    } else if (this.notBefore) {
      this.notBefore = null;
    }

    try {
      const result = await this.ofrepApi.postEvaluateFlags(flagKey, { context }, await this.baseRequestOptions());
      return this.toResolutionDetails(result, defaultValue);
    } catch (error) {
      if (error instanceof OFREPApiTooManyRequestsError) {
        this.notBefore = error.retryAfterDate;
      }
      throw error;
    }
  }

  private toResolutionDetails<T extends EvaluationFlagValue>(
    result: OFREPApiEvaluationResult,
    defaultValue: T,
  ): ResolutionDetails<T> {
    if (result.httpStatus !== 200) {
      handleEvaluationError(result);
    }

    if (typeof result.value.value !== typeof defaultValue) {
      throw new TypeMismatchError(`Expected flag type ${typeof defaultValue} but got ${typeof result.value.value}`);
    }

    return toResolutionDetails(result.value);
  }

  private async baseRequestOptions(): Promise<RequestOptions> {
    const { headers, headersFactory, ...restOptions } = this.options;
    return {
      ...toRequestOptions(restOptions),
      headers: mergeHeaders(headers, await headersFactory?.()),
    };
  }
}
