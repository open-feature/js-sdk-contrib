import {
  Provider,
  ProviderMetadata,
  ResolutionDetails,
  EvaluationContext,
  JsonValue,
  ErrorCode,
  FlagValueType,
  Logger,
  StandardResolutionReasons,
  FlagValue,
  GeneralError,
} from '@openfeature/server-sdk';
import { Flags, Flagsmith, BaseFlag, TraitConfig, FlagsmithValue } from 'flagsmith-nodejs';
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

  private client: Flagsmith;
  private returnValueForDisabledFlags: boolean;
  private useFlagsmithDefaults: boolean;
  private useBooleanConfigValue: boolean;

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
    const traits =
      evaluationContext.traits && typeof evaluationContext.traits === 'object'
        ? (evaluationContext.traits as FlagsmithTrait)
        : {};
    if (evaluationContext?.targetingKey) {
      return this.client.getIdentityFlags(evaluationContext.targetingKey, traits);
    }
    return this.client.getEnvironmentFlags();
  }

  /**
   * Resolves a feature flag value with type conversion and validation.
   *
   * @param flagKey - The feature flag key to resolve
   * @param flagType - The expected return type ('boolean' | 'string' | 'number' | 'object')
   * @param evaluationContext - OpenFeature evaluation context with targeting and traits
   * @returns Promise resolving to ResolutionDetails with the typed flag value, or error details
   * @throws {GeneralError} When an error occurs retrieving flags from Flagsmith client
   * @throws {GeneralError} When flag is disabled and returnValueForDisabledFlags is false
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
      throw new GeneralError('An error occurred retrieving flags from Flagsmith client.', {
        cause: error as Error,
      });
    }

    if (!flag || (!this.useFlagsmithDefaults && flag.isDefault)) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `Flag '${flagKey}' was not found.`,
      };
    }

    if (!this.useBooleanConfigValue && flagType === 'boolean') {
      return {
        value: flag.enabled,
        reason: flag.enabled ? StandardResolutionReasons.TARGETING_MATCH : StandardResolutionReasons.DISABLED,
      };
    }

    if (!(this.returnValueForDisabledFlags || flag.enabled)) {
      throw new GeneralError(`Flag '${flagKey}' is not enabled.`);
    }

    const typedValue = typeFactory(flag.value, flagType);
    if (typedValue === undefined || typeof typedValue !== flagType) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: `Flag value ${flag.value} is not of type ${flagType}`,
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
    } catch (error) {
      throw error;
    }
  }
}
