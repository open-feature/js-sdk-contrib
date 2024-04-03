import {
  EvaluationContext,
  JsonValue,
  Provider,
  ProviderFatalError,
  ResolutionDetails,
  TypeMismatchError,
} from '@openfeature/server-sdk';
import {
  EvaluationFlagValue,
  handleEvaluationError,
  OFREPApi,
  OFREPApiEvaluationResult,
  OFREPProviderBaseOptions,
  toRequestOptions,
  toResolutionDetails,
} from '@openfeature/ofrep-core';

export type OFREPProviderOptions = OFREPProviderBaseOptions;

export class OFREPProvider implements Provider {
  private ofrepApi: OFREPApi;

  readonly runsOn = 'server';
  readonly metadata = {
    name: OFREPProvider.name,
  };

  constructor(private options: OFREPProviderOptions) {
    try {
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
    const result = await this.ofrepApi.postEvaluateFlags(flagKey, { context }, this.requestOptions);
    return this.toResolutionDetails(result, defaultValue);
  }

  public async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    const result = await this.ofrepApi.postEvaluateFlags(flagKey, { context }, this.requestOptions);
    return this.toResolutionDetails(result, defaultValue);
  }

  public async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    const result = await this.ofrepApi.postEvaluateFlags(flagKey, { context }, this.requestOptions);
    return this.toResolutionDetails(result, defaultValue);
  }

  public async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    const result = await this.ofrepApi.postEvaluateFlags(flagKey, { context }, this.requestOptions);
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
      throw new TypeMismatchError(`Expected flag type ${typeof defaultValue} but got ${typeof result.value.value}`);
    }

    return toResolutionDetails(result.value);
  }

  private get requestOptions() {
    return toRequestOptions(this.options);
  }
}
