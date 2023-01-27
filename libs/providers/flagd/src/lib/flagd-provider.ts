import { EvaluationContext, JsonValue, Logger, Provider, ResolutionDetails } from '@openfeature/js-sdk';
import { FlagdProviderOptions, getConfig } from './configuration';
import { GRPCService } from './service/grpc/service';
import { Service } from './service/service';

export class FlagdProvider implements Provider {
  metadata = {
    name: 'flagd Provider',
  };

  private readonly _service: Service;

  /**
   * Promise indicating the gRPC stream is connected.
   *
   * Can be used in instances where the provider being connected to the event stream is a prerequisite
   * to execution (e.g. testing). Not necessary for standard usage.
   *
   * @returns true if stream connected successfully, false if connection not enabled.
   */
  get streamConnection() {
    return this._service.streamConnection;
  }

  constructor(options?: FlagdProviderOptions, service?: Service, private logger?: Logger) {
    this._service = service ? service : new GRPCService(getConfig(options), undefined, logger);
  }

  resolveBooleanEvaluation(
    flagKey: string,
    _: boolean,
    transformedContext: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<boolean>> {
    return this._service
      .resolveBoolean(flagKey, transformedContext, logger)
      .catch((err) => this.logRejected(err, flagKey, logger));
  }

  resolveStringEvaluation(
    flagKey: string,
    _: string,
    transformedContext: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<string>> {
    return this._service
      .resolveString(flagKey, transformedContext, logger)
      .catch((err) => this.logRejected(err, flagKey, logger));
  }

  resolveNumberEvaluation(
    flagKey: string,
    _: number,
    transformedContext: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<number>> {
    return this._service
      .resolveNumber(flagKey, transformedContext, logger)
      .catch((err) => this.logRejected(err, flagKey, logger));
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    _: T,
    transformedContext: EvaluationContext,
    logger: Logger
  ): Promise<ResolutionDetails<T>> {
    return this._service
      .resolveObject<T>(flagKey, transformedContext, logger)
      .catch((err) => this.logRejected(err, flagKey, logger));
  }

  logRejected = (err: Error, flagKey: string, logger: Logger) => {
    logger.error(`Error resolving flag ${flagKey}: ${err?.message}`);
    logger.error(err?.stack);
    throw err;
  };
}
