import {
  FlagNotFoundError,
  JsonValue,
  OpenFeatureEventEmitter,
  Provider,
  ProviderEvents,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
  Logger,
  EvaluationContext,
  TargetingKeyMissingError,
  FlagValueType,
} from '@openfeature/js-sdk';
import { FlagConfiguration, Flag } from './flag-configuration';

export class InMemoryProvider implements Provider {
  public readonly events = new OpenFeatureEventEmitter();
  public readonly runsOn = 'server';
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

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, context?: EvaluationContext, logger?: Logger): Promise<ResolutionDetails<boolean>> {
    return Promise.resolve(this.resolveFlagWithReason<boolean>(flagKey, defaultValue, context, logger));
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number, context?: EvaluationContext, logger?: Logger): Promise<ResolutionDetails<number>> {
    return Promise.resolve(this.resolveFlagWithReason<number>(flagKey, defaultValue, context, logger));
  }

  async resolveStringEvaluation(flagKey: string, defaultValue: string, context?: EvaluationContext, logger?: Logger): Promise<ResolutionDetails<string>> {
    return Promise.resolve(this.resolveFlagWithReason<string>(flagKey, defaultValue, context, logger));
  }

  async resolveObjectEvaluation(flagKey: string, defaultValue: JsonValue, context?: EvaluationContext, logger?: Logger): Promise<ResolutionDetails<any>> {
    return Promise.resolve(this.resolveFlagWithReason<JsonValue>(flagKey, defaultValue, context, logger));
  }

  private resolveFlagWithReason<T extends JsonValue | FlagValueType>(flagKey: string, defaultValue: T, ctx?: EvaluationContext, logger?: unknown): ResolutionDetails<any>{
    try {
      const resolutionResult = this.lookupFlagValueOrThrow(flagKey, ctx, logger)

      if (typeof resolutionResult?.value != typeof defaultValue) {
        throw new TypeMismatchError();
      }

      return resolutionResult;
    } catch (error: unknown) {
      return {
        value: defaultValue, reason: error instanceof DisabledError ?
          StandardResolutionReasons.DISABLED
          : StandardResolutionReasons.DEFAULT
      }
    }
  }

  private lookupFlagValueOrThrow(flagKey: string, ctx?: EvaluationContext, logger?: unknown): ResolutionDetails<any>{
    if (!(flagKey in this._flagConfiguration)) {
      throw new FlagNotFoundError();
    }
    const flagSpec: Flag = this._flagConfiguration[flagKey];

    this.throwIfFlagDisabled(flagSpec);

    const isContextEval = ctx && flagSpec?.contextEvaluator;
    const variant = isContextEval ? flagSpec.contextEvaluator?.(ctx) : flagSpec.defaultVariant;

    const value = variant && flagSpec?.variants[variant];

    if (value === undefined) {
      throw new TargetingKeyMissingError();
    }

    return { value, ...(variant && { variant }), reason: isContextEval ? StandardResolutionReasons.TARGETING_MATCH : StandardResolutionReasons.STATIC, };
  }

  private throwIfFlagDisabled(flagSpec: Flag) {
    if (flagSpec.disabled) {
      throw new DisabledError();
    }
  }
}

class DisabledError extends Error {
  constructor() {
    super("Flag is disabled!");
    this.name = "DisabledError";
  }
}
