import {
  FlagNotFoundError,
  FlagValue,
  GeneralError,
  JsonValue,
  OpenFeatureEventEmitter,
  Provider,
  ProviderEvents,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/js-sdk';
import { FlagConfiguration } from './flag-configuration';

export class InMemoryProvider implements Provider {
  public readonly events = new OpenFeatureEventEmitter();
  readonly metadata = {
    name: 'In-Memory Provider',
  } as const;
  private _flagConfiguration: FlagConfiguration;

  constructor(flagConfiguration: FlagConfiguration = {}) {
    this._flagConfiguration = { ...flagConfiguration };
  }

  replaceConfiguration(flagConfiguration: FlagConfiguration) {
    const flagsChanged = Object.entries(flagConfiguration)
      .filter(([key, value]) => this._flagConfiguration[key] !== value)
      .map(([key]) => key);

    this._flagConfiguration = { ...flagConfiguration };
    this.events.emit(ProviderEvents.ConfigurationChanged, { flagsChanged });
  }

  async resolveBooleanEvaluation(flagKey: string): Promise<ResolutionDetails<boolean>> {
    const flagValue = this.lookupFlagValueOrThrow(flagKey);

    if (typeof flagValue !== 'boolean') {
      throw new TypeMismatchError();
    }

    return staticResolution(flagValue);
  }

  async resolveStringEvaluation(flagKey: string): Promise<ResolutionDetails<string>> {
    const flagValue = this.lookupFlagValueOrThrow(flagKey);

    if (typeof flagValue !== 'string') {
      throw new TypeMismatchError();
    }

    return staticResolution(flagValue);
  }

  async resolveNumberEvaluation(flagKey: string): Promise<ResolutionDetails<number>> {
    const flagValue = this.lookupFlagValueOrThrow(flagKey);

    if (typeof flagValue !== 'number') {
      throw new TypeMismatchError();
    }

    return staticResolution(flagValue);
  }

  async resolveObjectEvaluation<U extends JsonValue>(flagKey: string): Promise<ResolutionDetails<U>> {
    throw new GeneralError('support for object flags has not been implemented');
  }

  private lookupFlagValueOrThrow(flagKey: string): FlagValue {
    if (!(flagKey in this._flagConfiguration)) {
      throw new FlagNotFoundError();
    }
    return this._flagConfiguration[flagKey];
  }
}

function staticResolution<U>(value: U): ResolutionDetails<U> {
  return {
    value,
    reason: StandardResolutionReasons.STATIC,
  };
}
