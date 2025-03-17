import {
  EvaluationContext,
  Logger,
  Provider,
  JsonValue,
  ResolutionDetails,
  OpenFeatureEventEmitter,
  ProviderFatalError,
  ProviderEvents,
  FlagNotFoundError,
  TypeMismatchError,
} from '@openfeature/server-sdk';
import { Unleash, initialize, UnleashConfig, Context } from 'unleash-client';

export class UnleashProvider implements Provider {
  metadata = {
    name: UnleashProvider.name,
  };

  public readonly events = new OpenFeatureEventEmitter();

  private _logger?: Logger;

  // config is the Unleash config provided to the provider
  private _config?: UnleashConfig;

  // client is the Unleash client reference
  private _client?: Unleash;

  private _context?: Context;

  readonly runsOn = 'server';

  hooks = [];

  constructor(config: UnleashConfig, logger?: Logger) {
    this._config = config;
    this._logger = logger;
    this._client = initialize(config);
  }

  public get unleashClient() {
    return this._client;
  }

  async initialize(): Promise<void> {
    await this.initializeClient();
    this._logger?.debug('UnleashProvider initialized');
  }

  private async initializeClient() {
    try {
      this._logger?.debug('Initializing Unleash Client');
      this.registerEventListeners();
      await this._client?.start();
    } catch (e) {
      throw new ProviderFatalError(getErrorMessage(e));
    }
  }

  private registerEventListeners() {
    this._client?.on('update', () => {
      this._logger?.debug('Unleash update event received');
      this.events.emit(ProviderEvents.ConfigurationChanged, {
        message: 'Flags changed',
      });
    });
    this._client?.on('error', (err) => {
      this._logger?.debug('Unleash error event received', err);
      this.events.emit(ProviderEvents.Error, {
        message: 'Error',
      });
    });
    this._client?.on('recovered', () => {
      this._logger?.debug('Unleash recovered event received');
      this.events.emit(ProviderEvents.Ready, {
        message: 'Recovered',
      });
    });
  }

  async onContextChange(_oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    const unleashContext = new Map();
    const properties = new Map();
    Object.keys(newContext).forEach((key) => {
      switch (key) {
        case 'appName':
        case 'userId':
        case 'environment':
        case 'remoteAddress':
        case 'sessionId':
        case 'currentTime':
          unleashContext.set(key, newContext[key]);
          break;
        default:
          properties.set(key, newContext[key]);
          break;
      }
    });
    if (properties.size > 0) {
      unleashContext.set('properties', Object.fromEntries(properties));
    }
    this._context = Object.fromEntries(unleashContext);
    this._logger?.debug('Unleash context updated');
  }

  async onClose() {
    this._logger?.debug('closing Unleash client');
    this._client?.destroy();
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue?: boolean,
    context?: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    const ctx = context as unknown as Context;
    const resp = this._client?.isEnabled(flagKey, ctx, defaultValue);
    if (typeof resp === 'undefined') {
      throw new FlagNotFoundError();
    }
    return {
      value: resp,
    };
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue?: string,
    context?: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    const ctx = context as unknown as Context;
    return this.evaluate<string>(flagKey, defaultValue, ctx, 'string');
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue?: number,
    context?: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    const ctx = context as unknown as Context;
    return this.evaluate<number>(flagKey, defaultValue, ctx, 'number');
  }

  async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue?: U,
    context?: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    const ctx = context as unknown as Context;
    return this.evaluate<U>(flagKey, defaultValue, ctx, 'object');
  }

  private throwTypeMismatchError(variant: string, variantType: string, flagType: string) {
    throw new TypeMismatchError(
      `Type of requested variant ${variant} is of type ${variantType} but requested flag type of ${flagType}`,
    );
  }

  private evaluate<T extends JsonValue>(
    flagKey: string,
    defaultValue: T | undefined,
    context: Context,
    flagType: string,
  ): ResolutionDetails<T> {
    const evaluatedVariant = this._client?.getVariant(flagKey, context);
    let value;
    let variant;
    if (typeof evaluatedVariant === 'undefined') {
      throw new FlagNotFoundError();
    }

    if (evaluatedVariant.name === 'disabled' || typeof evaluatedVariant.payload === 'undefined') {
      value = defaultValue;
    } else {
      variant = evaluatedVariant.name;
      value = evaluatedVariant.payload?.value;

      const variantType = evaluatedVariant.payload?.type;

      if (flagType === 'string' && flagType !== variantType) {
        this.throwTypeMismatchError(variant, variantType, flagType);
      }
      if (flagType === 'number') {
        const numberValue = parseFloat(value);
        if (flagType !== variantType || isNaN(numberValue)) {
          this.throwTypeMismatchError(variant, variantType, flagType);
        }
        value = numberValue;
      }
      if (flagType === 'object') {
        if (variantType !== 'json' && variantType !== 'csv') {
          this.throwTypeMismatchError(variant, variantType, flagType);
        }
      }
    }
    return {
      variant: variant,
      value: value as T,
    };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
