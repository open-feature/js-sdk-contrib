import type { EvaluationContext, JsonValue, Provider, ResolutionDetails, Paradigm } from '@openfeature/server-sdk';
import {
  OpenFeatureEventEmitter,
  ProviderEvents,
  ProviderNotReadyError,
  TypeMismatchError,
  ParseError,
} from '@openfeature/server-sdk';
import type { PrimitiveType, PrimitiveTypeName } from '@openfeature/config-cat-core';
import { isType, parseError, toResolutionDetails, transformContext } from '@openfeature/config-cat-core';
import type { SettingValue } from 'configcat-common';
import { ClientCacheState, PollingMode } from 'configcat-common';
import type { IConfigCatClient, IConfig, OptionsForPollingMode } from 'configcat-node';
import { getClient } from 'configcat-node';

export class ConfigCatProvider implements Provider {
  public readonly events = new OpenFeatureEventEmitter();
  private readonly _clientFactory: (provider: ConfigCatProvider) => IConfigCatClient;
  private readonly _pollingMode: PollingMode;
  private _isProviderReady = false;
  private _client?: IConfigCatClient;

  public runsOn: Paradigm = 'server';

  public metadata = {
    name: ConfigCatProvider.name,
  };

  protected constructor(clientFactory: (provider: ConfigCatProvider) => IConfigCatClient, pollingMode: PollingMode) {
    this._clientFactory = clientFactory;
    this._pollingMode = pollingMode;
  }

  public static create<TMode extends PollingMode>(
    sdkKey: string,
    pollingMode?: TMode,
    options?: OptionsForPollingMode<TMode>,
  ): ConfigCatProvider {
    // Let's create a shallow copy to not mess up caller's options object.
    options = options ? { ...options } : ({} as OptionsForPollingMode<TMode>);
    return new ConfigCatProvider((provider) => {
      const oldSetupHooks = options?.setupHooks;

      options.setupHooks = (hooks) => {
        oldSetupHooks?.(hooks);

        hooks.on('configChanged', (config: IConfig) =>
          provider.events.emit(ProviderEvents.ConfigurationChanged, {
            flagsChanged: Object.keys(config.settings),
          }),
        );
      };

      return getClient(sdkKey, pollingMode, options);
    }, pollingMode ?? PollingMode.AutoPoll);
  }

  public async initialize(): Promise<void> {
    const client = this._clientFactory(this);
    const clientCacheState = await client.waitForReady();
    this._client = client;

    if (this._pollingMode !== PollingMode.AutoPoll || clientCacheState !== ClientCacheState.NoFlagData) {
      this._isProviderReady = true;
    } else {
      // OpenFeature provider defines ready state like this: "The provider is ready to resolve flags."
      // However, ConfigCat client's behavior is different: in some cases ready state may be reached
      // even if the client's internal, in-memory cache hasn't been populated yet, that is,
      // the client is not able to evaluate feature flags yet. In such cases we throw an error to
      // prevent the provider from being set ready right away, and check for the ready state later.
      throw Error('The underlying ConfigCat client could not initialize within maxInitWaitTimeSeconds.');
    }
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
    return this.evaluate(flagKey, 'boolean', defaultValue, context);
  }

  public async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.evaluate(flagKey, 'string', defaultValue, context);
  }

  public async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.evaluate(flagKey, 'number', defaultValue, context);
  }

  public async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    const objectValue = await this.evaluate(flagKey, 'object', defaultValue, context);
    return objectValue as ResolutionDetails<U>;
  }

  protected async evaluate<T extends PrimitiveTypeName>(
    flagKey: string,
    flagType: T,
    defaultValue: PrimitiveType<T>,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<PrimitiveType<T>>> {
    if (!this._client) {
      throw new ProviderNotReadyError('Provider is not initialized');
    }

    // Make sure that the user-provided `defaultValue` is compatible with `flagType` as there is
    // no guarantee that it actually is. (User may bypass type checking or may not use TypeScript at all.)
    if (!isType(flagType, defaultValue)) {
      throw new TypeMismatchError();
    }

    const configCatDefaultValue = flagType !== 'object' ? (defaultValue as SettingValue) : JSON.stringify(defaultValue);

    const { value, ...evaluationData } = await this._client.getValueDetailsAsync(
      flagKey,
      configCatDefaultValue,
      transformContext(context),
    );

    if (!this._isProviderReady && this._client.snapshot().cacheState !== ClientCacheState.NoFlagData) {
      // Ideally, we would check ConfigCat client's initialization state in its "background" polling loop.
      // This is not possible at the moment, so as a workaround, we do the check on feature flag evaluation.
      // There are plans to improve this situation, so let's revise this
      // as soon as ConfigCat SDK implements the necessary event.

      this._isProviderReady = true;
      setTimeout(() => this.events.emit(ProviderEvents.Ready), 0);
    }

    if (evaluationData.isDefaultValue) {
      throw parseError(evaluationData.errorMessage);
    }

    if (flagType !== 'object') {
      // When `flagType` (more precisely, `configCatDefaultValue`) is boolean, string or number,
      // ConfigCat SDK guarantees that the returned `value` is compatible with `PrimitiveType<T>`.
      // See also: https://configcat.com/docs/sdk-reference/node/#setting-type-mapping
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
