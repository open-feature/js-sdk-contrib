import {
  EvaluationContext,
  JsonValue,
  ParseError,
  Provider,
  ResolutionDetails,
  ResolutionReason,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/js-sdk';
import * as configcat from 'configcat-js';
import { IConfigCatClient } from 'configcat-js';
import { SettingValue } from 'configcat-common/lib/RolloutEvaluator';
import { transformContext } from './context-transformer';

export class ConfigCatProvider implements Provider {
  private client: IConfigCatClient;

  private constructor(client: IConfigCatClient) {
    this.client = client;
  }

  public static create(...params: Parameters<typeof configcat.getClient>) {
    return new ConfigCatProvider(configcat.getClient(...params));
  }

  public static createFromClient(client: IConfigCatClient) {
    return new ConfigCatProvider(client);
  }

  metadata = {
    name: ConfigCatProvider.name,
  };

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    const { value, ...evaluationData } = await this.client.getValueDetailsAsync<SettingValue>(
      flagKey,
      undefined,
      transformContext(context)
    );

    const validatedValue = validateFlagType('boolean', value);

    return validatedValue
      ? toResolutionDetails(validatedValue, evaluationData)
      : toResolutionDetails(defaultValue, evaluationData, StandardResolutionReasons.DEFAULT);
  }

  public async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    const { value, ...evaluationData } = await this.client.getValueDetailsAsync<SettingValue>(
      flagKey,
      undefined,
      transformContext(context)
    );

    const validatedValue = validateFlagType('string', value);

    return validatedValue
      ? toResolutionDetails(validatedValue, evaluationData)
      : toResolutionDetails(defaultValue, evaluationData, StandardResolutionReasons.DEFAULT);
  }

  public async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    const { value, ...evaluationData } = await this.client.getValueDetailsAsync<SettingValue>(
      flagKey,
      undefined,
      transformContext(context)
    );

    const validatedValue = validateFlagType('number', value);

    return validatedValue
      ? toResolutionDetails(validatedValue, evaluationData)
      : toResolutionDetails(defaultValue, evaluationData, StandardResolutionReasons.DEFAULT);
  }

  public async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    const { value, ...evaluationData } = await this.client.getValueDetailsAsync(
      flagKey,
      undefined,
      transformContext(context)
    );

    if (typeof value === 'undefined') {
      return toResolutionDetails(defaultValue, evaluationData, StandardResolutionReasons.DEFAULT);
    }

    if (!isType('string', value)) {
      throw new TypeMismatchError(`Requested object flag but the actual value is not a JSON string`);
    }

    try {
      const object = JSON.parse(value);

      if (typeof object !== 'object') {
        throw new TypeMismatchError(`Requested object flag but the actual value is ${typeof value}`);
      }

      return toResolutionDetails(object, evaluationData);
    } catch (e) {
      if (e instanceof TypeMismatchError) {
        throw e;
      }

      throw new ParseError(`Unable to parse '${value}' as JSON`);
    }
  }
}

function toResolutionDetails<U extends JsonValue>(
  value: U,
  data: Omit<configcat.IEvaluationDetails, 'value'>,
  reason?: ResolutionReason
): ResolutionDetails<U> {
  const matchedRule = Boolean(data.matchedEvaluationRule || data.matchedEvaluationPercentageRule);
  const evaluatedReason = matchedRule ? StandardResolutionReasons.TARGETING_MATCH : StandardResolutionReasons.STATIC;

  return {
    value,
    reason: reason ?? evaluatedReason,
    errorMessage: data.errorMessage,
    variant: data.variationId ?? undefined,
  };
}

type PrimitiveTypeName = 'string' | 'boolean' | 'number' | 'object' | 'undefined';
type PrimitiveType<T> = T extends 'string'
  ? string
  : T extends 'boolean'
  ? boolean
  : T extends 'number'
  ? number
  : T extends 'object'
  ? object
  : T extends 'undefined'
  ? undefined
  : unknown;

function isType<T extends PrimitiveTypeName>(type: T, value: unknown): value is PrimitiveType<T> {
  return typeof value === type;
}

function validateFlagType<T extends PrimitiveTypeName>(type: T, value: unknown): PrimitiveType<T> | undefined {
  if (typeof value !== 'undefined' && !isType(type, value)) {
    throw new TypeMismatchError(`Requested ${type} flag but the actual value is ${typeof value}`);
  }

  return value;
}
