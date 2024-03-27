import { EvaluationContext, Provider, JsonValue, ResolutionDetails, TypeMismatchError } from '@openfeature/server-sdk';
import {
  EvaluationFlagValue,
  handleEvaluationError,
  OFREPApi,
  OFREPApiEvaluationResult,
  toResolutionDetails,
} from '@openfeature/ofrep-core';

export class OfrepProvider implements Provider {
  private ofrepApi: OFREPApi;

  readonly runsOn = 'server';
  readonly metadata = {
    name: OfrepProvider.name,
  };

  constructor(baseUrl: string) {
    this.ofrepApi = new OFREPApi(baseUrl);
  }

  public async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    const result = await this.ofrepApi.postEvaluateFlags(flagKey, { context });
    return this.toResolutionDetails(result, defaultValue);
  }

  public async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    const result = await this.ofrepApi.postEvaluateFlags(flagKey, { context });
    return this.toResolutionDetails(result, defaultValue);
  }

  public async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    const result = await this.ofrepApi.postEvaluateFlags(flagKey, { context });
    return this.toResolutionDetails(result, defaultValue);
  }

  public async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    const result = await this.ofrepApi.postEvaluateFlags(flagKey, { context });
    return this.toResolutionDetails(result, defaultValue);
  }

  private toResolutionDetails<T extends EvaluationFlagValue>(
    result: OFREPApiEvaluationResult,
    defaultValue: T,
  ): ResolutionDetails<T> {
    if (result.httpStatus !== 200) {
      handleEvaluationError(result);
    }

    if (typeof result.value.value !== typeof defaultValue) {
      throw new TypeMismatchError();
    }

    return toResolutionDetails(result.value);
  }
}
