import type {
  EvaluationContext,
  FlagValue,
  JsonValue,
  Logger,
  Provider,
  ProviderMetadata,
  ResolutionDetails,
  ResolutionReason,
} from '@openfeature/web-sdk';
import { OpenFeatureEventEmitter, ProviderEvents, TypeMismatchError } from '@openfeature/web-sdk';
import { createFlagsmithInstance } from 'flagsmith';
import type { ClientEvaluationContext, IFlagsmith, IInitConfig, IState, ITraits } from 'flagsmith/types';
import type { FlagType } from './type-factory';
import { typeFactory } from './type-factory';

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

  resolveBooleanEvaluation(flagKey: string) {
    return this.evaluate<boolean>(flagKey, 'boolean', false);
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
   * Based on Flagsmith's state, return flag metadata
   * @private
   */
  private getMetadata() {
    return {
      targetingKey: this._client.getContext()?.identity?.identifier || '',
      ...(this._client.getAllTraits() || {}),
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
        apiKey: this._config.environmentID,
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

  /**
   * Based on Flagsmith's loading state, determine the Open Feature resolution reason
   * @private
   */
  private evaluate<T extends FlagValue>(flagKey: string, type: FlagType, defaultValue: T) {
    const value = typeFactory(
      type === 'boolean' ? this._client.hasFeature(flagKey) : this._client.getValue(flagKey),
      type,
    );
    if (typeof value !== 'undefined' && typeof value !== type) {
      throw new TypeMismatchError(`flag key ${flagKey} is not of type ${type}`);
    }

    return {
      value: (typeof value !== type ? defaultValue : value) as T,
      reason: this.parseReason(value),
    } as ResolutionDetails<T>;
  }

  /**
   * Based on Flagsmith's loading state and feature resolution, determine the Open Feature resolution reason
   * @private
   */
  private parseReason(value: unknown): ResolutionReason {
    if (value === undefined) {
      return 'DEFAULT';
    }

    switch (this._client.loadingState?.source) {
      case 'CACHE':
        return 'CACHED';
      case 'DEFAULT_FLAGS':
        return 'DEFAULT';
      default:
        return 'STATIC';
    }
  }

  public get flagsmithClient() {
    return this._client;
  }
}
