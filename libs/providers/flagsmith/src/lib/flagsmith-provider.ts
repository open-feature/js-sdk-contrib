import {
  Provider,
  ProviderMetadata,
  ResolutionDetails,
  EvaluationContext,
  JsonValue,
  ErrorCode,
  FlagValueType,
  FlagNotFoundError,
  Logger,
  ProviderStatus,
  OpenFeatureEventEmitter,
  ProviderEvents,
  StandardResolutionReasons,
  FlagValue,
} from '@openfeature/server-sdk';
import { Flags, Flagsmith, BaseFlag, TraitConfig, FlagsmithValue } from 'flagsmith-nodejs';
import { FlagsmithProviderError } from './exceptions';
import { typeFactory } from './type-factory';

type FlagsmithTrait = Record<string, FlagsmithValue | TraitConfig>;

/**
 * Configuration options for the Flagsmith OpenFeature provider.
 */
interface FlagsmithProviderConfig {
  /** Whether to return values for disabled flags instead of throwing errors */
  returnValueForDisabledFlags?: boolean;
  /** Whether to allow Flagsmith default flag values instead of treating as not found */
  useFlagsmithDefaults?: boolean;
  /** Whether to return flag.value instead of flag.enabled for boolean flags */
  useBooleanConfigValue?: boolean;
}

export default class FlagsmithOpenFeatureProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: 'flagsmith-provider',
  };

  readonly runsOn = 'server';

  public readonly events = new OpenFeatureEventEmitter();
  private _status: ProviderStatus = ProviderStatus.NOT_READY;

  get status(): ProviderStatus {
    return this._status;
  }

  private client: Flagsmith;
  private returnValueForDisabledFlags: boolean;
  private useFlagsmithDefaults: boolean;
  private useBooleanConfigValue: boolean;

  private set status(status: ProviderStatus) {
    if (this._status !== status) {
      this._status = status;
      if (status === ProviderStatus.READY) {
        this.events.emit(ProviderEvents.Ready);
      } else if (status === ProviderStatus.ERROR) {
        this.events.emit(ProviderEvents.Error);
      }
    }
  }

  /**
   * Creates a Flagsmith OpenFeature provider.
   *
   * @param client - The Flagsmith client instance
   * @param config - Provider configuration options
   * @param config.returnValueForDisabledFlags - If true, returns flag values even when disabled. If false, throws error for disabled flags. Default: false
   * @param config.useFlagsmithDefaults - If true, allows using Flagsmith default flag values. If false, throws FlagNotFoundError for missing flags. Default: false
   * @param config.useBooleanConfigValue - If true, returns flag.value for boolean flags. If false, returns flag.enabled. Default: false
   */
  constructor(client: Flagsmith, config: FlagsmithProviderConfig = {}) {
    this.client = client;
    this.returnValueForDisabledFlags = config.returnValueForDisabledFlags ?? false;
    this.useFlagsmithDefaults = config.useFlagsmithDefaults ?? false;
    this.useBooleanConfigValue = config.useBooleanConfigValue ?? false;
  }

  private getFlags(evaluationContext: EvaluationContext): Promise<Flags> {
    if (evaluationContext?.targetingKey) {
      return this.client.getIdentityFlags(
        evaluationContext.targetingKey,
        (evaluationContext.traits as FlagsmithTrait | undefined) || {},
      );
    }
    return this.client.getEnvironmentFlags();
  }

  /**
   * Resolves a feature flag value with type conversion and validation.
   *
   * @param flagKey - The feature flag key to resolve
   * @param flagType - The expected return type ('boolean' | 'string' | 'number' | 'object')
   * @param evaluationContext - OpenFeature evaluation context with targeting and traits
   * @returns Promise resolving to the typed flag value
   * @throws {FlagNotFoundError} When flag doesn't exist and useFlagsmithDefaults is false
   * @throws {FlagsmithProviderError} When flag is disabled and returnValueForDisabledFlags is false
   * @throws {TypeMismatchError} When flag value cannot be converted to requested type
   */
  private async resolve(
    flagKey: string,
    flagType: FlagValueType,
    evaluationContext: EvaluationContext,
    defaultValue: FlagValue,
  ): Promise<ResolutionDetails<any>> {
    let flag: BaseFlag;
    try {
      const flags = await this.getFlags(evaluationContext);
      flag = flags.getFlag(flagKey);
    } catch (error) {
      throw new FlagsmithProviderError('An error occurred retrieving flags from Flagsmith client.', ErrorCode.GENERAL);
    }

    if (!this.useFlagsmithDefaults && (!flag || flag?.isDefault)) {
      throw new FlagNotFoundError(`Flag '${flagKey}' was not found.`);
    }

    if (!this.useBooleanConfigValue && flagType === 'boolean') {
      return {
        value: flag.enabled,
        reason: flag.enabled ? StandardResolutionReasons.TARGETING_MATCH : StandardResolutionReasons.DISABLED,
      };
    }

    if (!(this.returnValueForDisabledFlags || flag.enabled)) {
      throw new FlagsmithProviderError(`Flag '${flagKey}' is not enabled.`, ErrorCode.GENERAL);
    }

    const typedValue = typeFactory(flag.value, flagType);
    if (typedValue === undefined || typeof typedValue !== flagType) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: `Flag value ${flag.value} is not of type ${flagType}`,
        flagMetadata: {},
      };
    }

    if (flag?.isDefault) {
      return {
        value: typedValue,
        reason: StandardResolutionReasons.DEFAULT,
      };
    }

    return {
      value: typedValue,
      reason: flag.enabled ? StandardResolutionReasons.TARGETING_MATCH : StandardResolutionReasons.DISABLED,
    };
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    __: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    return this.resolve(flagKey, 'boolean', context, defaultValue);
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    __: Logger,
  ): Promise<ResolutionDetails<string>> {
    return this.resolve(flagKey, 'string', context, defaultValue);
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    __: Logger,
  ): Promise<ResolutionDetails<number>> {
    return this.resolve(flagKey, 'number', context, defaultValue);
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    __: Logger,
  ): Promise<ResolutionDetails<T>> {
    return this.resolve(flagKey, 'object', context, defaultValue) as Promise<ResolutionDetails<T>>;
  }

  async initialize(context?: EvaluationContext): Promise<void> {
    try {
      await this.getFlags(context || {});
      this.status = ProviderStatus.READY;
    } catch (error) {
      this.status = ProviderStatus.ERROR;
      throw error;
    }
  }

  async onClose(): Promise<void> {
    this.status = ProviderStatus.NOT_READY;
  }
}
