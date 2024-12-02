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
  StandardResolutionReasons
} from '@openfeature/web-sdk';
import {
  UnleashClient,
  IConfig,
  IContext,
  IMutableContext
} from 'unleash-proxy-client';
import {
  UnleashOptions,
  UnleashContextOptions
} from './options';

export class UnleashWebProvider implements Provider {
  metadata = {
    name: UnleashWebProvider.name,
  };

  public readonly events = new OpenFeatureEventEmitter();

  // logger is the OpenFeature logger to use
  private _logger?: Logger;

  // options is the Unleash options provided to the provider
  private _options?: UnleashOptions;

  // client is the Unleash client reference
  private _client?: UnleashClient;

  readonly runsOn = 'client';

  constructor(options: UnleashOptions, logger?: Logger) {
    this._options = options;
    this._logger = logger;
    // TODO map all available options to unleash config - done minimum for now
    let config : IConfig = {
      url: options.url,
      clientKey: options.clientKey,
      appName: options.appName,
      refreshInterval: options.refreshInterval,
    };
    this._client = new UnleashClient(config);
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
        message: 'Ready'
      });
    });
    this._client?.on('update', () => {
      this._logger?.info('Unleash update event received');
      this.events.emit(ProviderEvents.ConfigurationChanged, {
        message: 'Flags changed'
      });
    });
    this._client?.on('error', () => {
      this._logger?.info('Unleash error event received');
      this.events.emit(ProviderEvents.Error, {
        message: 'Error'
      });
    });
    this._client?.on('recovered', () => {
      this._logger?.info('Unleash recovered event received');
      this.events.emit(ProviderEvents.Ready, {
        message: 'Recovered'
      });
    });
  }

  async onContextChange(_oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    let unleashContext = new Map();
    let properties = new Map();
    Object.keys(newContext).forEach((key) => {
      switch (key) {
         case "appName":
         case "userId":
         case "environment":
         case "remoteAddress":
         case "sessionId":
         case "currentTime":
            unleashContext.set(key, newContext[key]);
            break;
         default:
            properties.set(key, newContext[key]);
            break;
      }
    });
    unleashContext.set('properties', properties);
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
      value: resp
    }
  }

  resolveStringEvaluation(flagKey: string, defaultValue: string): ResolutionDetails<string> {
    return this.evaluate(flagKey, defaultValue);
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number): ResolutionDetails<number> {
    let resolutionDetails = this.evaluate(flagKey, defaultValue);
    resolutionDetails.value = Number(resolutionDetails.value);
    return resolutionDetails;
  }

  resolveObjectEvaluation<U extends JsonValue>(flagKey: string, defaultValue: U): ResolutionDetails<U> {
    return this.evaluate(flagKey, defaultValue);
  }

  private evaluate<T>(flagKey: string, defaultValue: T): ResolutionDetails<T> {
    const evaluatedVariant = this._client?.getVariant(flagKey);
    let value;
    let variant
    this._logger?.debug("evaluatedVariant = " + JSON.stringify(evaluatedVariant));
    if (typeof evaluatedVariant === 'undefined') {
      throw new FlagNotFoundError();
    }

    if (evaluatedVariant.name === 'disabled') {
      value = defaultValue as T;
    }
    else {
      variant = evaluatedVariant.name;
      value = evaluatedVariant.payload?.value;
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
