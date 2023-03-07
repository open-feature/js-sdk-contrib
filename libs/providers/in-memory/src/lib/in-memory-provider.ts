import {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  FlagNotFoundError,
  TypeMismatchError,
  StandardResolutionReasons,
  GeneralError,
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

  replaceConfiguration(flagConfiguration: FlagConfiguration) {
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

  async resolveStringEvaluation(flagKey: string): Promise<ResolutionDetails<string>> {
    if (!(flagKey in this._flagConfiguration)) {
      throw new FlagNotFoundError();
    }
    const flagValue = this._flagConfiguration[flagKey];
    if (typeof flagValue !== 'string') {
      throw new TypeMismatchError();
    }

    return {
      value: flagValue,
      reason: StandardResolutionReasons.STATIC,
    };
  }

  async resolveNumberEvaluation(flagKey: string): Promise<ResolutionDetails<number>> {
    if (!(flagKey in this._flagConfiguration)) {
      throw new FlagNotFoundError();
    }
    const flagValue = this._flagConfiguration[flagKey];
    if (typeof flagValue !== 'number') {
      throw new TypeMismatchError();
    }

    return {
      value: flagValue,
      reason: StandardResolutionReasons.STATIC,
    };
  }

  async resolveObjectEvaluation<U extends JsonValue>(flagKey: string): Promise<ResolutionDetails<U>> {
    throw new GeneralError('support for object flags has not been implemented');
  }
}
