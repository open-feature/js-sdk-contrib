import { Context, GrowthBook, InitOptions } from '@growthbook/growthbook';
import {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  OpenFeatureEventEmitter,
  GeneralError,
  ProviderEvents,
} from '@openfeature/server-sdk';
import isEmpty from 'lodash.isempty';
import translateResult from './translate-result';

export class GrowthbookProvider implements Provider {
  metadata = {
    name: GrowthbookProvider.name,
  };

  readonly runsOn = 'server';
  private _client?: GrowthBook;
  private readonly context: Context;
  private _initOptions?: InitOptions;
  public readonly events = new OpenFeatureEventEmitter();

  constructor(growthbookContext: Context, initOptions?: InitOptions) {
    this.context = growthbookContext;
    this._initOptions = initOptions;
  }

  private get client(): GrowthBook {
    if (!this._client) {
      throw new GeneralError('Provider is not initialized');
    }
    return this._client;
  }

  // the global context is passed to the initialization function
  async initialize(evalContext?: EvaluationContext): Promise<void> {
    // Use context to construct the instance to instantiate GrowthBook
    this._client = new GrowthBook(this.context);

    if (!isEmpty(evalContext)) {
      // Set attributes from the global provider context
      await this.client.setAttributes(evalContext);
    }

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
    if (!isEmpty(context)) {
      await this.client.setAttributes(context);
    }

    const res = this.client.evalFeature(flagKey);

    return translateResult(res, defaultValue);
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    if (!isEmpty(context)) {
      await this.client.setAttributes(context);
    }

    const res = this.client.evalFeature(flagKey);

    return translateResult(res, defaultValue);
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    if (!isEmpty(context)) {
      await this.client.setAttributes(context);
    }

    const res = this.client.evalFeature(flagKey);

    return translateResult(res, defaultValue);
  }

  async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    if (!isEmpty(context)) {
      await this.client.setAttributes(context);
    }

    const res = this.client.evalFeature(flagKey);

    return translateResult(res, defaultValue);
  }
}
