import {FlagValue, JsonValue, ProviderEvents, OpenFeatureEventEmitter, Provider, TypeMismatchError, GeneralError, ProviderStatus, ResolutionDetails, FlagNotFoundError, StandardResolutionReasons} from '@openfeature/web-sdk'
import { FlagConfiguration } from '../flag-configuration';

export class InMemoryProvider implements Provider {
  public readonly events = new OpenFeatureEventEmitter();
  readonly metadata = {
    name: 'In-Memory Provider (web)',
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

  resolveBooleanEvaluation(flagKey: string, _defaultValue: boolean): ResolutionDetails<boolean> {
    const flagValue = this.lookupFlagValueOrThrow(flagKey);

    if (typeof flagValue !== 'boolean') {
      throw new TypeMismatchError();
    }

    return staticResolution(flagValue);
  }

  resolveStringEvaluation(flagKey: string, _defaultValue: string): ResolutionDetails<string> {
    const flagValue = this.lookupFlagValueOrThrow(flagKey);

    if (typeof flagValue !== 'string') {
      throw new TypeMismatchError();
    }

    return staticResolution(flagValue);
  }

  resolveNumberEvaluation(flagKey: string, _defaultValue: number): ResolutionDetails<number> {
    const flagValue = this.lookupFlagValueOrThrow(flagKey);

    if (typeof flagValue !== 'number') {
      throw new TypeMismatchError();
    }

    return staticResolution(flagValue);
  }

  resolveObjectEvaluation<T extends JsonValue>(flagKey: string, defaultValue: T): ResolutionDetails<T> {
    throw new GeneralError('support for object flags has not been implemented');
  }
  status: ProviderStatus = ProviderStatus.READY

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
