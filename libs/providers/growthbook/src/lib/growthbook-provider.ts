import { ClientOptions, Context, GrowthBookClient, InitOptions } from '@growthbook/growthbook';
import {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  OpenFeatureEventEmitter,
  GeneralError,
  ProviderEvents,
} from '@openfeature/server-sdk';
import translateResult from './translate-result';

export class GrowthbookProvider implements Provider {
  metadata = {
    name: GrowthbookProvider.name,
  };

  readonly runsOn = 'server';
  private _client?: GrowthBookClient;
  private readonly context: ClientOptions;
  private _initOptions?: InitOptions;
  public readonly events = new OpenFeatureEventEmitter();

  constructor(growthbookContext: ClientOptions, initOptions?: InitOptions) {
    this.context = growthbookContext;
    this._initOptions = initOptions;
  }

  private get client(): GrowthBookClient {
    if (!this._client) {
      throw new GeneralError('Provider is not initialized');
    }
    return this._client;
  }

  // the global (or static) context is passed to the initialization function
  async initialize(evalContext?: EvaluationContext): Promise<void> {
    // Use context to construct the instance to instantiate GrowthBook
    const globalContext = {
      globalAttributes: { ...this.context.globalAttributes, ...evalContext },
    };
    this._client = new GrowthBookClient({ ...this.context, ...globalContext });

    await this.client.init(this._initOptions);

    // Monkey-patch the setPayload function to fire an event
    const setPayload = this._client.setPayload.bind(this._client);

    this._client.setPayload = async (...args) => {
      await setPayload(...args);
      this.events.emit(ProviderEvents.ConfigurationChanged);
    };
  }

  async onClose(): Promise<void> {
    return this.client.destroy();
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    const userContext = {
      attributes: context,
    };

    const res = this.client.evalFeature(flagKey, userContext);

    return translateResult(res, defaultValue);
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    const userContext = {
      attributes: context,
    };

    const res = this.client.evalFeature(flagKey, userContext);

    return translateResult(res, defaultValue);
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    const userContext = {
      attributes: context,
    };

    const res = this.client.evalFeature(flagKey, userContext);

    return translateResult(res, defaultValue);
  }

  async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    const userContext = {
      attributes: context,
    };

    const res = this.client.evalFeature(flagKey, userContext);

    return translateResult(res, defaultValue);
  }
}
