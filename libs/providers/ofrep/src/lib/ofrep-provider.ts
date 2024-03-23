import {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  InvalidContextError,
  ParseError,
  FlagMetadata,
  GeneralError,
  TargetingKeyMissingError,
  TypeMismatchError,
  FlagNotFoundError,
} from '@openfeature/server-sdk';
import {
  EvaluationFailureErrorCode,
  EvaluationFlagValue,
  OFREPApi,
  OFREPApiEvaluationResult,
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
      const code = result.value.errorCode;
      const details = result.value.errorDetails;

      switch (code) {
        case EvaluationFailureErrorCode.ParseError:
          throw new ParseError(details);
        case EvaluationFailureErrorCode.TargetingKeyMissing:
          throw new TargetingKeyMissingError(details);
        case EvaluationFailureErrorCode.InvalidContext:
          throw new InvalidContextError(details);
        case EvaluationFailureErrorCode.FlagNotFound:
          throw new FlagNotFoundError(details);
        case EvaluationFailureErrorCode.General:
          throw new TargetingKeyMissingError(details);
        default:
          throw new GeneralError(details);
      }
    }

    if (typeof result.value.value !== typeof defaultValue) {
      throw new TypeMismatchError();
    }

    return {
      value: result.value.value as T,
      variant: result.value.variant,
      reason: result.value.reason,
      flagMetadata: result.value.metadata && this.toFlagMetadata(result.value.metadata),
    };
  }

  private toFlagMetadata(metadata: object): FlagMetadata {
    // OFREP metadata is defined as any object but OF metadata is defined as Record<string, string | number | boolean>
    const originalEntries = Object.entries(metadata);
    const onlyPrimitiveEntries = originalEntries.filter(([, value]) =>
      ['string', 'number', 'boolean'].includes(typeof value),
    );
    return Object.fromEntries(onlyPrimitiveEntries);
  }
}
