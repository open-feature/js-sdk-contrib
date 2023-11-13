import {
  EvaluationContext,
  JsonValue,
  Logger,
  OpenFeatureEventEmitter,
  Provider,
  ProviderEvents,
  ProviderStatus,
  ResolutionDetails
} from '@openfeature/server-sdk';
import { FlagdProviderOptions, getConfig } from './configuration';
import { GRPCService } from './service/grpc/grpc-service';
import { Service } from './service/service';
import { InProcessService } from './service/in-process/in-process-service';

export class FlagdProvider implements Provider {
  metadata = {
    name: 'flagd Provider'
  };

  readonly runsOn = 'server';

  get status() {
    return this._status;
  }

  get events() {
    return this._events;
  }

  private readonly _service: Service;
  private _status = ProviderStatus.NOT_READY;
  private _events = new OpenFeatureEventEmitter();

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
    service?: Service
  ) {
    const config = getConfig(options);

    this._service = service ? service
      : (config.resolverType !== 'in-process' ? new InProcessService(config, undefined, logger)
        : new GRPCService(config, undefined, logger));
  }

  initialize(): Promise<void> {
    return this._service
      .connect(this.setReady.bind(this), this.emitChanged.bind(this), this.setError.bind(this))
      .then(() => {
        this.logger?.debug(`${this.metadata.name}: ready`);
        this._status = ProviderStatus.READY;
      })
      .catch((err) => {
        this._status = ProviderStatus.ERROR;
        this.logger?.error(`${this.metadata.name}: error during initialization: ${err.message}, ${err.stack}`);
        throw err;
      });
  }

  onClose(): Promise<void> {
    this.logger?.debug(`${this.metadata.name}: shutting down`);
    return this._service.disconnect();
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    transformedContext: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<boolean>> {
    return this._service
      .resolveBoolean(flagKey, defaultValue, transformedContext, logger)
      .catch((err) => this.logRejected(err, flagKey, logger));
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    transformedContext: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<string>> {
    return this._service
      .resolveString(flagKey, defaultValue, transformedContext, logger)
      .catch((err) => this.logRejected(err, flagKey, logger));
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    transformedContext: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<number>> {
    return this._service
      .resolveNumber(flagKey, defaultValue, transformedContext, logger)
      .catch((err) => this.logRejected(err, flagKey, logger));
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    transformedContext: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<T>> {
    return this._service
      .resolveObject<T>(flagKey, defaultValue, transformedContext, logger)
      .catch((err) => this.logRejected(err, flagKey, logger));
  }

  logRejected = (err: Error, flagKey: string, logger: Logger) => {
    logger.error(`Error resolving flag ${flagKey}: ${err?.message}`);
    logger.error(err?.stack);
    throw err;
  };

  private setReady(): void {
    this._status = ProviderStatus.READY;
  }

  private setError(): void {
    this._status = ProviderStatus.ERROR;
  }

  private emitChanged(flagsChanged: string[]): void {
    this._events.emit(ProviderEvents.ConfigurationChanged, { flagsChanged });
  }
}
