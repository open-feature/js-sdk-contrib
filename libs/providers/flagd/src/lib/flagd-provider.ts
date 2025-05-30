import type { EvaluationContext, JsonValue, Logger, Provider, ResolutionDetails } from '@openfeature/server-sdk';
import { OpenFeatureEventEmitter, ProviderEvents } from '@openfeature/server-sdk';
import type { FlagdProviderOptions } from './configuration';
import { getConfig } from './configuration';
import { GRPCService } from './service/grpc/grpc-service';
import type { Service } from './service/service';
import { InProcessService } from './service/in-process/in-process-service';

export class FlagdProvider implements Provider {
  metadata = {
    name: 'flagd',
  };

  readonly runsOn = 'server';
  readonly events = new OpenFeatureEventEmitter();

  private readonly _service: Service;

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

    this._service = service
      ? service
      : config.resolverType === 'in-process'
        ? new InProcessService(config, undefined, logger)
        : new GRPCService(config, undefined, logger);
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
    this.events.emit(ProviderEvents.Ready);
  }

  private handleError(message: string): void {
    this.events.emit(ProviderEvents.Error, { message });
  }

  private handleChanged(flagsChanged: string[]): void {
    this.events.emit(ProviderEvents.ConfigurationChanged, { flagsChanged });
  }
}
