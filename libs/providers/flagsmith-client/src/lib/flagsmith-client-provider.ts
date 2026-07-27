import type {
  EvaluationContext,
  FlagMetadata,
  FlagValue,
  JsonValue,
  Logger,
  Provider,
  ProviderMetadata,
  ResolutionDetails,
  ResolutionReason,
  TrackingEventDetails,
} from '@openfeature/web-sdk';
import { OpenFeatureEventEmitter, ProviderEvents, TypeMismatchError } from '@openfeature/web-sdk';
import { createFlagsmithInstance } from '@flagsmith/flagsmith';
import type {
  ClientEvaluationContext,
  IFlagsmith,
  IFlagsmithFeature,
  IFlagsmithValue,
  IInitConfig,
  IState,
  ITraits,
} from '@flagsmith/flagsmith/types';
import type { FlagType } from './type-factory';
import { typeFactory } from './type-factory';
import { EXPOSURE_TRACKING_EVENT } from './tracking';

type OpenFeatureContext = EvaluationContext & Partial<IState>;

export class FlagsmithClientProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: FlagsmithClientProvider.name,
  };

  readonly runsOn = 'client';
  //The Flagsmith Client
  private _client: IFlagsmith;
  //The Open Feature logger to use
  private _logger?: Logger;
  //The configuration used for the Flagsmith SDK
  private _config: IInitConfig;
  // The Open Feature event emitter
  events = new OpenFeatureEventEmitter();

  constructor({
    logger,
    flagsmithInstance,
    ...config
  }: Omit<IInitConfig, 'identity' | 'traits'> & { logger?: Logger; flagsmithInstance?: IFlagsmith }) {
    this._logger = logger;
    this._client = flagsmithInstance || createFlagsmithInstance();
    this._config = config;
  }

  async initialize(context?: OpenFeatureContext) {
    const identity = context?.targetingKey;
    const evaluationContext: ClientEvaluationContext = this.mapContextToEvaluationContext(
      context,
      this._config.environmentID,
    );

    if (this._client?.initialised) {
      const isLogout = !!this._client.getContext().identity && !identity;
      this.events.emit(ProviderEvents.Stale, { message: 'context has changed' });

      return isLogout ? this._client.logout() : this._client.setContext(evaluationContext);
    }

    const serverState = this._config.state;
    if (serverState) {
      this._client.setState(serverState);
      this.events.emit(ProviderEvents.Ready, { message: 'flags provided by SSR state' });
    }
    if (!this._config.environmentID) {
      this.events.emit(ProviderEvents.Stale, { message: 'environmentID is required' });
    }

    return this._client.init({
      ...this._config,
      evaluationContext,
      onChange: (previousFlags, params, loadingState) => {
        const eventMeta = {
          metadata: this.getMetadata(),
          flagsChanged: params.flagsChanged,
        };
        this.events.emit(ProviderEvents.Ready, {
          message: 'Flags ready',
          ...eventMeta,
        });
        if (params.flagsChanged) {
          this.events.emit(ProviderEvents.ConfigurationChanged, {
            message: 'Flags changed',
            ...eventMeta,
          });
        }
        this._config.onChange?.(previousFlags, params, loadingState);
      },
    });
  }

  onContextChange(oldContext: OpenFeatureContext, newContext: OpenFeatureContext) {
    this.events.emit(ProviderEvents.Stale, { message: 'Context Changed' });
    return this.initialize(newContext);
  }

  async onClose() {
    this._client.stopListening();
    await this._client.flushEvents();
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean) {
    return this.evaluate<boolean>(flagKey, 'boolean', defaultValue);
  }

  resolveStringEvaluation(flagKey: string, defaultValue: string) {
    return this.evaluate<string>(flagKey, 'string', defaultValue);
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number) {
    return this.evaluate<number>(flagKey, 'number', defaultValue);
  }

  resolveObjectEvaluation<T extends JsonValue>(flagKey: string, defaultValue: T) {
    return this.evaluate<T>(flagKey, 'object', defaultValue);
  }

  /**
   * Route OpenFeature tracking events to Flagsmith.
   *
   * {@link EXPOSURE_TRACKING_EVENT} records a flag/variant exposure (skipped with a
   * log when the context has no targetingKey); any other name becomes a plain
   * Flagsmith event. No-op unless the client was initialized with `enableEvents`.
   *
   * @experimental Tracking is an experimental OpenFeature capability (spec §6).
   */
  track(trackingEventName: string, context: EvaluationContext, trackingEventDetails?: TrackingEventDetails): void {
    if (!this._client.eventsEnabled) {
      this._logger?.debug(`Flagsmith events are disabled; dropping tracking event "${trackingEventName}".`);
      return;
    }

    if (trackingEventName === EXPOSURE_TRACKING_EVENT) {
      const { flagKey, variant, ...metadata } = trackingEventDetails ?? {};
      delete metadata.value;
      if (typeof flagKey !== 'string') {
        this._logger?.warn(`"${EXPOSURE_TRACKING_EVENT}" requires a string details.flagKey; dropping exposure event.`);
        return;
      }
      const identifier = context.targetingKey;
      if (!identifier) {
        this._logger?.info(`Exposure for "${flagKey}" skipped: no targetingKey in the evaluation context.`);
        return;
      }
      if (typeof variant === 'string') {
        this._client.trackExposureEvent(flagKey, { identifier, value: variant, metadata });
      } else {
        if (Object.keys(metadata).length > 0) {
          this._logger?.debug(`Exposure for "${flagKey}": metadata is ignored when no variant is provided.`);
        }
        this._client.getExperimentFlag(flagKey);
      }
      return;
    }

    if (trackingEventName.startsWith('$')) {
      this._logger?.warn(
        `"${trackingEventName}" is a reserved Flagsmith event name; use "${EXPOSURE_TRACKING_EVENT}" to record exposures.`,
      );
      return;
    }

    const { value, ...metadata } = trackingEventDetails ?? {};
    this._client.trackEvent(trackingEventName, { value: value as IFlagsmithValue, metadata });
  }

  /**
   * Based on Flagsmith's state, return flag metadata
   * @private
   */
  private getMetadata() {
    return {
      targetingKey: this._client.getContext()?.identity?.identifier || '',
    };
  }

  /**
   * Map the Open Feature context to the Flagsmith evaluation context
   * @private
   */
  private mapContextToEvaluationContext(context?: OpenFeatureContext, environmentID?: string) {
    if (!context) {
      return {
        environment: {
          apiKey: environmentID,
        },
      };
    }

    const identity = context?.targetingKey;
    const traits = (context?.['traits'] as ITraits) || {};
    const hasTraits = Object.keys(traits).length > 0;
    const hasIdentifier = !!identity;

    const evaluationContext: ClientEvaluationContext = {
      environment: {
        apiKey: environmentID,
      },
      identity:
        hasIdentifier || hasTraits
          ? {
              ...(hasIdentifier && { identifier: identity }),
              ...(hasTraits && { traits }),
            }
          : undefined,
    };

    return evaluationContext;
  }

  private evaluate<T extends FlagValue>(flagKey: string, type: FlagType, defaultValue: T): ResolutionDetails<T> {
    const flag = this._client.getAllFlags()?.[this.normalizeFlagKey(flagKey)];
    if (!flag) {
      return { value: defaultValue, reason: 'DEFAULT' };
    }

    const value = typeFactory(
      type === 'boolean' ? this._client.hasFeature(flagKey) : this._client.getValue(flagKey),
      type,
    );
    if (typeof value !== 'undefined' && typeof value !== type) {
      throw new TypeMismatchError(`flag key ${flagKey} is not of type ${type}`);
    }

    const flagMetadata = this.buildFlagMetadata(flag);
    if (typeof value === 'undefined') {
      return {
        value: defaultValue,
        reason: flag.enabled ? 'DEFAULT' : 'DISABLED',
        flagMetadata,
      };
    }

    return {
      value: value as T,
      ...(flag.variant ? { variant: flag.variant } : {}),
      reason: this.parseReason(flag),
      flagMetadata,
    };
  }

  /**
   * Flagsmith normalizes flag keys on ingestion; apply the same normalization for lookups.
   * @private
   */
  private normalizeFlagKey(flagKey: string) {
    return flagKey.toLowerCase().replace(/ /g, '_');
  }

  /**
   * The `experiment.*` keys follow the OpenFeature vendor-council conventions and only
   * appear on multivariate flags; the arm is also exposed as ResolutionDetails.variant.
   * @private
   */
  private buildFlagMetadata(flag: IFlagsmithFeature): FlagMetadata {
    return {
      enabled: flag.enabled,
      ...(typeof flag.id === 'number' ? { featureId: flag.id } : {}),
      ...(flag.variant
        ? {
            'experiment.arm': flag.variant,
            'experiment.active': flag.enabled,
            'experiment.unit': 'user',
          }
        : {}),
    };
  }

  /**
   * Based on the flag state and Flagsmith's loading state, determine the Open Feature resolution reason
   * @private
   */
  private parseReason(flag: IFlagsmithFeature): ResolutionReason {
    if (!flag.enabled) {
      return 'DISABLED';
    }

    switch (this._client.loadingState?.source) {
      case 'CACHE':
        return 'CACHED';
      case 'DEFAULT_FLAGS':
        return 'DEFAULT';
      case 'SERVER':
        return this._client.getContext().identity?.identifier ? 'TARGETING_MATCH' : 'STATIC';
      default:
        return 'STATIC';
    }
  }

  public get flagsmithClient() {
    return this._client;
  }
}
