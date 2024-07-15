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
import {
  getClient,
  IConfig,
  IConfigCatClient,
  IConfigCatClientSnapshot,
  OptionsForPollingMode,
  PollingMode,
} from 'configcat-js-ssr';

export class ConfigCatWebProvider implements Provider {
  public readonly events = new OpenFeatureEventEmitter();
  private readonly _sdkKey: string;
  private readonly _configCatOptions: OptionsForPollingMode<PollingMode.AutoPoll>;
  private _client?: IConfigCatClient;
  private _clientSnapshot?: IConfigCatClientSnapshot;

  public runsOn: Paradigm = 'client';

  public metadata = {
    name: ConfigCatWebProvider.name,
  };

  constructor(sdkKey: string, options?: OptionsForPollingMode<PollingMode.AutoPoll>) {
    this._sdkKey = sdkKey;
    // Let's create a shallow copy to not mess up caller's options object in `initialize()`.
    this._configCatOptions = options ? { ...options } : {};
  }

  public static create(sdkKey: string, options: OptionsForPollingMode<PollingMode.AutoPoll> = {}) {
    return new ConfigCatWebProvider(sdkKey, options);
  }

  public async initialize(): Promise<void> {
    const options = this._configCatOptions;
    const oldSetupHooks = options.setupHooks;

    options.setupHooks = (hooks) => {
      oldSetupHooks?.(hooks);


      hooks.on('configChanged', (projectConfig: IConfig | undefined) => {
        this.events.emit(ProviderEvents.ConfigurationChanged, {
          flagsChanged: projectConfig ? Object.keys(projectConfig.settings) : undefined,
        });

        if (this._client) {
          this._clientSnapshot = this._client.snapshot();
        }
      });

      hooks.on('clientError', (message: string, error) => {
        this.events.emit(ProviderEvents.Error, {
          message: message,
          metadata: error,
        });
      });
    };

    const client = getClient(this._sdkKey, PollingMode.AutoPoll, this._configCatOptions);
    await client.waitForReady();

    this._client = client;
    this._clientSnapshot = client.snapshot();
    this.events.emit(ProviderEvents.Ready);
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
    if (!this._clientSnapshot) {
      throw new ProviderNotReadyError('Provider is not initialized');
    }

    const { value, ...evaluationData } = this._clientSnapshot.getValueDetails(
      flagKey,
      undefined,
      transformContext(context),
    );

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
