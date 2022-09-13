import {
  EvaluationContext,
  Provider,
  ResolutionDetails,
} from '@openfeature/nodejs-sdk';
import { Service } from './service/service';
import { GRPCService } from './service/grpc/service';
import { Protocol } from './service/grpc/protocol';

export interface FlagdProviderOptions {
  host?: string;
  port?: number;
  // Should this be called protocol?
  protocol?: Protocol;
  /**
   * When set, a unix socket connection is used.
   *
   * @example "/tmp/flagd.socks"
   */
  socketPath?: string;
}

export class FlagdProvider implements Provider {
  metadata = {
    name: 'flagd Provider',
  };

  private readonly service: Service;

  constructor(options?: FlagdProviderOptions, service?: Service) {
    const { host, port, protocol, socketPath }: FlagdProviderOptions = {
      host: 'localhost',
      port: 8013,
      protocol: 'http',
      ...options,
    };

    this.service = service
      ? service
      : new GRPCService({
          host,
          port,
          protocol,
          socketPath,
        });
  }

  resolveBooleanEvaluation(
    flagKey: string,
    _: boolean,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    return this.service.resolveBoolean(flagKey, transformedContext);
  }

  resolveStringEvaluation(
    flagKey: string,
    _: string,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    return this.service.resolveString(flagKey, transformedContext);
  }

  resolveNumberEvaluation(
    flagKey: string,
    _: number,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    return this.service.resolveNumber(flagKey, transformedContext);
  }

  resolveObjectEvaluation<U extends object>(
    flagKey: string,
    _: U,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    return this.service.resolveObject(flagKey, transformedContext);
  }
}
