import type {
  EvaluationContext,
  Hook,
  JsonValue,
  Logger,
  Provider,
  ResolutionDetails,
  Tracking,
  TrackingEventDetails,
} from '@openfeature/server-sdk';
import { OpenFeatureEventEmitter } from '@openfeature/server-sdk';
import type { GoFeatureFlagProviderOptions } from './go-feature-flag-provider-options';
import type { IEvaluator } from './evaluator/evaluator';
import { InProcessEvaluator } from './evaluator/inprocess-evaluator';
import { GoFeatureFlagApi } from './service/api';
import { DataCollectorHook, EnrichEvaluationContextHook } from './hook';
import { EventPublisher } from './service/event-publisher';
import { getContextKind } from './helper/event-util';
import { DEFAULT_TARGETING_KEY } from './helper/constants';
import { EvaluationType, type TrackingEvent } from './model';
import { InvalidOptionsException } from './exception';
import { RemoteEvaluator } from './evaluator/remote-evaluator';

export class GoFeatureFlagProvider implements Provider, Tracking {
  metadata = {
    name: GoFeatureFlagProvider.name,
  };

  readonly runsOn = 'server';
  events = new OpenFeatureEventEmitter();
  hooks: Hook[] = [];

  /** The options for the provider. */
  private readonly options: GoFeatureFlagProviderOptions;
  /** The logger for the provider. */
  private readonly logger?: Logger;
  /** The evaluation service for the provider. */
  private readonly evaluator: IEvaluator;
  /** The event publisher for the provider. */
  private readonly eventPublisher: EventPublisher;

  constructor(options: GoFeatureFlagProviderOptions, logger?: Logger) {
    this.validateInputOptions(options);
    this.options = options;
    this.options.endpoint = this.options.endpoint?.replace(/\/+$/, '');
    this.logger = logger;
    const api = new GoFeatureFlagApi(options);
    this.evaluator = this.getEvaluator(options, api, logger);
    this.eventPublisher = new EventPublisher(api, options, logger);

    // Initialize hooks
    this.initializeHooks();
  }

  /** @inheritdoc */
  track(trackingEventName: string, context?: EvaluationContext, trackingEventDetails?: TrackingEventDetails): void {
    // Create a tracking event object
    const event: TrackingEvent = {
      kind: 'tracking',
      userKey: context?.targetingKey ?? DEFAULT_TARGETING_KEY,
      contextKind: getContextKind(context),
      key: trackingEventName,
      trackingEventDetails: trackingEventDetails ?? {},
      creationDate: Math.floor(Date.now() / 1000),
      evaluationContext: context ?? {},
    };
    this.eventPublisher.addEvent(event);
  }

  /** @inheritdoc */
  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.evaluator.evaluateBoolean(flagKey, defaultValue, context);
  }

  /** @inheritdoc */
  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.evaluator.evaluateString(flagKey, defaultValue, context);
  }

  /** @inheritdoc */
  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.evaluator.evaluateNumber(flagKey, defaultValue, context);
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    return this.evaluator.evaluateObject(flagKey, defaultValue, context);
  }

  /**
   * Start the provider and initialize the event publisher.
   */
  async initialize(): Promise<void> {
    try {
      this.evaluator && (await this.evaluator.initialize());
      this.eventPublisher && (await this.eventPublisher.start());
    } catch (error) {
      this.logger?.error('Failed to initialize the provider', error);
      throw error;
    }
  }

  /**
   * Dispose the provider and stop the event publisher.
   */
  async onClose(): Promise<void> {
    this.evaluator && (await this.evaluator.dispose());
    this.eventPublisher && (await this.eventPublisher.stop());
  }

  /**
   * Get the evaluator based on the evaluation type specified in the options.
   */
  private getEvaluator(options: GoFeatureFlagProviderOptions, api: GoFeatureFlagApi, logger?: Logger): IEvaluator {
    switch (options.evaluationType) {
      case EvaluationType.Remote:
        return new RemoteEvaluator(options, logger);
      default:
        return new InProcessEvaluator(options, api, this.events, logger);
    }
  }

  /**
   * Initialize the hooks for the provider.
   */
  private initializeHooks(): void {
    this.hooks.push(new DataCollectorHook(this.evaluator, this.eventPublisher));
    this.logger?.debug('Data collector hook initialized');
    if (this.options.exporterMetadata) {
      this.hooks.push(new EnrichEvaluationContextHook(this.options.exporterMetadata));
      this.logger?.debug('Enrich evaluation context hook initialized');
    }
  }

  /**
   * Validates the input options provided when creating the provider.
   * @param options Options used while creating the provider
   * @throws {InvalidOptionsException} if no options are provided, or we have a wrong configuration.
   */
  private validateInputOptions(options: GoFeatureFlagProviderOptions): void {
    if (!options) {
      throw new InvalidOptionsException('No options provided');
    }

    if (!options.endpoint || options.endpoint.trim() === '') {
      throw new InvalidOptionsException('endpoint is a mandatory field when initializing the provider');
    }

    try {
      const url = new URL(options.endpoint);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new InvalidOptionsException('endpoint must be a valid URL (http or https)');
      }
    } catch {
      throw new InvalidOptionsException('endpoint must be a valid URL (http or https)');
    }

    if (options.flagChangePollingIntervalMs !== undefined && options.flagChangePollingIntervalMs <= 0) {
      throw new InvalidOptionsException('flagChangePollingIntervalMs must be greater than zero');
    }

    if (options.timeout !== undefined && options.timeout <= 0) {
      throw new InvalidOptionsException('timeout must be greater than zero');
    }

    if (options.dataFlushInterval !== undefined && options.dataFlushInterval <= 0) {
      throw new InvalidOptionsException('dataFlushInterval must be greater than zero');
    }

    if (options.maxPendingEvents !== undefined && options.maxPendingEvents <= 0) {
      throw new InvalidOptionsException('maxPendingEvents must be greater than zero');
    }
  }
}
