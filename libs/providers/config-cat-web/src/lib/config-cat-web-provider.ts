import {
  EvaluationContext,
  JsonValue,
  OpenFeatureEventEmitter,
  Paradigm,
  ParseError,
  Provider,
  ProviderEvents,
  ProviderNotReadyError,
  ResolutionDetails,
  TypeMismatchError,
} from '@openfeature/web-sdk';
import {
  isType,
  parseError,
  PrimitiveType,
  PrimitiveTypeName,
  toResolutionDetails,
  transformContext,
} from '@openfeature/config-cat-core';
import {
  getClient,
  IConfig,
  IConfigCatClient,
  OptionsForPollingMode,
  PollingMode,
  SettingValue,
} from 'configcat-js-ssr';

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
    return this.evaluate(flagKey, 'boolean', defaultValue, context);
  }

  public resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): ResolutionDetails<string> {
    return this.evaluate(flagKey, 'string', defaultValue, context);
  }

  public resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): ResolutionDetails<number> {
    return this.evaluate(flagKey, 'number', defaultValue, context);
  }

  public resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): ResolutionDetails<U> {
    const objectValue = this.evaluate(flagKey, 'object', defaultValue, context);
    return objectValue as ResolutionDetails<U>;
  }

  protected evaluate<T extends PrimitiveTypeName>(
    flagKey: string,
    flagType: T,
    defaultValue: PrimitiveType<T>,
    context: EvaluationContext,
  ): ResolutionDetails<PrimitiveType<T>> {
    if (!this._client) {
      throw new ProviderNotReadyError('Provider is not initialized');
    }

    // Make sure that the user-provided `defaultValue` is compatible with `flagType` as there is
    // no guarantee that it actually is. (User may bypass type checking or may not use TypeScript at all.)
    if (!isType(flagType, defaultValue)) {
      throw new TypeMismatchError();
    }

    const configCatDefaultValue =
      typeof flagType !== 'object' ? (defaultValue as SettingValue) : JSON.stringify(defaultValue);

    const { value, ...evaluationData } = this._client
      .snapshot()
      .getValueDetails(flagKey, configCatDefaultValue, transformContext(context));

    if (this._hasError && !evaluationData.errorMessage && !evaluationData.errorException) {
      this._hasError = false;
      this.events.emit(ProviderEvents.Ready);
    }

    if (evaluationData.isDefaultValue) {
      throw parseError(evaluationData.errorMessage);
    }

    if (flagType !== 'object') {
      // When `flagType` (more precisely, `configCatDefaultValue`) is boolean, string or number,
      // ConfigCat SDK guarantees that the returned `value` is compatible with `PrimitiveType<T>`.
      // See also: https://configcat.com/docs/sdk-reference/js-ssr/#setting-type-mapping
      return toResolutionDetails(value as PrimitiveType<T>, evaluationData);
    }

    let json: JsonValue;
    try {
      // In this case we can be sure that `value` is string since `configCatDefaultValue` is string,
      // which means that ConfigCat SDK is guaranteed to return a string value.
      json = JSON.parse(value as string);
    } catch (e) {
      throw new ParseError(`Unable to parse "${value}" as JSON`);
    }

    return toResolutionDetails(json as PrimitiveType<T>, evaluationData);
  }
}
