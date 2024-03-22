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
  ResolutionReason,
  StandardResolutionReasons,
} from '@openfeature/web-sdk';
import { createFlagsmithInstance } from 'flagsmith/isomorphic';
import { FlagSource, IFlagsmith, IInitConfig, IState } from 'flagsmith/types';
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

  constructor({
    logger,
    flagsmithInstance,
    ...config
  }: Omit<IInitConfig, 'identity' | 'traits'> & { logger?: Logger; flagsmithInstance?: IFlagsmith }) {
    this._logger = logger;
    this._client = flagsmithInstance || createFlagsmithInstance();
    this._config = config;
  }

  get status() {
    return this._status;
  }

  set status(status: ProviderStatus) {
    this._status = status;
  }

  async initialize(context?: EvaluationContext & Partial<IState>) {
    const identity = context?.targetingKey;
    if (this._client?.initialised) {
      //Already initialised, set the state based on the new context, allow certain context props to be optional
      const defaultState = { ...this._client.getState(), identity: undefined, traits: {} };
      this._client.identity = identity;
      this._client.setState({
        ...defaultState,
        ...(context || {}),
      });
      this._status = ProviderStatus.STALE;
      this.events.emit(ProviderEvents.Stale, { message: 'context has changed' });
      return this._client.getFlags();
    }

    return this._client.init({
      ...this._config,
      ...context,
      identity,
      onChange: (previousFlags, params, loadingState) => {
        this.status = ProviderStatus.READY;
        if (params.flagsChanged) {
          this.events.emit(ProviderEvents.ConfigurationChanged, {
            message: 'Flags changed',
          });
        }
      },
      onError: (error) => {
        this.status = ProviderStatus.ERROR;
        this.errorHandler(error, 'Initialize');
      },
    });
  }

  onContextChange(oldContext: EvaluationContext, newContext: EvaluationContext & Partial<IState>) {
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
      value: (typeof value !== type ? defaultValue : value) as T,
      reason: this.parseReason(value, type),
    } as ResolutionDetails<T>;
  }

  /**
   * Based on Flagsmith's loading state and feature resolution, determine the Open Feature resolution reason
   * @private
   */
  private parseReason(value: any, type: FlagType): ResolutionReason {
    if (value === undefined) {
      return 'DEFAULT';
    }

    if (typeof value !== type) {
      return 'ERROR';
    }

    switch (this._client.loadingState?.source) {
      case 'CACHE':
        return 'CACHED';
      case 'DEFAULT_FLAGS':
        return 'DEFAULT';
      default:
        return 'STATIC';
    }
  }

  /**
   * Handle any unexpected error from Flagsmith SDK calls
   * @param error - The error thrown
   * @private
   */
  private errorHandler(error: any, action: string) {
    let errorMessage = `Unknown error ${error}`;
    Object.getOwnPropertyNames(error);
    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error?.message) {
      errorMessage = error.message;
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
