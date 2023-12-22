import {
  EvaluationContext,
  FlagValue,
  JsonValue,
  Logger,
  OpenFeatureEventEmitter,
  Provider,
  ProviderEvents,
  ProviderMetadata,
  ProviderStatus,
  ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/web-sdk';
import { createFlagsmithInstance } from 'flagsmith';
import { FlagSource, IFlagsmith, IInitConfig } from 'flagsmith/types';
import { FlagType, typeFactory } from './type-factory';

export default class FlagsmithProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: FlagsmithProvider.name,
  };
  //The Flagsmith Client
  private _client: IFlagsmith;
  //The Open Feature logger to use
  private _logger?: Logger;
  //The status of the provider
  private _status = ProviderStatus.NOT_READY;
  //The configuration used for the Flagsmith SDK
  private _config: IInitConfig;
  // The Open Feature event emitter
  events = new OpenFeatureEventEmitter();

  constructor(config: IInitConfig, logger?: Logger) {
    this._logger = logger;
    this._client = createFlagsmithInstance();
    this._config = config;
  }

  get status() {
    return this._status;
  }

  set status(status: ProviderStatus) {
    this._status = status;
  }

  async initialize(context?: EvaluationContext) {
    await this._client
      .init({
        ...this._config,
        ...context,
        onChange: (previousFlags, params, loadingState) => {
          if (params.flagsChanged) {
            this.events.emit(ProviderEvents.ConfigurationChanged, {
              message: 'Flags changed',
            });
          }
        },
      })
      .then(() => {
        this.status = ProviderStatus.READY;
      })
      .catch((e) => {
        this.status = ProviderStatus.ERROR;
        this.errorHandler(e, 'Initialize');
      });
  }

  onContextChange(_: EvaluationContext, newContext: EvaluationContext) {
    this.events.emit(ProviderEvents.Stale, { message: 'Context Changed' });
    return this.initialize(newContext);
  }

  resolveBooleanEvaluation(flagKey: string) {
    return this.evaluate<boolean>(flagKey, 'boolean', false);
  }

  resolveStringEvaluation(flagKey: string, defaultValue: string) {
    return this.evaluate<string>(flagKey, 'string', defaultValue);
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number) {
    return this.evaluate<number>(flagKey, 'number', defaultValue);
  }

  resolveObjectEvaluation<T extends JsonValue>(flagKey: string, defaultValue: T) {
    return this.evaluate<T>(flagKey, 'object', defaultValue);
  }

  async onClose(): Promise<void> {
    this.status = ProviderStatus.NOT_READY;
  }

  /**
   * Based on Flagsmith's loading state, determine the Open Feature resolution reason
   * @private
   */
  private evaluate<T extends FlagValue>(flagKey: string, type: FlagType, defaultValue: T) {
    const value = typeFactory(
      type === 'boolean' ? this._client.hasFeature(flagKey) : this._client.getValue(flagKey),
      type,
    );
    return {
      value: (value === null ? defaultValue : value) as T,
      reason: this.parseReason(),
    } as ResolutionDetails<T>;
  }

  /**
   * Based on Flagsmith's loading state, determine the Open Feature resolution reason
   * @private
   */
  private parseReason() {
    switch (this._client.loadingState?.source) {
      case FlagSource.CACHE:
        return StandardResolutionReasons.CACHED;
      case FlagSource.NONE:
        return StandardResolutionReasons.STATIC;
      default:
        return StandardResolutionReasons.DEFAULT;
    }
  }

  /**
   * Handle any unexpected error from Flagsmith SDK calls
   * @param error - The error thrown
   * @private
   */
  private errorHandler(error: any, action: string) {
    let errorMessage = `Unknown error ${error}`;
    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error?.message) {
      this.events.emit(ProviderEvents.Error, {
        message: error.message,
      });
    }
    const fullError = `${this.metadata.name}: error invoking action ${action}. ${errorMessage}`;
    this._logger?.error(fullError);
    this.events.emit(ProviderEvents.Error, {
      message: error.message,
    });
  }

  public get flagsmithClient() {
    return this._client;
  }
}
