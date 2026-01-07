import type { EvaluationContext, JsonValue, Logger, Provider, ResolutionDetails } from '@openfeature/server-sdk';
import { OpenFeatureEventEmitter, ProviderEvents } from '@openfeature/server-sdk';
import type { FlagdProviderOptions } from './configuration';
import { getConfig } from './configuration';
import { GRPCService } from './service/grpc/grpc-service';
import type { Service } from './service/service';
import { InProcessService } from './service/in-process/in-process-service';
import type { Hook } from '@openfeature/server-sdk';
import { SyncMetadataHook } from './SyncMetadataHook';
import { DEFAULT_RETRY_GRACE_PERIOD } from './constants';

export class FlagdProvider implements Provider {
  metadata = {
    name: 'flagd',
  };

  readonly hooks?: Hook[];
  readonly runsOn = 'server';
  readonly events = new OpenFeatureEventEmitter();
  private syncContext: EvaluationContext | null = null;

  private readonly _service: Service;
  private readonly _retryGracePeriod: number;
  private _errorTimer?: NodeJS.Timeout;
  private _isErrorState = false;

  /**
   * Construct a new flagd provider.
   *
   * @param options options, see {@link FlagdProviderOptions}
   * @param logger optional logger, see {@link Logger}
   * @param service optional internal service implementation, should not be needed for production
   */
  constructor(
    options?: FlagdProviderOptions,
    private readonly logger?: Logger,
    service?: Service,
  ) {
    const config = getConfig(options);
    this._retryGracePeriod = config.retryGracePeriod ?? DEFAULT_RETRY_GRACE_PERIOD;

    if (service === undefined) {
      if (config.resolverType === 'in-process') {
        this._service = new InProcessService(config, this.setSyncContext.bind(this), undefined, logger);

        if (config?.offlineFlagSourcePath === undefined) {
          this.hooks = [new SyncMetadataHook(() => config.contextEnricher(this.getSyncContext()))];
        }
      } else {
        this._service = new GRPCService(config, undefined, logger);
      }
    } else {
      this._service = service;
    }
  }

  setSyncContext(context: EvaluationContext) {
    this.syncContext = context;
  }

  getSyncContext(): EvaluationContext | null {
    return this.syncContext;
  }

  async initialize(): Promise<void> {
    try {
      await this._service.connect(
        this.handleReconnect.bind(this),
        this.handleChanged.bind(this),
        this.handleError.bind(this),
      );
      this.logger?.debug(`${this.metadata.name}: ready`);
    } catch (err) {
      this.logger?.error(`${this.metadata.name}: error during initialization: ${(err as Error)?.message}`);
      this.logger?.debug(err);
      throw err;
    }
  }

  onClose(): Promise<void> {
    this.logger?.debug(`${this.metadata.name}: shutting down`);
    this.clearErrorTimer();
    return this._service.disconnect();
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    transformedContext: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    return this._service.resolveBoolean(flagKey, defaultValue, transformedContext, logger);
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    transformedContext: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    return this._service.resolveString(flagKey, defaultValue, transformedContext, logger);
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    transformedContext: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    return this._service.resolveNumber(flagKey, defaultValue, transformedContext, logger);
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    transformedContext: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    return this._service.resolveObject<T>(flagKey, defaultValue, transformedContext, logger);
  }

  private handleReconnect(): void {
    this.clearErrorTimer();
    this._isErrorState = false;
    this.events.emit(ProviderEvents.Ready);
  }

  private handleError(message: string): void {
    if (this._isErrorState) {
      return;
    }

    this._isErrorState = true;
    this.events.emit(ProviderEvents.Stale, { message });

    if (this._errorTimer) {
      clearTimeout(this._errorTimer);
    }
    this._errorTimer = setTimeout(() => {
      if (this._isErrorState) {
        this.logger?.error(
          `${this.metadata.name}: not reconnected within ${this._retryGracePeriod}s grace period, emitting ERROR`,
        );
        this._service.clearCache();
        this.events.emit(ProviderEvents.Error, { message });
      }
      this._errorTimer = undefined;
    }, this._retryGracePeriod * 1000);
  }

  private handleChanged(flagsChanged: string[]): void {
    this.events.emit(ProviderEvents.ConfigurationChanged, { flagsChanged });
  }

  private clearErrorTimer(): void {
    if (this._errorTimer) {
      clearTimeout(this._errorTimer);
      this._errorTimer = undefined;
    }
  }
}
