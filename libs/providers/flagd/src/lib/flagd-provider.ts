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
  protocol?: Protocol;
}

export class FlagdProvider implements Provider {
  metadata = {
    name: 'flagd Provider',
  };

  private readonly service: Service;

  constructor(options?: FlagdProviderOptions, service?: GRPCService) {
    const { host, port, protocol }: FlagdProviderOptions = {
      host: 'localhost',
      port: 8013,
      protocol: 'http',
      ...options,
    };

    this.service = service ? service : new GRPCService({
      host,
      port,
      protocol,
    });
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    return this.service.resolveBoolean(
      flagKey,
      defaultValue,
      transformedContext
    );
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    return this.service.resolveString(
      flagKey,
      defaultValue,
      transformedContext
    );
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    return this.service.resolveNumber(
      flagKey,
      defaultValue,
      transformedContext
    );
  }

  resolveObjectEvaluation<U extends object>(
    flagKey: string,
    defaultValue: U,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    return this.service.resolveObject(
      flagKey,
      defaultValue,
      transformedContext
    );
  }
}
