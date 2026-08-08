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
import { OpenFeatureEventEmitter, ProviderFatalError } from '@openfeature/server-sdk';
import type { GoFeatureFlagProviderOptions } from './go-feature-flag-provider-options';
import type { IEvaluator } from './evaluator/evaluator';
import { InProcessEvaluator } from './evaluator/inprocess-evaluator';
import { GoFeatureFlagApi } from './service/api';
import { DataCollectorHook, EnrichEvaluationContextHook } from './hook';
import { EventPublisher } from './service/event-publisher';
import { getContextKind } from './helper/event-util';
import { DEFAULT_TARGETING_KEY } from './helper/constants';
import { validateUrlOption } from './helper/validate-url';
import { normalizeOptions } from './helper/normalize-options';
import { EvaluationType, type TrackingEvent } from './model';
import { InvalidOptionsException, UnauthorizedException } from './exception';
import { RemoteEvaluator } from './evaluator/remote-evaluator';

export class GoFeatureFlagProvider implements Provider, Tracking {
  metadata = {
    name: 'GO Feature Flag Provider',
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
    this.options = normalizeOptions(options);
    this.logger = logger;
    // Everything downstream takes the normalised copy. The old code got away with passing the
    // caller's object because it had already mutated it in place.
    const api = new GoFeatureFlagApi(this.options);
    this.evaluator = this.getEvaluator(this.options, api, logger);
    this.eventPublisher = new EventPublisher(api, this.options, logger);

    // Initialize hooks
    this.initializeHooks();
  }

  /** @inheritdoc */
  track(trackingEventName: string, context?: EvaluationContext, trackingEventDetails?: TrackingEventDetails): void {
    // Custom events are telemetry too. Honouring the option only for evaluations would leave a
    // caller who disabled data collection - for a privacy requirement, or because they run no
    // collector at all - still posting to `/v1/data/collector` on every `track` call.
    if (this.options.disableDataCollection) {
      return;
    }

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

      // Rejected credentials cannot be repaired by retrying, so this state has to be terminal.
      // The SDK only moves a provider to FATAL when the rejection carries the PROVIDER_FATAL error
      // code, and it short-circuits evaluations in that state; left as a plain exception the
      // provider would settle in ERROR, where evaluations keep reaching it and a permanently
      // invalid API key is indistinguishable from a relay proxy that is briefly unreachable.
      if (error instanceof UnauthorizedException) {
        throw new ProviderFatalError(error.message, { cause: error });
      }

      // Every other initialization failure stays recoverable, so the provider comes back on its
      // own once the relay proxy is reachable again.
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
        return new RemoteEvaluator(options, { logger, eventChannel: this.events });
      default:
        return new InProcessEvaluator(options, api, this.events, logger);
    }
  }

  /**
   * Initialize the hooks for the provider.
   */
  private initializeHooks(): void {
    // The order is normative. The SDK runs provider `before` stages in array order and `after`,
    // `error` and `finally` in reverse, so enrichment has to be registered first for the data
    // collector to observe an enriched context once it grows a `before` stage of its own.
    //
    // Registered unconditionally: the hook builds an empty `ExporterMetadata` when the caller
    // supplied none, and it is the only place the reserved `gofeatureflag` namespace is attached to
    // the evaluation context - so gating it on `exporterMetadata` left the default configuration,
    // which is the common one, with no namespace at all.
    this.hooks.push(new EnrichEvaluationContextHook(this.options.exporterMetadata));
    this.logger?.debug('Enrich evaluation context hook initialized');
    this.hooks.push(
      new DataCollectorHook(this.evaluator, this.eventPublisher, {
        disableDataCollection: this.options.disableDataCollection,
      }),
    );
    this.logger?.debug('Data collector hook initialized');
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

    // Both checks apply in remote mode too. Exempting it was what let OFREP_ENDPOINT supply the
    // endpoint instead, so the process environment could redirect evaluation traffic to a host the
    // caller never configured - and a malformed value was caught late, by the delegate, as a
    // generic Error rather than this provider's own InvalidOptionsException.
    if (!options.endpoint || options.endpoint.trim() === '') {
      throw new InvalidOptionsException('endpoint is a mandatory field when initializing the provider');
    }

    validateUrlOption('endpoint', options.endpoint);
    // Held to the same standard as `endpoint`: it replaces the whole base, so a malformed value
    // would otherwise surface much later as a failed flush rather than as a configuration error.
    if (options.dataCollectorBaseURL !== undefined) {
      validateUrlOption('dataCollectorBaseURL', options.dataCollectorBaseURL);
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

    // Finiteness is checked as well as the sign, and it is the whole point of the option rather
    // than pedantry: `Infinity > 0`, so it would pass a bare sign check and then make the buffer
    // cap `Infinity` - the unbounded growth during a collector outage that the cap exists to stop.
    if (
      options.maxPendingEvents !== undefined &&
      (!Number.isFinite(options.maxPendingEvents) || options.maxPendingEvents <= 0)
    ) {
      throw new InvalidOptionsException('maxPendingEvents must be a finite number greater than zero');
    }
  }
}
