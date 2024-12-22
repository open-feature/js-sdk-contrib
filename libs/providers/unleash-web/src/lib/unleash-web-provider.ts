import {
  EvaluationContext,
  Provider,
  Logger,
  JsonValue,
  FlagNotFoundError,
  OpenFeatureEventEmitter,
  ProviderEvents,
  ResolutionDetails,
  ProviderFatalError,
  TypeMismatchError,
} from '@openfeature/web-sdk';
import { UnleashClient } from 'unleash-proxy-client';
import { UnleashConfig } from './unleash-web-provider-config';

export class UnleashWebProvider implements Provider {
  metadata = {
    name: UnleashWebProvider.name,
  };

  public readonly events = new OpenFeatureEventEmitter();

  // logger is the OpenFeature logger to use
  private _logger?: Logger;

  // config is the Unleash config provided to the provider
  private _config?: UnleashConfig;

  // client is the Unleash client reference
  private _client?: UnleashClient;

  readonly runsOn = 'client';

  constructor(config: UnleashConfig, logger?: Logger) {
    this._config = config;
    this._logger = logger;
    this._client = new UnleashClient(config);
  }

  public get unleashClient() {
    return this._client;
  }

  async initialize(): Promise<void> {
    await this.initializeClient();
    this._logger?.info('UnleashWebProvider initialized');
  }

  private async initializeClient() {
    try {
      this.registerEventListeners();
      await this._client?.start();
    } catch (e) {
      throw new ProviderFatalError(getErrorMessage(e));
    }
  }

  private registerEventListeners() {
    this._client?.on('ready', () => {
      this._logger?.info('Unleash ready event received');
      this.events.emit(ProviderEvents.Ready, {
        message: 'Ready',
      });
    });
    this._client?.on('update', () => {
      this._logger?.info('Unleash update event received');
      this.events.emit(ProviderEvents.ConfigurationChanged, {
        message: 'Flags changed',
      });
    });
    this._client?.on('error', () => {
      this._logger?.info('Unleash error event received');
      this.events.emit(ProviderEvents.Error, {
        message: 'Error',
      });
    });
    this._client?.on('recovered', () => {
      this._logger?.info('Unleash recovered event received');
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
    await this._client?.updateContext(Object.fromEntries(unleashContext));
    this._logger?.info('Unleash context updated');
  }

  async onClose() {
    this._logger?.info('closing Unleash client');
    this._client?.stop();
  }

  resolveBooleanEvaluation(flagKey: string): ResolutionDetails<boolean> {
    const resp = this._client?.isEnabled(flagKey);
    if (typeof resp === 'undefined') {
      throw new FlagNotFoundError();
    }
    return {
      value: resp,
    };
  }

  resolveStringEvaluation(flagKey: string, defaultValue: string): ResolutionDetails<string> {
    return this.evaluate(flagKey, defaultValue, 'string');
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number): ResolutionDetails<number> {
    return this.evaluate(flagKey, defaultValue, 'number');
  }

  resolveObjectEvaluation<U extends JsonValue>(flagKey: string, defaultValue: U): ResolutionDetails<U> {
    return this.evaluate(flagKey, defaultValue, 'object');
  }

  private throwTypeMismatchError(variant: string, variantType: string, flagType: string) {
    throw new TypeMismatchError(`Type of requested variant ${variant} is of type ${variantType} but requested flag type of ${flagType}`);
  }

  private evaluate<T>(flagKey: string, defaultValue: T, flagType: string): ResolutionDetails<T> {
    const evaluatedVariant = this._client?.getVariant(flagKey);
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
