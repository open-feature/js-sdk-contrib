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
import { getClient, IConfig, IConfigCatClient } from 'configcat-js-ssr';
import { Paradigm } from '@openfeature/web-sdk';

export class ConfigCatProvider implements Provider {
  public readonly events = new OpenFeatureEventEmitter();
  private readonly _clientParameters: Parameters<typeof getClient>;
  private _client?: IConfigCatClient;

  public runsOn: Paradigm = 'server';

  public metadata = {
    name: ConfigCatProvider.name,
  };

  constructor(...params: Parameters<typeof getClient>) {
    this._clientParameters = params;
  }

  public static create(...params: Parameters<typeof getClient>) {
    return new ConfigCatProvider(...params);
  }

  public async initialize(): Promise<void> {
    const originalParameters = this._clientParameters;
    originalParameters[2] ??= {};

    const options = originalParameters[2];
    const oldSetupHooks = options.setupHooks;

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

    const client = getClient(...originalParameters);
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
