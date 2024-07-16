import {
  EvaluationContext,
  FlagNotFoundError,
  JsonValue,
  OpenFeatureEventEmitter,
  Paradigm,
  ParseError,
  Provider,
  ProviderEvents,
  ProviderNotReadyError,
  ResolutionDetails,
} from '@openfeature/web-sdk';
import { TypeMismatchError } from '@openfeature/core';
import {
  isType,
  PrimitiveType,
  PrimitiveTypeName,
  toResolutionDetails,
  transformContext,
} from '@openfeature/config-cat-core';
import { getClient, IConfig, IConfigCatClient, OptionsForPollingMode, PollingMode } from 'configcat-js-ssr';

export class ConfigCatWebProvider implements Provider {
  public readonly events = new OpenFeatureEventEmitter();
  private readonly _clientFactory: (provider: ConfigCatWebProvider) => IConfigCatClient;
  private _hasError = false;
  private _client?: IConfigCatClient;

  public runsOn: Paradigm = 'client';

  public metadata = {
    name: ConfigCatWebProvider.name,
  };

  protected constructor(clientFactory: (provider: ConfigCatWebProvider) => IConfigCatClient) {
    this._clientFactory = clientFactory;
  }

  public static create(sdkKey: string, options?: OptionsForPollingMode<PollingMode.AutoPoll>) {
    // Let's create a shallow copy to not mess up caller's options object.
    options = options ? { ...options } : {};

    return new ConfigCatWebProvider((provider) => {
      const oldSetupHooks = options?.setupHooks;

      options.setupHooks = (hooks) => {
        oldSetupHooks?.(hooks);

        hooks.on('configChanged', (projectConfig: IConfig | undefined) =>
          provider.events.emit(ProviderEvents.ConfigurationChanged, {
            flagsChanged: projectConfig ? Object.keys(projectConfig.settings) : undefined,
          }),
        );

        hooks.on('clientError', (message: string, error) => {
          provider._hasError = true;
          provider.events.emit(ProviderEvents.Error, {
            message: message,
            metadata: error,
          });
        });
      };

      return getClient(sdkKey, PollingMode.AutoPoll, options);
    });
  }

  public async initialize(): Promise<void> {
    const client = this._clientFactory(this);
    await client.waitForReady();
    this._client = client;
  }

  public get configCatClient() {
    return this._client;
  }

  public async onClose(): Promise<void> {
    this._client?.dispose();
  }

  public resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): ResolutionDetails<boolean> {
    return this.evaluate(flagKey, 'boolean', context);
  }

  public resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): ResolutionDetails<string> {
    return this.evaluate(flagKey, 'string', context);
  }

  public resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): ResolutionDetails<number> {
    return this.evaluate(flagKey, 'number', context);
  }

  public resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): ResolutionDetails<U> {
    const objectValue = this.evaluate(flagKey, 'object', context);
    return objectValue as ResolutionDetails<U>;
  }

  protected evaluate<T extends PrimitiveTypeName>(
    flagKey: string,
    flagType: T,
    context: EvaluationContext,
  ): ResolutionDetails<PrimitiveType<T>> {
    if (!this._client) {
      throw new ProviderNotReadyError('Provider is not initialized');
    }

    const { value, ...evaluationData } = this._client
      .snapshot()
      .getValueDetails(flagKey, undefined, transformContext(context));

    if (this._hasError && !evaluationData.errorMessage && !evaluationData.errorException) {
      this._hasError = false;
      this.events.emit(ProviderEvents.Ready);
    }

    if (typeof value === 'undefined') {
      throw new FlagNotFoundError();
    }

    if (flagType !== 'object') {
      return toResolutionDetails(flagType, value, evaluationData);
    }

    if (!isType('string', value)) {
      throw new TypeMismatchError();
    }

    let json: JsonValue;
    try {
      json = JSON.parse(value);
    } catch (e) {
      throw new ParseError(`Unable to parse "${value}" as JSON`);
    }

    return toResolutionDetails(flagType, json, evaluationData);
  }
}
