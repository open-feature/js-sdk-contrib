import { GeneralError } from '@openfeature/core';
import {
  EvaluationFlagValue,
  OFREPApi,
  OFREPApiEvaluationResult,
  OFREPApiTooManyRequestsError,
  OFREPProviderBaseOptions,
  handleEvaluationError,
  toResolutionDetails,
} from '@openfeature/ofrep-core';
import { EvaluationContext, JsonValue, Provider, ResolutionDetails, TypeMismatchError } from '@openfeature/server-sdk';

export type OFREPProviderOptions = OFREPProviderBaseOptions;

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

    this.ofrepApi = new OFREPApi(options, options.fetchImplementation);
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
      throw new GeneralError(`OFREP evaluation paused due to TooManyRequests until ${this.notBefore.toISOString()}`);
    } else if (this.notBefore) {
      this.notBefore = null;
    }

    try {
      const result = await this.ofrepApi.postEvaluateFlag(flagKey, { context });
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
}
