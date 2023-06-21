import {
  EvaluationContext,
  GeneralError,
  JsonValue,
  OpenFeatureEventEmitter,
  ParseError,
  Provider,
  ProviderEvents,
  ResolutionDetails,
  ResolutionReason,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/js-sdk';
import { getClient, IConfigCatClient, IEvaluationDetails, SettingValue } from 'configcat-js';
import { transformContext } from './context-transformer';

export class ConfigCatProvider implements Provider {
  private readonly clientParameters: Parameters<typeof getClient>;
  public readonly events = new OpenFeatureEventEmitter();
  private client?: IConfigCatClient;

  public metadata = {
    name: ConfigCatProvider.name,
  };

  constructor(...params: Parameters<typeof getClient>) {
    this.clientParameters = params;
  }

  public static create(...params: Parameters<typeof getClient>) {
    return new ConfigCatProvider(...params);
  }

  public async initialize(): Promise<void> {
    return new Promise((resolve) => {
      const originalParameters = this.clientParameters;
      originalParameters[2] ??= {};

      const options = originalParameters[2]
      const oldSetupHooks = options.setupHooks;

      options.setupHooks = (hooks) => {
        oldSetupHooks?.(hooks);

        // After resolving, once, we can simply emit events the next time
        hooks.once('clientReady', () => {
          hooks.on('clientReady', () => this.events.emit(ProviderEvents.Ready));
          this.events.emit(ProviderEvents.Ready);
          resolve();
        });

        hooks.on('configChanged', (projectConfig) =>
          this.events.emit(ProviderEvents.ConfigurationChanged, { metadata: { ...projectConfig } })
        );

        hooks.on('clientError', (message: string, error) =>
          this.events.emit(ProviderEvents.Error, {
            message: message,
            metadata: error,
          })
        );
      };

      this.client = getClient(...originalParameters);
    });
  }

  public get configCatClient() {
    return this.client;
  }

  public async onClose(): Promise<void> {
    await this.client?.dispose();
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    if (!this.client) {
      throw new GeneralError('Provider is not initialized');
    }

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
    if (!this.client) {
      throw new GeneralError('Provider is not initialized');
    }

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
    if (!this.client) {
      throw new GeneralError('Provider is not initialized');
    }

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
    if (!this.client) {
      throw new GeneralError('Provider is not initialized');
    }

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
  data: Omit<IEvaluationDetails, 'value'>,
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
