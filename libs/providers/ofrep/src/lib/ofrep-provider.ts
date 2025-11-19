import type { EvaluationFlagValue, OFREPApiEvaluationResult, OFREPProviderBaseOptions } from '@openfeature/ofrep-core';
import { isEvaluationFailureResponse } from '@openfeature/ofrep-core';
import {
  OFREPApi,
  OFREPApiTooManyRequestsError,
  handleEvaluationError,
  toResolutionDetails,
} from '@openfeature/ofrep-core';
import type { EvaluationContext, JsonValue, Provider, ResolutionDetails } from '@openfeature/server-sdk';
import { GeneralError } from '@openfeature/server-sdk';

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
      return this.responseToResolutionDetails(result, defaultValue);
    } catch (error) {
      return handleEvaluationError(error as Error, defaultValue, (resultOrError) => {
        if (resultOrError instanceof OFREPApiTooManyRequestsError) {
          this.notBefore = resultOrError.retryAfterDate;
        }
      });
    }
  }

  private responseToResolutionDetails<T extends EvaluationFlagValue>(
    result: OFREPApiEvaluationResult,
    defaultValue: T,
  ): ResolutionDetails<T> {
    if (result.httpStatus !== 200) {
      return handleEvaluationError(result.value, defaultValue);
    }

    if (isEvaluationFailureResponse(result)) {
      return handleEvaluationError(result, defaultValue);
    }

    return toResolutionDetails(result.value, defaultValue);
  }
}
