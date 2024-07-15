import {
  EvaluationContext,
  JsonValue,
  OpenFeatureEventEmitter,
  Provider,
  ProviderEvents,
  ResolutionDetails,
  ProviderNotReadyError,
  TypeMismatchError,
  FlagNotFoundError,
  ParseError,
} from '@openfeature/server-sdk';
import {
  isType,
  PrimitiveType,
  PrimitiveTypeName,
  toResolutionDetails,
  transformContext,
} from '@openfeature/config-cat-core';
import { getClient, IConfig, IConfigCatClient, OptionsForPollingMode } from 'configcat-js-ssr';
import { Paradigm } from '@openfeature/web-sdk';
import { PollingMode } from 'configcat-common';

export class ConfigCatProvider implements Provider {
  public readonly events = new OpenFeatureEventEmitter();
  private readonly _sdkKey: string;
  private readonly _pollingMode?: TMode;
  private readonly _configCatOptions?: OptionsForPollingMode<TMode>;
  private _client?: IConfigCatClient;

  public runsOn: Paradigm = 'server';

  public metadata = {
    name: ConfigCatProvider.name,
  };

  constructor(sdkKey: string, pollingMode?: TMode, options?: OptionsForPollingMode<TMode>) {
    this._sdkKey = sdkKey;
    this._pollingMode = pollingMode;
    this._configCatOptions = options;
  }

  public static create<TMode extends PollingMode>(
    sdkKey: string,
    pollingMode?: TMode,
    options?: OptionsForPollingMode<TMode>,
  ): ConfigCatProvider<TMode> {
    return new ConfigCatProvider(sdkKey, pollingMode, options);
  }

  public async initialize(): Promise<void> {
    const options = this._configCatOptions ?? ({} as OptionsForPollingMode<TMode>);
    const oldSetupHooks = this._configCatOptions?.setupHooks;

    options.setupHooks = (hooks) => {
      oldSetupHooks?.(hooks);

      hooks.on('clientReady', () => {
        this.events.emit(ProviderEvents.Ready);
      });

      hooks.on('configChanged', (projectConfig: IConfig | undefined) =>
        this.events.emit(ProviderEvents.ConfigurationChanged, {
          flagsChanged: projectConfig ? Object.keys(projectConfig.settings) : undefined,
        }),
      );

      hooks.on('clientError', (message: string, error) => {
        this.events.emit(ProviderEvents.Error, {
          message: message,
          metadata: error,
        });
      });
    };

    const client = getClient(this._sdkKey, this._pollingMode, this._configCatOptions);
    await client.waitForReady();
    this._client = client;
  }

  public get configCatClient() {
    return this._client;
  }

  public async onClose(): Promise<void> {
    this._client?.dispose();
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.evaluate(flagKey, 'boolean', context);
  }

  public async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.evaluate(flagKey, 'string', context);
  }

  public async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.evaluate(flagKey, 'number', context);
  }

  public async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    const objectValue = await this.evaluate(flagKey, 'object', context);
    return objectValue as ResolutionDetails<U>;
  }

  protected async evaluate<T extends PrimitiveTypeName>(
    flagKey: string,
    flagType: T,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<PrimitiveType<T>>> {
    if (!this._client) {
      throw new ProviderNotReadyError('Provider is not initialized');
    }

    const { value, ...evaluationData } = await this._client.getValueDetailsAsync(
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
