import { NOTIFICATION_TYPES, OptimizelyDecideOption, type Client, type EventTags } from '@optimizely/optimizely-sdk';
import {
  FlagNotFoundError,
  GeneralError,
  OpenFeatureEventEmitter,
  ProviderEvents,
  ProviderNotReadyError,
  type EvaluationContext,
  type JsonValue,
  type Logger,
  type Provider,
  type ResolutionDetails,
  type TrackingEventDetails,
} from '@openfeature/server-sdk';
import { transformContext } from './context-transformer';
import { translateDecision, type EvaluationValueType } from './decision-translator';

export interface OptimizelyProviderOptions {
  /** Close the supplied Optimizely client when the provider is closed. Defaults to false. */
  closeClientOnShutdown?: boolean;
  /** Options applied to every Optimizely flag decision. */
  decideOptions?: OptimizelyDecideOption[];
}

const NOOP_LOGGER: Logger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
};

export class OptimizelyProvider implements Provider {
  readonly metadata = {
    name: OptimizelyProvider.name,
  };

  readonly runsOn = 'server';
  readonly hooks = [];
  readonly events = new OpenFeatureEventEmitter();

  private readonly closeClientOnShutdown: boolean;
  private readonly decideOptions: OptimizelyDecideOption[];
  private configUpdateListenerId?: number;
  private initialized = false;
  private initializationPromise?: Promise<void>;
  private closePromise?: Promise<void>;

  constructor(
    private readonly client: Client,
    options: OptimizelyProviderOptions = {},
  ) {
    if (options.decideOptions?.includes(OptimizelyDecideOption.EXCLUDE_VARIABLES)) {
      throw new TypeError('EXCLUDE_VARIABLES is incompatible with OpenFeature value resolution.');
    }

    this.closeClientOnShutdown = options.closeClientOnShutdown ?? false;
    this.decideOptions = [...(options.decideOptions ?? [])];
  }

  initialize(): Promise<void> {
    if (this.closePromise) {
      return Promise.reject(new ProviderNotReadyError('The Optimizely provider is closing or has been closed.'));
    }
    if (this.initialized) {
      return Promise.resolve();
    }

    this.initializationPromise ??= this.initializeClient().catch((error) => {
      this.initializationPromise = undefined;
      throw error;
    });
    return this.initializationPromise;
  }

  private async initializeClient(): Promise<void> {
    try {
      await this.client.onReady();
    } catch (error) {
      throw new GeneralError(`Optimizely client initialization failed: ${errorMessage(error)}`);
    }

    const listenerId = this.client.notificationCenter.addNotificationListener(
      NOTIFICATION_TYPES.OPTIMIZELY_CONFIG_UPDATE,
      () => this.events.emit(ProviderEvents.ConfigurationChanged),
    );
    if (listenerId < 1) {
      throw new GeneralError('Unable to register the Optimizely configuration update listener.');
    }

    this.configUpdateListenerId = listenerId;
    this.initialized = true;
  }

  onClose(): Promise<void> {
    this.closePromise ??= this.close();
    return this.closePromise;
  }

  resolveBooleanEvaluation(
    flagKey: string,
    _defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    return this.evaluate(flagKey, context, logger, 'boolean');
  }

  resolveStringEvaluation(
    flagKey: string,
    _defaultValue: string,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    return this.evaluate(flagKey, context, logger, 'string');
  }

  resolveNumberEvaluation(
    flagKey: string,
    _defaultValue: number,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    return this.evaluate(flagKey, context, logger, 'number');
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    _defaultValue: T,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    return this.evaluate(flagKey, context, logger, 'object');
  }

  track(trackingEventName: string, context: EvaluationContext, details: TrackingEventDetails): void {
    this.assertReady();
    const { userId, attributes } = transformContext(context, NOOP_LOGGER);
    const revenue = details['revenue'];
    const hasOptimizelyRevenue = typeof revenue === 'number' && Number.isInteger(revenue);
    const eventProperties = Object.fromEntries(
      Object.entries(details).filter(([key]) => key !== 'value' && !(key === 'revenue' && hasOptimizelyRevenue)),
    );
    const eventTags: EventTags = {
      ...(typeof details.value === 'number' ? { value: details.value } : {}),
      ...(hasOptimizelyRevenue ? { revenue } : {}),
      ...(Object.keys(eventProperties).length > 0 ? { $opt_event_properties: eventProperties } : {}),
    };

    this.client
      .createUserContext(userId, attributes)
      .trackEvent(trackingEventName, Object.keys(eventTags).length > 0 ? eventTags : undefined);
  }

  private async evaluate<T extends JsonValue>(
    flagKey: string,
    context: EvaluationContext,
    logger: Logger,
    valueType: EvaluationValueType,
  ): Promise<ResolutionDetails<T>> {
    this.assertReady();
    const config = this.client.getOptimizelyConfig();
    if (config === null) {
      throw new ProviderNotReadyError('The Optimizely configuration is not available.');
    }
    if (!Object.hasOwn(config.featuresMap, flagKey)) {
      throw new FlagNotFoundError(`Optimizely flag '${flagKey}' was not found.`);
    }

    const { userId, attributes } = transformContext(context, logger);
    const decision = await this.client
      .createUserContext(userId, attributes)
      .decideAsync(flagKey, [...this.decideOptions]);
    return translateDecision<T>(decision, valueType);
  }

  private assertReady(): void {
    if (!this.initialized || this.closePromise) {
      throw new ProviderNotReadyError('The Optimizely provider has not been initialized.');
    }
  }

  private async close(): Promise<void> {
    try {
      await this.initializationPromise;
    } catch {
      // Initialization errors are surfaced to the caller that initiated setup.
    }

    if (this.configUpdateListenerId !== undefined) {
      this.client.notificationCenter.removeNotificationListener(this.configUpdateListenerId);
      this.configUpdateListenerId = undefined;
    }
    this.initialized = false;

    if (this.closeClientOnShutdown) {
      await this.client.close();
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
