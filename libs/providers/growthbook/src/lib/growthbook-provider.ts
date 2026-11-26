import type { ClientOptions, InitOptions } from '@growthbook/growthbook';
import { GrowthBookClient } from '@growthbook/growthbook';
import type {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  TrackingEventDetails,
} from '@openfeature/server-sdk';
import { OpenFeatureEventEmitter, GeneralError, ProviderEvents } from '@openfeature/server-sdk';
import translateResult from './translate-result';
import { toAttributes } from './context-mapper';

export class GrowthbookProvider implements Provider {
  metadata = {
    name: GrowthbookProvider.name,
  };

  readonly runsOn = 'server';
  private _client?: GrowthBookClient;
  private readonly options: ClientOptions;
  private _initOptions?: InitOptions;
  public readonly events = new OpenFeatureEventEmitter();

  constructor(growthbookOptions: ClientOptions, initOptions?: InitOptions) {
    this.options = growthbookOptions;
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
      globalAttributes: {
        ...this.options.globalAttributes,
        ...(evalContext ? toAttributes(evalContext) : {}),
      },
    };
    this._client = new GrowthBookClient({ ...this.options, ...globalContext });

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
      attributes: toAttributes(context),
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
      attributes: toAttributes(context),
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
      attributes: toAttributes(context),
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
      attributes: toAttributes(context),
    };

    const res = this.client.evalFeature(flagKey, userContext);

    return translateResult(res, defaultValue);
  }
  /**
   * Forward an OpenFeature tracking event to GrowthBook.
   *
   * The evaluation context becomes the GrowthBook user context, so the event is
   * attributed to the same user the flag evaluations are bucketed for.
   */
  track(trackingEventName: string, context: EvaluationContext, trackingEventDetails: TrackingEventDetails): void {
    this.client.logEvent(trackingEventName, trackingEventDetails, {
      attributes: toAttributes(context),
    });
  }
}
