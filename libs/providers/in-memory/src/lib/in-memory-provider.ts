import {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  FlagNotFoundError,
  TypeMismatchError,
  StandardResolutionReasons,
} from '@openfeature/js-sdk';
import { FlagConfiguration } from './flag-configuration';

export class InMemoryProvider implements Provider {
  readonly metadata = {
    name: 'In-Memory Provider',
  } as const;
  private _flagConfiguration: FlagConfiguration;

  constructor(flagConfiguration: FlagConfiguration = {}) {
    this._flagConfiguration = flagConfiguration;
  }

  async resolveBooleanEvaluation(flagKey: string): Promise<ResolutionDetails<boolean>> {
    if (!(flagKey in this._flagConfiguration)) {
      throw new FlagNotFoundError();
    }
    const flagValue = this._flagConfiguration[flagKey];
    if (typeof flagValue !== 'boolean') {
      throw new TypeMismatchError();
    }

    return {
      value: flagValue,
      reason: StandardResolutionReasons.STATIC,
    };
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    throw new Error('Method not implemented.');
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    throw new Error('Method not implemented.');
  }

  resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    throw new Error('Method not implemented.');
  }
}
