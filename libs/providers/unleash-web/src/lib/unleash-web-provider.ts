import { EvaluationContext, Provider, Logger, JsonValue, FlagNotFoundError, OpenFeatureEventEmitter, ProviderEvents, ResolutionDetails, ProviderFatalError, StandardResolutionReasons } from '@openfeature/web-sdk';
import { UnleashClient, IConfig, IContext, IMutableContext } from 'unleash-proxy-client';
import { UnleashOptions, UnleashContextOptions } from './options';

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

  hooks = [];

  constructor(options: UnleashOptions, logger?: Logger) {
    this._options = options;
    this._logger = logger;
    // TODO map all available options to unleash config - done minimum for now
    let config : IConfig = {
      url: options.url,
      clientKey: options.clientKey,
      appName: options.appName,
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
      this._client?.start();
      return new Promise<void>((resolve) => {
            this._client?.on('ready', () => {
              this._logger?.info('Unleash ready event received');
              resolve();
            });
      });
    } catch (e) {
      throw new ProviderFatalError(getErrorMessage(e));
    }
  }

  private registerEventListeners() {
    this._client?.on('update', () => {
      this._logger?.info('Unleash update event received');
      this.events.emit(ProviderEvents.ConfigurationChanged, {
        message: 'Flags changed'
      });
    });
  }

  async onContextChange(_oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    this._logger?.info("onContextChange = " + JSON.stringify(newContext));
    let unleashContext = new Map();
    let properties = new Map();
    Object.keys(newContext).forEach((key) => {
      this._logger?.info(key + " = " + newContext[key]);
      switch(key) {
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

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean): ResolutionDetails<boolean> {
    const resp = this._client?.isEnabled(flagKey);
    this._logger?.debug("resp = " + resp);
    if (typeof resp === 'undefined') {
      throw new FlagNotFoundError();
    }
    var message = resp ? ' is enabled' : ' is disabled';
    this._logger?.debug(flagKey + message);
    return {
      value: resp
    }
  }

  resolveStringEvaluation(flagKey: string, defaultValue: string): ResolutionDetails<string> {
    return this.evaluate(flagKey, defaultValue);
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number): ResolutionDetails<number> {
    return this.evaluate(flagKey, defaultValue);
  }

  resolveObjectEvaluation<U extends JsonValue>(flagKey: string, defaultValue: U): ResolutionDetails<U> {
    return this.evaluate(flagKey, defaultValue);
  }

  private evaluate<T>(flagKey: string, defaultValue: T): ResolutionDetails<T> {
    const evaluatedVariant = this._client?.getVariant(flagKey);
    let retValue;
    let retVariant
    this._logger?.debug("evaluatedVariant = " + JSON.stringify(evaluatedVariant));
    if (typeof evaluatedVariant === 'undefined') {
      throw new FlagNotFoundError();
    }
    if (evaluatedVariant.name === 'disabled') {
      retValue = defaultValue as T;
    }
    else {
      retVariant = evaluatedVariant.name;
      retValue = evaluatedVariant.payload?.value;
    }
    return {
      variant: retVariant,
      value: retValue as T,
    };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
