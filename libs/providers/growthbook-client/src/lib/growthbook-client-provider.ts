import type { EvaluationContext, Provider, JsonValue, ResolutionDetails } from '@openfeature/web-sdk';
import { GeneralError, OpenFeatureEventEmitter, ProviderEvents } from '@openfeature/web-sdk';

import type { InitOptions, Context } from '@growthbook/growthbook';
import { GrowthBook } from '@growthbook/growthbook';
import isEmpty from 'lodash.isempty';
import translateResult from './translate-result';

export class GrowthbookClientProvider implements Provider {
  metadata = {
    name: GrowthbookClientProvider.name,
  };

  readonly runsOn = 'client';
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

  async onContextChange(oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    await this.client.setAttributes(newContext);
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean): ResolutionDetails<boolean> {
    const res = this.client.evalFeature(flagKey);

    return translateResult(res, defaultValue);
  }

  resolveStringEvaluation(flagKey: string, defaultValue: string): ResolutionDetails<string> {
    const res = this.client.evalFeature(flagKey);

    return translateResult(res, defaultValue);
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number): ResolutionDetails<number> {
    const res = this.client.evalFeature(flagKey);

    return translateResult(res, defaultValue);
  }

  resolveObjectEvaluation<U extends JsonValue>(flagKey: string, defaultValue: U): ResolutionDetails<U> {
    const res = this.client.evalFeature(flagKey);

    return translateResult(res, defaultValue);
  }
}
