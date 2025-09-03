import {
  Provider,
  ProviderMetadata,
  ResolutionDetails,
  EvaluationContext,
  JsonValue,
  ErrorCode,
  FlagValueType,
  FlagNotFoundError,
  TypeMismatchError,
  Logger,
} from '@openfeature/server-sdk';
import { Flags, Flagsmith, BaseFlag, TraitConfig, FlagsmithValue } from 'flagsmith-nodejs';
import { FlagsmithProviderError } from './exceptions';
import { typeFactory } from './type-factory';

type FlagsmithTrait = Record<string, FlagsmithValue | TraitConfig>;

export default class FlagsmithOpenFeatureProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: 'flagsmith-provider',
  };

  readonly runsOn = 'server';

  private client: Flagsmith;
  private returnValueForDisabledFlags: boolean;
  private useFlagsmithDefaults: boolean;
  private useBooleanConfigValue: boolean;

  constructor(
    client: Flagsmith,
    returnValueForDisabledFlags: boolean,
    useFlagsmithDefaults: boolean,
    useBooleanConfigValue: boolean,
  ) {
    this.client = client;
    this.returnValueForDisabledFlags = returnValueForDisabledFlags;
    this.useFlagsmithDefaults = useFlagsmithDefaults;
    this.useBooleanConfigValue = useBooleanConfigValue;
  }

  private getFlags(evaluatonContext: EvaluationContext): Promise<Flags> {
    if (evaluatonContext?.targetingKey) {
      return this.client.getIdentityFlags(
        evaluatonContext.targetingKey,
        (evaluatonContext.traits as FlagsmithTrait | undefined) || {},
      );
    }
    return this.client.getEnvironmentFlags();
  }

  private async resolve(
    flagKey: string,
    flagType: FlagValueType,
    evaluationContext: EvaluationContext,
  ): Promise<ResolutionDetails<any>> {
    let flag: BaseFlag;
    try {
      const flags = await this.getFlags(evaluationContext);
      flag = flags.getFlag(flagKey);
    } catch (ex) {
      throw new FlagsmithProviderError(
        'An error occurred retrieving flags from Flagsmith client.',
        ErrorCode.GENERAL,
      );
    }

    if (flag.isDefault && !this.useFlagsmithDefaults) {
      throw new FlagNotFoundError(`Flag '${flagKey}' was not found.`);
    }

    if (flagType === 'boolean' && !this.useBooleanConfigValue) {
      return { value: flag.enabled };
    }

    if (!(this.returnValueForDisabledFlags || flag.enabled)) {
      throw new FlagsmithProviderError(
        `Flag '${flagKey}' is not enabled.`,
        ErrorCode.GENERAL,
      );
    }

    const typedValue = typeFactory(flag.value, flagType);
    if (typeof typedValue !== 'undefined' && typeof typedValue !== flagType) {
      throw new TypeMismatchError(`flag key ${flagKey} is not of type ${flagType}`);
    }
    return { value: typedValue };
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    _: boolean,
    context: EvaluationContext,
    __: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    return this.resolve(flagKey, 'boolean', context);
  }

  async resolveStringEvaluation(
    flagKey: string,
    _: string,
    context: EvaluationContext,
    __: Logger,
  ): Promise<ResolutionDetails<string>> {
    return this.resolve(flagKey, 'string', context);
  }

  async resolveNumberEvaluation(
    flagKey: string,
    _: number,
    context: EvaluationContext,
    __: Logger,
  ): Promise<ResolutionDetails<number>> {
    return this.resolve(flagKey, 'number', context);
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    _: T,
    context: EvaluationContext,
    __: Logger,
  ): Promise<ResolutionDetails<T>> {
    return this.resolve(flagKey, 'object', context) as Promise<
      ResolutionDetails<T>
    >;
  }
}
